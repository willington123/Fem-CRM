import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { normalizePhone, appendStatusHistory } from '@/services/mastershop';
import { idStatusToCrm, stepFromEvent, runStep } from '@/services/order-flow';

function verifySignature(body: string, signature: string | null): boolean {
  const secret = process.env.MASTERSHOP_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!signature) return false;

  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature.replace('sha256=', '')),
      Buffer.from(expected),
    );
  } catch {
    return false;
  }
}

// Estructura real del webhook de Mastershop
interface WebhookBody {
  eventName?: string;
  id_order?: number;
  id_status?: number;
  external_order_id?: string;
  customer?: {
    full_name: string;
    phone: string | number;
    default_address?: {
      city?: string;
      state?: string;
      address1?: string;
      address2?: string;
      zip?: string;
    };
  };
  order_logistics?: {
    carrier_tracking_code?: string;
    carrier_name?: string;
    url_tracking?: string;
  };
  order_transaction?: { total?: number; currency?: string };
  order_Items?: any[];
  date_created_order?: string;
  date_update_order?: string;
}

/**
 * Dirección de envío a partir del webhook. Hasta ahora no se guardaba y los 626
 * pedidos tenían `shippingAddress` en null, así que la plantilla de confirmación
 * no tenía con qué llenar {{3}} (dirección) ni {{4}} (ciudad).
 */
function buildShippingAddress(body: WebhookBody): Record<string, string> | null {
  const a = body.customer?.default_address;
  if (!a?.address1 && !a?.city) return null;

  return {
    address: [a.address1, a.address2].filter(Boolean).join(' — '),
    city: a.city ?? '',
    state: a.state ?? '',
    zip: a.zip ?? '',
  };
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-mastershop-signature');

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 });
  }

  const body = JSON.parse(rawBody) as WebhookBody;

  await processMastershopEvent(body).catch(async e => {
    console.error('[Mastershop webhook]', e);
  });

  return NextResponse.json({ received: true });
}

