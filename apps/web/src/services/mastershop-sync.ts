import { prisma } from '@/lib/prisma';
import {
  listAllOrders,
  normalizePhone,
  mastershopStatusToCrm,
  appendStatusHistory,
  MastershopOrder,
  ListOrdersFilter,
} from '@/services/mastershop';

export interface SyncResult {
  success: boolean;
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: number;
  syncedAt: string;
}

async function getIntegration() {
  let integration = await prisma.integrationConfig.findFirst({
    where: { platform: 'MASTERSHOP', isActive: true },
  });
  if (!integration) {
    integration = await prisma.integrationConfig.create({
      data: { platform: 'MASTERSHOP', name: 'Mastershop', credentials: {}, settings: {}, isActive: true },
    });
  }
  return integration;
}

async function upsertOrder(order: MastershopOrder, integrationId: string): Promise<'created' | 'updated' | 'unchanged'> {
  const phone = normalizePhone(order.clientInfo.phone);
  const name = order.clientInfo.fullName?.trim() || 'Sin nombre';
  const crmStatus = mastershopStatusToCrm(order.orderStatus) as any;
  const externalId = String(order.idOrder);
  const orderDate = new Date(order.createdAt);
  const totalAmount = order.totalOrder ?? order.totalProvider ?? 0;
  const trackingNumber = order.carrierTrackingCode || null;

  const customer = await prisma.customer.upsert({
    where: { phone },
    create: {
      phone,
      name,
      city: order.clientInfo.city || null,
      department: order.clientInfo.state || null,
      status: 'NEW',
      firstPurchaseAt: orderDate,
      lastPurchaseAt: orderDate,
    },
    update: {
      name,
      city: order.clientInfo.city || undefined,
      department: order.clientInfo.state || undefined,
    },
  });

  const existingOrder = await prisma.order.findFirst({ where: { shopifyOrderId: externalId } });

  let orderId: string;
  let action: 'created' | 'updated' | 'unchanged';

  if (existingOrder) {
    const statusChanged = existingOrder.status !== crmStatus;
    const dateWrong = Math.abs(existingOrder.createdAt.getTime() - orderDate.getTime()) > 60_000;
    const trackingChanged = trackingNumber !== null && trackingNumber !== existingOrder.trackingNumber;

    if (statusChanged || trackingChanged) {
      await prisma.order.update({
        where: { id: existingOrder.id },
        data: {
          status: crmStatus,
          totalAmount: totalAmount || existingOrder.totalAmount,
          trackingNumber: trackingNumber ?? existingOrder.trackingNumber,
          ...(crmStatus === 'DELIVERED' && { deliveredAt: existingOrder.deliveredAt ?? new Date() }),
          ...(statusChanged && {
            statusHistory: appendStatusHistory(existingOrder.statusHistory, {
              status: crmStatus,
              mastershopStatus: order.orderStatus,
              carrier: order.carrierName,
              changedAt: new Date().toISOString(),
            }),
          }),
        },
      });
    }

    // Mastershop es la fuente de verdad para la fecha real del pedido
    if (dateWrong) {
      await prisma.$executeRaw`
        UPDATE orders SET created_at = ${orderDate}::timestamptz WHERE id = ${existingOrder.id}
      `;
    }

    orderId = existingOrder.id;
    action = statusChanged || trackingChanged || dateWrong ? 'updated' : 'unchanged';
  } else {
    const newOrder = await prisma.order.create({
      data: {
        shopifyOrderId: externalId,
        shopifyOrderNumber: order.externalOrderId || externalId,
        customerId: customer.id,
        integrationId,
        status: crmStatus,
        totalAmount,
        currency: order.currency || 'COP',
        trackingNumber,
        items: order.items ?? [],
        statusHistory: [{
          status: crmStatus,
          mastershopStatus: order.orderStatus,
          carrier: order.carrierName,
          changedAt: new Date().toISOString(),
        }],
        ...(crmStatus === 'DELIVERED' && { deliveredAt: orderDate }),
      },
    });
    await prisma.$executeRaw`
      UPDATE orders SET created_at = ${orderDate}::timestamptz WHERE id = ${newOrder.id}
    `;
    orderId = newOrder.id;
    action = 'created';
  }

  if (trackingNumber) {
    await prisma.mastershopGuide.upsert({
      where: { guideNumber: trackingNumber },
      create: {
        guideNumber: trackingNumber,
        orderId,
        customerId: customer.id,
        carrier: order.carrierName || null,
        status: order.orderStatus,
        statusDetail: order.lastCarrierStatusUpdate || null,
        lastSyncedAt: new Date(),
        events: [{ status: order.orderStatus, at: new Date().toISOString() }] as any,
      },
      update: {
        status: order.orderStatus,
        statusDetail: order.lastCarrierStatusUpdate || null,
        lastSyncedAt: new Date(),
        ...(crmStatus === 'DELIVERED' && { deliveredAt: new Date() }),
      },
    });
  }

  return action;
}

