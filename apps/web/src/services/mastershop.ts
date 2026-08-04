import { Prisma } from '@prisma/client';

const BASE_URL = 'https://prod.api.mastershop.com/api';

export type MastershopOrderStatus =
  | 'Por Confirmar' | 'Pendiente'
  | 'Por Alistar'   | 'Por Recolectar'
  | 'En tránsito'   | 'En Tránsito'
  | 'Recolectada'
  | 'En reparto'    | 'En Reparto'
  | 'En oficina'    | 'En Oficina'
  | 'Entregada'     | 'Cancelada'
  | 'Devuelta'      | 'Reclamaciones';

export interface MastershopOrder {
  idOrder: number;
  externalOrderId: string | null;
  carrierTrackingCode: string;
  items: { name: string; quantity?: number; price?: number }[];
  lastCarrierStatusUpdate: string;
  clientInfo: {
    city: string;
    phone: string | number;
    state: string;
    address: string;
    fullName: string;
  };
  paymentMethod: 'cod' | 'transfer';
  totalOrder: number;
  totalProvider: number;
  currency: string;
  orderStatus: string;
  statusParent: string;
  carrierName: string;
  createdAt: string;
}

export const MASTERSHOP_TO_CRM_STATUS: Record<MastershopOrderStatus, string> = {
  'Por Confirmar':  'PENDING_CONFIRMATION',
  'Pendiente':      'PENDING_CONFIRMATION',
  'Por Alistar':    'PREPARING',
  'Por Recolectar': 'PREPARING',
  'Recolectada':    'IN_TRANSIT',
  'En tránsito':    'IN_TRANSIT',
  'En Tránsito':    'IN_TRANSIT',
  'En reparto':     'IN_TRANSIT',
  'En Reparto':     'IN_TRANSIT',
  'En oficina':     'IN_DESTINATION',
  'En Oficina':     'IN_DESTINATION',
  'Entregada':      'DELIVERED',
  'Cancelada':      'CANCELLED',
  'Devuelta':       'RETURNED',
  'Reclamaciones':  'FAILED_DELIVERY',
};

// Mapa normalizado en minúsculas para manejo robusto de variantes de capitalización
const STATUS_LOWER_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(MASTERSHOP_TO_CRM_STATUS).map(([k, v]) => [k.toLowerCase(), v])
);

export function mastershopStatusToCrm(raw: string): string {
  return MASTERSHOP_TO_CRM_STATUS[raw as MastershopOrderStatus]
    ?? STATUS_LOWER_MAP[raw.toLowerCase()]
    ?? 'PENDING_CONFIRMATION';
}

// Filtro aceptado por POST /orders/list. Sin startDate/finalDate la API
// solo devuelve los últimos ~7 días, por eso el sync siempre pasa un rango.
export interface ListOrdersFilter {
  orderStatusParent?: string;
  orderStatus?: MastershopOrderStatus;
  externalOrderId?: string;
  idOrder?: number;
  startDate?: string; // YYYY-MM-DD
  finalDate?: string; // YYYY-MM-DD
}

function getHeaders() {
  const apiKey = process.env.MASTERSHOP_API_KEY;
  if (!apiKey) throw new Error('MASTERSHOP_API_KEY no configurado');
  return { 'ms-api-key': apiKey, 'Content-Type': 'application/json' };
}

export async function listOrders(filter: ListOrdersFilter = {}, page = 1, limit = 50): Promise<MastershopOrder[]> {
  // La API de Mastershop devuelve 504/5xx transitorios con frecuencia
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${BASE_URL}/orders/list?page=${page}&limit=${limit}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(filter),
    });
    if (res.ok) return res.json();
    if (res.status < 500 || attempt >= MAX_ATTEMPTS) {
      throw new Error(`Mastershop API error: ${res.status}`);
    }
    await new Promise(r => setTimeout(r, 2000 * attempt));
  }
}

export async function listAllOrders(filter: ListOrdersFilter = {}): Promise<MastershopOrder[]> {
  const all: MastershopOrder[] = [];
  let page = 1;
  const MAX_PAGES = 100;
  while (page <= MAX_PAGES) {
    const batch = await listOrders(filter, page, 50);
    if (!batch || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 50) break;
    page++;
    await new Promise(r => setTimeout(r, 300));
  }
  return all;
}

export function normalizePhone(raw: string | number): string {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('57') && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+57${digits}`;
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
 * El campo `statusHistory` es Json (no un array escalar de Prisma), así que la
 * operación `{ push: … }` de Prisma NO funciona: escribe literalmente el objeto
 * y pisa el historial. Aquí leemos el valor actual, lo normalizamos a array
 * —rescatando además las entradas que quedaron corrompidas como `{ push: … }`—
 * y devolvemos el array completo listo para reescribir el campo.
 *
 * Se devuelve como InputJsonValue de Prisma para poder asignarlo directo al
 * campo Json (el tipo del array con índice `unknown` no encaja de otro modo).
 */
export function appendStatusHistory(current: unknown, entry: StatusHistoryEntry): Prisma.InputJsonValue {
  let history: StatusHistoryEntry[] = [];

  if (Array.isArray(current)) {
    history = current as StatusHistoryEntry[];
  } else if (current && typeof current === 'object') {
    // Forma corrompida por el bug anterior: { push: { … } }
    const salvaged = (current as { push?: StatusHistoryEntry }).push;
    if (salvaged) history = [salvaged];
  }

  return [...history, entry] as unknown as Prisma.InputJsonValue;
}
