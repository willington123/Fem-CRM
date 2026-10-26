import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth-server';
import { can } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { newOrderNumber, recalcCustomer } from '@/services/orders';
import { runStep } from '@/services/order-flow';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const page   = parseInt(searchParams.get('page')  || '1');
  const limit  = Math.min(parseInt(searchParams.get('limit') || '1000'), 1000);
  const skip   = (page - 1) * limit;

  const where: any = {};
  if (status) where.status = status;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where, skip, take: limit,
      orderBy: { createdAt: 'desc' },
      include: { customer: { select: { id: true, name: true, phone: true, city: true } } },
    }),
    prisma.order.count({ where }),
  ]);

  return NextResponse.json({ data: orders, total });
}

interface ItemInput { name: string; quantity: number; price: number }

/**
 * Crea un pedido tomado por WhatsApp desde la bandeja.
 *
 * `sendConfirmation`: true → queda «Por confirmar» y sale la plantilla de
 * confirmación (si ese flujo está encendido). false → la clienta ya confirmó en
 * el chat y el pedido nace «Confirmado», sin mensaje.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!can(user.role, 'orders.edit')) return forbidden();

  const body = await req.json().catch(() => null);
  if (!body) return bad('Datos del pedido no válidos');

  const { customerId, conversationId, customer: c = {}, address = {}, notes, sendConfirmation } = body;
  const shippingCost = Math.max(0, Number(body.shippingCost) || 0);

  const items: ItemInput[] = Array.isArray(body.items)
    ? body.items
        .map((i: any) => ({ name: String(i?.name ?? '').trim(), quantity: Math.floor(Number(i?.quantity)), price: Number(i?.price) }))
        .filter((i: ItemInput) => i.name)
    : [];
  if (!items.length) return bad('Agrega al menos un producto');
  if (items.some(i => !(i.quantity > 0) || !(i.price >= 0))) return bad('Revisa cantidades y precios');
  if (!String(address.address ?? '').trim() || !String(address.city ?? '').trim()) {
    return bad('La dirección y la ciudad son obligatorias');
  }

  const customer = await prisma.customer.findUnique({ where: { id: String(customerId ?? '') } });
  if (!customer) return bad('Clienta no encontrada', 404);

  const name = String(c.name ?? '').trim();
  const city = String(address.city).trim();
  const state = String(address.state ?? '').trim();
  const shippingAddress = {
    address: String(address.address).trim(),
    city,
    state,
    reference: String(address.reference ?? '').trim(),
  };
  const total = items.reduce((sum, i) => sum + i.quantity * i.price, 0) + shippingCost;
  const status = sendConfirmation ? 'PENDING_CONFIRMATION' : 'CONFIRMED';
  const now = new Date();

  // Lo que se aprende en el chat se queda en la ficha de la clienta.
  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      ...(name && { name }),
      city,
      ...(state && { department: state }),
      ...(c.email && { email: String(c.email).trim() }),
    },
  });

  const order = await prisma.order.create({
    data: {
      orderNumber: newOrderNumber(now),
      customerId: customer.id,
      status,
      totalAmount: total,
      currency: 'COP',
      shippingAddress,
      items: [
        ...items,
        ...(shippingCost ? [{ name: 'Envío', quantity: 1, price: shippingCost, isShipping: true }] : []),
      ] as Prisma.InputJsonValue,
      notes: notes ? String(notes).trim() : null,
      confirmedAt: sendConfirmation ? null : now,
      statusHistory: [{ status, source: 'crm', changedAt: now.toISOString(), changedBy: user.id }],
    },
  });

  await recalcCustomer(customer.id);

  // Nota interna en la conversación: queda a la vista de todo el equipo.
  const conversation = conversationId
    ? await prisma.conversation.findUnique({ where: { id: String(conversationId) } })
    : null;
  if (conversation) {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUTBOUND',
        isInternal: true,
        status: 'SENT',
        content: `🛍 Pedido ${order.orderNumber} creado por ${user.name} · ${items.map(i => `${i.quantity}× ${i.name}`).join(', ')} · ${total.toLocaleString('es-CO')} COP`,
        sentById: user.id === 'demo' ? undefined : user.id,
      },
    });
  }

  const confirmation = sendConfirmation ? await runStep(order.id, 'POR_CONFIRMAR') : null;
  return NextResponse.json({ order, confirmation }, { status: 201 });
}

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}
