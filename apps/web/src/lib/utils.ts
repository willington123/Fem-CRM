import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCOP(amount: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount);
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date));
}

export function formatRelativeTime(date: string | Date) {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'ahora';
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return formatDate(date);
}

export const CHANNEL_COLORS: Record<string, string> = {
  WHATSAPP: 'bg-green-500',
  INSTAGRAM: 'bg-pink-500',
  FACEBOOK: 'bg-blue-600',
};

export const CHANNEL_LABELS: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING_CONFIRMATION: 'Por confirmar',
  CONFIRMED: 'Confirmado',
  PREPARING: 'En preparación',
  DISPATCHED: 'Despachado',
  IN_TRANSIT: 'En camino',
  OUT_FOR_DELIVERY: 'En reparto',
  IN_DESTINATION: 'En oficina',
  DELIVERED: 'Entregado',
  FAILED_DELIVERY: 'Novedad',
  RETURNED: 'Devuelto',
  CANCELLED: 'Cancelado',
};

export const ORDER_STATUS_COLORS: Record<string, string> = {
  PENDING_CONFIRMATION: 'bg-yellow-100 text-yellow-800',
  CONFIRMED: 'bg-blue-100 text-blue-800',
  PREPARING: 'bg-indigo-100 text-indigo-800',
  DISPATCHED: 'bg-purple-100 text-purple-800',
  IN_TRANSIT: 'bg-cyan-100 text-cyan-800',
  OUT_FOR_DELIVERY: 'bg-sky-100 text-sky-800',
  IN_DESTINATION: 'bg-teal-100 text-teal-800',
  DELIVERED: 'bg-green-100 text-green-800',
  FAILED_DELIVERY: 'bg-red-100 text-red-800',
  RETURNED: 'bg-brand-50 text-ink',
  CANCELLED: 'bg-brand-50 text-ink-muted',
};

export const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  NEW: 'Nueva',
  ACTIVE: 'Activa',
  AT_RISK: 'En riesgo',
  RECURRING: 'Recurrente',
  LOST: 'Perdida',
};

export const CUSTOMER_STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-700',
  ACTIVE: 'bg-green-100 text-green-700',
  AT_RISK: 'bg-orange-100 text-orange-700',
  RECURRING: 'bg-brand-100 text-action-700',
  LOST: 'bg-brand-50 text-ink-muted',
};

/** Qué pasó con el WhatsApp automático al crear o mover un pedido (ver runStep). */
export const FLOW_RESULT_TEXT: Record<string, string> = {
  sent:     'Se envió el WhatsApp automático de este paso.',
  failed:   'No se pudo enviar el WhatsApp automático. Revisa la conexión de WhatsApp en Ajustes.',
  off:      'El flujo de este paso está apagado: no se envió ningún mensaje.',
  already:  'Este mensaje ya se le había enviado antes; no se repitió.',
  no_guide: 'Falta el número de guía: el mensaje saldrá cuando lo agregues.',
  no_phone: 'La clienta no tiene un número de WhatsApp válido: no se envió mensaje.',
};