async function processMastershopEvent(body: WebhookBody) {
  const webhookEvent = await prisma.webhookEvent.create({
    data: {
      platform: 'MASTERSHOP',
      eventType: body.eventName ?? 'order.status_changed',
      status: 'PENDING',
      payload: body as any,
      headers: {},
    },
  });

  if (!body.id_order) {
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { status: 'IGNORED', processedAt: new Date(), error: 'Sin id_order' },
    });
    return;
  }

  const crmStatus = idStatusToCrm(body.id_status, body.eventName);
  if (!crmStatus) {
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { status: 'IGNORED', processedAt: new Date(), error: `id_status desconocido: ${body.id_status}` },
    });
    return;
  }

  const trackingNumber = body.order_logistics?.carrier_tracking_code?.trim() || null;
  const orderDate = body.date_created_order ? new Date(body.date_created_order) : new Date();
  const totalAmount = body.order_transaction?.total ?? 0;
  const currency = body.order_transaction?.currency ?? 'COP';

  const existingOrder = await prisma.order.findFirst({
    where: {
      OR: [
        { shopifyOrderId: String(body.id_order) },
        ...(trackingNumber ? [{ trackingNumber }] : []),
      ],
    },
    include: { customer: true },
  });

  let customerId: string;
  let orderId: string;

  if (!existingOrder) {
    if (!body.customer?.phone) {
      await prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: { status: 'IGNORED', processedAt: new Date(), error: 'Sin teléfono de cliente' },
      });
      return;
    }

    const phone = normalizePhone(body.customer.phone);
    const name = body.customer.full_name?.trim() || 'Sin nombre';
    const city = body.customer.default_address?.city || null;
    const department = body.customer.default_address?.state || null;
    const shippingAddress = buildShippingAddress(body);

    let integration = await prisma.integrationConfig.findFirst({
      where: { platform: 'MASTERSHOP', isActive: true },
    });
    if (!integration) {
      integration = await prisma.integrationConfig.create({
        data: { platform: 'MASTERSHOP', name: 'Mastershop', credentials: {}, settings: {}, isActive: true },
      });
    }

    const customer = await prisma.customer.upsert({
      where: { phone },
      create: {
        phone,
        name,
        city,
        department,
        status: 'NEW',
        firstPurchaseAt: orderDate,
        lastPurchaseAt: orderDate,
        updatedAt: new Date(),
      },
      update: {
        name,
        city: city ?? undefined,
        department: department ?? undefined,
        updatedAt: new Date(),
      },
    });

    const newOrder = await prisma.order.create({
      data: {
        shopifyOrderId: String(body.id_order),
        shopifyOrderNumber: body.external_order_id || String(body.id_order),
        customerId: customer.id,
        integrationId: integration.id,
        status: crmStatus as any,
        totalAmount,
        currency,
        trackingNumber,
        items: body.order_Items ?? [],
        ...(shippingAddress && { shippingAddress }),
        updatedAt: new Date(),
        ...(crmStatus === 'DELIVERED' && { deliveredAt: new Date() }),
      },
    });

    // Usar la fecha real del pedido de Mastershop
    await prisma.$executeRaw`
      UPDATE orders SET created_at = ${orderDate}::timestamptz WHERE id = ${newOrder.id}
    `;

    customerId = customer.id;
    orderId = newOrder.id;

    await prisma.$executeRaw`
      UPDATE customers SET
        total_orders = (SELECT COUNT(*) FROM orders WHERE customer_id = ${customer.id}),
        ltv = (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE customer_id = ${customer.id}),
        first_purchase_at = (SELECT MIN(created_at) FROM orders WHERE customer_id = ${customer.id}),
        last_purchase_at = (SELECT MAX(created_at) FROM orders WHERE customer_id = ${customer.id}),
        status = CASE
          WHEN (SELECT COUNT(*) FROM orders WHERE customer_id = ${customer.id}) >= 3 THEN 'RECURRING'::"customer_status"
          WHEN (SELECT COUNT(*) FROM orders WHERE customer_id = ${customer.id}) >= 1 THEN 'ACTIVE'::"customer_status"
          ELSE 'NEW'::"customer_status"
        END
      WHERE id = ${customer.id}
    `;
  } else {
    customerId = existingOrder.customer.id;
    orderId = existingOrder.id;

    const shippingAddress = buildShippingAddress(body);

    await prisma.order.update({
      where: { id: existingOrder.id },
      data: {
        status: crmStatus as any,
        totalAmount: totalAmount || existingOrder.totalAmount,
        ...(shippingAddress && !existingOrder.shippingAddress && { shippingAddress }),
        statusHistory: appendStatusHistory(existingOrder.statusHistory, {
          status: crmStatus,
          idStatus: body.id_status,
          eventName: body.eventName,
          carrier: body.order_logistics?.carrier_name,
          changedAt: new Date().toISOString(),
        }),
        trackingNumber: trackingNumber ?? existingOrder.trackingNumber,
        ...(crmStatus === 'DELIVERED' && { deliveredAt: existingOrder.deliveredAt ?? new Date() }),
      },
    });
  }

  // Upsert MastershopGuide si hay guía
  if (trackingNumber) {
    const statusStr = String(body.id_status ?? '');
    const existingGuide = await prisma.mastershopGuide.findUnique({
      where: { guideNumber: trackingNumber },
      select: { events: true },
    });

    await prisma.mastershopGuide.upsert({
      where: { guideNumber: trackingNumber },
      create: {
        guideNumber: trackingNumber,
        orderId,
        customerId,
        carrier: body.order_logistics?.carrier_name ?? null,
        status: statusStr,
        statusDetail: null,
        lastSyncedAt: new Date(),
        events: [{
          status: statusStr,
          idStatus: body.id_status,
          eventName: body.eventName,
          changedAt: new Date().toISOString(),
        }] as any,
      },
      update: {
        status: statusStr,
        lastSyncedAt: new Date(),
        carrier: body.order_logistics?.carrier_name ?? undefined,
        ...(crmStatus === 'DELIVERED' && { deliveredAt: new Date() }),
        // `{ push: … }` no existe para campos Json: escribía el objeto literal y
        // borraba el historial (mismo bug que ya se corrigió en statusHistory).
        events: appendStatusHistory(existingGuide?.events, {
          status: statusStr,
          idStatus: body.id_status,
          eventName: body.eventName,
          changedAt: new Date().toISOString(),
        }),
      },
    });
  }

  // Flujo de pedido: el paso real viene en eventName, no en id_status.
  // El evento genérico "Cambio de Estado del Pedido" se ignora (llega duplicado).
  const step = stepFromEvent(body.eventName, body.id_status);
  if (step) {
    await runStep(orderId, step).catch(e => console.error('[Flujo] Falló el paso', step, e));
  }

  await prisma.webhookEvent.update({
    where: { id: webhookEvent.id },
    data: { status: 'PROCESSED', processedAt: new Date() },
  });
}
