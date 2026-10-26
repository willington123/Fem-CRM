import { NextRequest, NextResponse } from 'next/server';
import { OrderStatus } from '@prisma/client';
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth-server';
import { can } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { appendStatusHistory, recalcCustomer } from '@/services/orders';
import { runStep, stepForStatus } from '@/services/order-flow';

const VALID = new Set<string>(Object.values(OrderStatus));

/**
 * Cambia el estado de un pedido y, opcionalmente, su guía y transportadora.
 * Si el estado tiene un paso de flujo encendido, sale su WhatsApp.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!can(user.role, 'orders.edit')) return forbidden();

  const body = await req.json().catch(() => ({}));
  const status: string = body.status;
  if (!VALID.has(status)) {
    return NextResponse.json({ error: 'Estado de pedido no válido' }, { status: 400 });
  }
  const trackingNumber = typeof body.trackingNumber === 'string' ? body.trackingNumber.trim() || null : undefined;
  const carrier        = typeof body.carrier === 'string' ? body.carrier.trim() || null : undefined;

  const current = await prisma.order.findUnique({ where: { id: params.id } });
  if (!current) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });

  const statusChanged = current.status !== status;
  const guideAdded    = !current.trackingNumber && !!trackingNumber;

  const order = await prisma.order.update({
    where: { id: params.id },
    data: {
      status: status as OrderStatus,
      ...(trackingNumber !== undefined && { trackingNumber }),
      ...(carrier !== undefined && { carrier }),
      ...(statusChanged && {
        // `{ push: … }` no existe para campos Json: reemplazaba todo el historial.
        statusHistory: appendStatusHistory(current.statusHistory, {
          status,
          source: 'crm',
          changedAt: new Date().toISOString(),
          changedBy: user.id,
        }),
      }),
      ...(status === 'CONFIRMED' && !current.confirmedAt && { confirmedAt: new Date() }),
      ...(status === 'DELIVERED' && { deliveredAt: current.deliveredAt ?? new Date() }),
    },
    include: { customer: true },
  });

  // Cancelar o devolver cambia el valor real de la clienta.
  if (statusChanged) await recalcCustomer(order.customerId);

  // Al moverlo a mano (o al añadir la guía que faltaba) sale el paso del flujo.
  // runStep no repite un paso que ya se mandó a este pedido.
  const step = stepForStatus(status);
  const flow = step && (statusChanged || guideAdded) ? await runStep(order.id, step) : null;

  return NextResponse.json({ ...order, flow });
}
