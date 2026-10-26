'use client';
import { useState } from 'react';
import { X, Loader2, AlertCircle, CheckCircle2, MapPin, Package } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { cn, formatCOP, formatDate, ORDER_STATUS_LABELS, FLOW_RESULT_TEXT } from '@/lib/utils';

export interface OrderDetail {
  id: string;
  orderNumber?: string | null;
  status: string;
  totalAmount: number | string;
  createdAt: string;
  trackingNumber?: string | null;
  carrier?: string | null;
  notes?: string | null;
  items?: { name: string; quantity: number; price: number }[] | null;
  shippingAddress?: Record<string, string> | null;
  customer: { id: string; name: string; phone: string; city?: string | null };
}

/** Orden en que avanza un pedido; es el orden del selector. */
export const STATUS_ORDER = [
  'PENDING_CONFIRMATION', 'CONFIRMED', 'PREPARING', 'DISPATCHED', 'IN_TRANSIT',
  'OUT_FOR_DELIVERY', 'IN_DESTINATION', 'DELIVERED', 'FAILED_DELIVERY', 'RETURNED', 'CANCELLED',
];

/** Estados en los que el mensaje cita la guía. */
const NEEDS_GUIDE = ['DISPATCHED', 'IN_TRANSIT', 'IN_DESTINATION'];

export function OrderUpdateModal({ order, onClose, onSaved, readOnly = false }: {
  order: OrderDetail;
  readOnly?: boolean;
  onClose: () => void;
  onSaved: (o: OrderDetail) => void;
}) {
  const [status, setStatus]   = useState(order.status);
  const [guide, setGuide]     = useState(order.trackingNumber ?? '');
  const [carrier, setCarrier] = useState(order.carrier ?? '');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [result, setResult]   = useState<string | null>(null);

  const addr  = order.shippingAddress ?? {};
  const items = Array.isArray(order.items) ? order.items : [];
  const unchanged = status === order.status && guide === (order.trackingNumber ?? '') && carrier === (order.carrier ?? '');

  async function save() {
    setError('');
    setSaving(true);
    try {
      const saved = await api.patch<OrderDetail & { flow: string | null }>(`/api/orders/${order.id}/status`, {
        status, trackingNumber: guide, carrier,
      });
      onSaved(saved);
      setResult(saved.flow ? FLOW_RESULT_TEXT[saved.flow] ?? 'Guardado.' : 'Guardado. Este cambio no envía mensaje.');
    } catch (e: any) {
      setError(e.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="Actualizar pedido"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-100">
          <div>
            <h2 className="text-base font-bold text-ink">Pedido {order.orderNumber || order.id.slice(0, 8)}</h2>
            <p className="text-xs text-ink-muted">{order.customer.name} · {order.customer.phone} · {formatDate(order.createdAt)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-brand-50" aria-label="Cerrar">
            <X className="w-4 h-4 text-ink-muted" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Resumen */}
          <div className="rounded-xl border border-brand-100 bg-[#FAFBFE] p-3 space-y-2">
            {items.map((i, k) => (
              <div key={k} className="flex justify-between text-sm">
                <span className="text-ink-soft">{i.quantity}× {i.name}</span>
                <span className="text-ink tabular-nums">{formatCOP(i.quantity * i.price)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-bold border-t border-brand-100 pt-2">
              <span className="text-ink">Total</span>
              <span className="text-action-600 tabular-nums">{formatCOP(Number(order.totalAmount))}</span>
            </div>
            {(addr.address || addr.address1 || addr.city) && (
              <p className="text-xs text-ink-muted flex gap-1.5 pt-1">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                {[addr.address || addr.address1, addr.reference, addr.city, addr.state].filter(Boolean).join(' · ')}
              </p>
            )}
            {order.notes && <p className="text-xs text-ink-muted">Nota: {order.notes}</p>}
          </div>

          {/* Estado */}
          <div>
            <label className="text-sm font-medium text-ink-soft">Estado</label>
            <select
              value={status}
              onChange={e => { setStatus(e.target.value); setResult(null); }}
              disabled={readOnly}
              className="mt-1 w-full h-9 rounded-lg border border-input bg-background px-3 text-sm"
            >
              {STATUS_ORDER.map(s => <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-ink-soft">Número de guía</label>
              <Input value={guide} disabled={readOnly} onChange={e => { setGuide(e.target.value); setResult(null); }} className="mt-1" placeholder="Ej. 240110000123" />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-soft">Transportadora</label>
              <Input value={carrier} disabled={readOnly} onChange={e => { setCarrier(e.target.value); setResult(null); }} className="mt-1" placeholder="Ej. Servientrega" list="carriers" />
              <datalist id="carriers">
                {['Servientrega', 'Interrapidísimo', 'Coordinadora', 'Envía', 'TCC', 'Deprisa'].map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>

          {NEEDS_GUIDE.includes(status) && !guide.trim() && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex gap-1.5">
              <Package className="w-3.5 h-3.5 shrink-0 mt-px" />
              El WhatsApp de este paso cita la guía: no saldrá hasta que la agregues.
            </p>
          )}

          {result && (
            <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" /> {result}
            </p>
          )}
          {error && (
            <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" /> {error}</p>
          )}
        </div>

        <div className="border-t border-brand-100 px-6 py-4 flex justify-end gap-2">
          <a href={`/customers/${order.customer.id}`} className="mr-auto px-3 h-10 inline-flex items-center text-sm font-semibold text-ink-soft hover:text-action-600">
            Ver clienta
          </a>
          <button onClick={onClose} className="px-4 h-10 rounded-xl border border-brand-200 text-sm font-semibold text-ink-soft hover:bg-brand-50">
            Cerrar
          </button>
          {!readOnly && <button
            onClick={save}
            disabled={saving || unchanged}
            className={cn('px-5 h-10 rounded-xl bg-action-600 hover:bg-action-700 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-2')}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar
          </button>}
        </div>
      </div>
    </div>
  );
}
