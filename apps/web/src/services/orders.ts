import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/** Teléfono colombiano en formato E.164 (+57XXXXXXXXXX). */
export function normalizePhone(raw: string | number): string {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('57') && digits.length === 12) return `+${digits}`;
  return `+57${digits}`;
}

export interface StatusHistoryEntry {
  status: string;
  changedAt: string;
  [key: string]: unknown;
}

/**
 * Agrega una entrada al historial de estados de un pedido.
 *
 * `statusHistory` es Json, no un arreglo escalar: `{ push: … }` de Prisma NO
 * funciona ahí (escribe el objeto literal y pisa el historial). Se lee el valor
 * actual, se normaliza a arreglo —rescatando las entradas que quedaron como
 * `{ push: … }` por ese error— y se devuelve el arreglo completo.
 */
export function appendStatusHistory(current: unknown, entry: StatusHistoryEntry): Prisma.InputJsonValue {
  let history: StatusHistoryEntry[] = [];

  if (Array.isArray(current)) {
    history = current as StatusHistoryEntry[];
  } else if (current && typeof current === 'object') {
    const salvaged = (current as { push?: StatusHistoryEntry }).push;
    if (salvaged) history = [salvaged];
  }

  return [...history, entry] as unknown as Prisma.InputJsonValue;
}

/** Número legible para un pedido tomado por WhatsApp: WA-AAMMDD-XXXX. */
export function newOrderNumber(date = new Date()): string {
  const ymd = date.toISOString().slice(2, 10).replace(/-/g, '');
  const tail = crypto.randomBytes(3).toString('hex').slice(0, 4).toUpperCase();
  return `WA-${ymd}-${tail}`;
}

/** Recalcula pedidos, LTV, fechas y estado de una clienta a partir de sus pedidos reales. */
export async function recalcCustomer(customerId: string) {
  await prisma.$executeRaw`
    UPDATE customers SET
      total_orders = (SELECT COUNT(*) FROM orders WHERE customer_id = ${customerId} AND status <> 'CANCELLED'),
      ltv = (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE customer_id = ${customerId} AND status NOT IN ('CANCELLED', 'RETURNED')),
      first_purchase_at = (SELECT MIN(created_at) FROM orders WHERE customer_id = ${customerId}),
      last_purchase_at = (SELECT MAX(created_at) FROM orders WHERE customer_id = ${customerId}),
      status = CASE
        WHEN (SELECT COUNT(*) FROM orders WHERE customer_id = ${customerId} AND status <> 'CANCELLED') >= 3 THEN 'RECURRING'::"customer_status"
        WHEN (SELECT COUNT(*) FROM orders WHERE customer_id = ${customerId} AND status <> 'CANCELLED') >= 1 THEN 'ACTIVE'::"customer_status"
        ELSE status
      END
    WHERE id = ${customerId}
  `;
}