// Recalcula métricas de clientes a partir de sus pedidos reales
export async function recalcCustomerStats() {
  await prisma.$executeRaw`
    UPDATE customers c
    SET
      total_orders = sub.cnt,
      ltv = sub.ltv,
      first_purchase_at = sub.first_at,
      last_purchase_at = sub.last_at,
      status = CASE
        WHEN sub.cnt >= 3 THEN 'RECURRING'::"customer_status"
        WHEN sub.cnt >= 1 THEN 'ACTIVE'::"customer_status"
        ELSE 'NEW'::"customer_status"
      END
    FROM (
      SELECT o.customer_id, COUNT(*) AS cnt, COALESCE(SUM(o.total_amount), 0) AS ltv,
             MIN(o.created_at) AS first_at, MAX(o.created_at) AS last_at
      FROM orders o GROUP BY o.customer_id
    ) sub
    WHERE sub.customer_id = c.id
  `;
}

function isoDay(msFromNow: number): string {
  return new Date(Date.now() + msFromNow).toISOString().slice(0, 10);
}

// La API de Mastershop responde 504 con rangos muy amplios: partimos la
// ventana en tramos de máximo 30 días y deduplicamos por idOrder.
async function listOrdersInWindow(days: number): Promise<MastershopOrder[]> {
  const CHUNK = 30;
  const DAY = 86_400_000;
  const byId = new Map<number, MastershopOrder>();
  for (let hi = days; hi > 0; hi -= CHUNK) {
    const lo = Math.max(hi - CHUNK, -1); // -1 → mañana, para cubrir el día de hoy
    const filter: ListOrdersFilter = {
      startDate: isoDay(-hi * DAY),
      finalDate: isoDay(-lo * DAY),
    };
    const batch = await listAllOrders(filter);
    for (const o of batch) byId.set(o.idOrder, o);
  }
  return Array.from(byId.values());
}

/**
 * Sincroniza pedidos de Mastershop → CRM.
 * Sin filtro explícito cubre los últimos `days` días (la API sin rango
 * solo devuelve ~7 días). Los webhooks cubren el tiempo real; este sync
 * es la red de seguridad que corrige cualquier evento perdido.
 */
export async function runMastershopSync(opts: { filter?: ListOrdersFilter; days?: number } = {}): Promise<SyncResult> {
  const integration = await getIntegration();

  const orders = opts.filter
    ? await listAllOrders(opts.filter)
    : await listOrdersInWindow(opts.days ?? 30);

  let created = 0, updated = 0, unchanged = 0, errors = 0;

  // Lotes de 5 en paralelo para caber en maxDuration; un reintento porque
  // dos pedidos del mismo cliente en el mismo lote pueden chocar en el
  // upsert del cliente (restricción única del teléfono).
  const BATCH = 5;
  for (let i = 0; i < orders.length; i += BATCH) {
    const batch = orders.slice(i, i + BATCH);
    await Promise.all(batch.map(async order => {
      try {
        let action: 'created' | 'updated' | 'unchanged';
        try {
          action = await upsertOrder(order, integration.id);
        } catch {
          action = await upsertOrder(order, integration.id);
        }
        if (action === 'created') created++;
        else if (action === 'updated') updated++;
        else unchanged++;
      } catch (e) {
        errors++;
        console.error(`[Mastershop sync] pedido ${order.idOrder}:`, e);
      }
    }));
  }

  await prisma.integrationConfig.update({
    where: { id: integration.id },
    data: { lastSyncAt: new Date() },
  });

  await recalcCustomerStats();

  return {
    success: true,
    total: orders.length,
    created,
    updated,
    unchanged,
    errors,
    syncedAt: new Date().toISOString(),
  };
}
