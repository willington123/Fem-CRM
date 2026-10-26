'use client';
import { useEffect, useMemo, useState } from 'react';
import { X, Plus, Trash2, Loader2, AlertCircle, CheckCircle2, ShoppingBag } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { cn, formatCOP, FLOW_RESULT_TEXT } from '@/lib/utils';

interface Props {
  customerId: string;
  conversationId?: string;
  /** Lo que ya se sabe de la clienta por la conversación. */
  initial: { name: string; phone: string; city?: string | null };
  onClose: () => void;
  onCreated: (order: { id: string; orderNumber: string }) => void;
}

interface Row { name: string; quantity: string; price: string }

const emptyRow = (): Row => ({ name: '', quantity: '1', price: '' });
/** "89.900" o "$ 89,900" → 89900 */
const toNumber = (s: string) => Number(s.replace(/[^\d]/g, '')) || 0;

export function CreateOrderModal({ customerId, conversationId, initial, onClose, onCreated }: Props) {
  const [name, setName]         = useState(initial.name === 'Nuevo contacto' ? '' : initial.name);
  const [email, setEmail]       = useState('');
  const [rows, setRows]         = useState<Row[]>([emptyRow()]);
  const [shipping, setShipping] = useState('');
  const [address, setAddress]   = useState('');
  const [city, setCity]         = useState(initial.city ?? '');
  const [state, setState]       = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes]       = useState('');
  const [sendConfirmation, setSendConfirmation] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [done, setDone]         = useState<{ id: string; orderNumber: string; confirmation: string | null } | null>(null);

  // La dirección y los datos del último pedido ahorran escribir de nuevo.
  useEffect(() => {
    api.get<any>(`/api/customers/${customerId}`).then(c => {
      if (c.email) setEmail(e => e || c.email);
      if (c.department) setState(s => s || c.department);
      const last = c.orders?.[0]?.shippingAddress;
      if (last) {
        setAddress(a => a || last.address || last.address1 || '');
        setCity(x => x || last.city || '');
        setState(s => s || last.state || last.province || '');
        setReference(r => r || last.reference || '');
      }
    }).catch(() => {});
  }, [customerId]);

  const subtotal = useMemo(
    () => rows.reduce((sum, r) => sum + toNumber(r.quantity) * toNumber(r.price), 0),
    [rows],
  );
  const total = subtotal + toNumber(shipping);

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function submit() {
    setError('');
    const items = rows
      .filter(r => r.name.trim())
      .map(r => ({ name: r.name.trim(), quantity: toNumber(r.quantity), price: toNumber(r.price) }));

    if (!items.length) return setError('Agrega al menos un producto.');
    if (items.some(i => i.quantity < 1)) return setError('Cada producto necesita una cantidad de 1 o más.');
    if (items.some(i => i.price <= 0)) return setError('Falta el precio de algún producto.');
    if (!address.trim() || !city.trim()) return setError('La dirección y la ciudad son obligatorias.');

    setSaving(true);
    try {
      const res = await api.post<{ order: { id: string; orderNumber: string }; confirmation: string | null }>('/api/orders', {
        customerId,
        conversationId,
        customer: { name: name.trim(), email: email.trim() || undefined },
        items,
        shippingCost: toNumber(shipping),
        address: { address, city, state, reference },
        notes: notes.trim() || undefined,
        sendConfirmation,
      });
      setDone({ ...res.order, confirmation: res.confirmation });
      onCreated(res.order);
    } catch (e: any) {
      setError(e.message || 'No se pudo crear el pedido.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="Crear pedido"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-100">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-action-600" />
            <div>
              <h2 className="text-base font-bold text-ink">Crear pedido</h2>
              <p className="text-xs text-ink-muted">{initial.phone}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-brand-50" aria-label="Cerrar">
            <X className="w-4 h-4 text-ink-muted" />
          </button>
        </div>

        {done ? (
          <div className="p-8 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
            <p className="text-lg font-bold text-ink">Pedido {done.orderNumber} creado</p>
            <p className="text-sm text-ink-soft">
              {done.confirmation
                ? FLOW_RESULT_TEXT[done.confirmation] ?? ''
                : 'Quedó como Confirmado. Cuando lo despaches, cámbiale el estado en Pedidos y agrega la guía.'}
            </p>
            <div className="flex justify-center gap-2 pt-2">
              <a href="/orders" className="px-4 h-9 inline-flex items-center rounded-xl border border-brand-200 text-sm font-semibold text-ink-soft hover:bg-brand-50">
                Ver pedidos
              </a>
              <button onClick={onClose} className="px-4 h-9 rounded-xl bg-action-600 hover:bg-action-700 text-white text-sm font-semibold">
                Volver al chat
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {/* Clienta */}
              <section className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-ink-soft">Nombre completo</label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="Como aparece en el documento" className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium text-ink-soft">Correo <span className="text-ink-muted font-normal">· opcional</span></label>
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1" />
                </div>
              </section>

              {/* Productos */}
              <section>
                <p className="text-sm font-medium text-ink-soft mb-2">Productos</p>
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_70px_120px_32px] gap-2 text-[11px] text-ink-muted px-1">
                    <span>Producto</span><span>Cant.</span><span>Precio unitario</span><span />
                  </div>
                  {rows.map((r, i) => (
                    <div key={i} className="grid grid-cols-[1fr_70px_120px_32px] gap-2">
                      <Input value={r.name} onChange={e => setRow(i, { name: e.target.value })} placeholder="Nombre del producto" aria-label="Producto" />
                      <Input value={r.quantity} onChange={e => setRow(i, { quantity: e.target.value })} inputMode="numeric" aria-label="Cantidad" />
                      <Input value={r.price} onChange={e => setRow(i, { price: e.target.value })} inputMode="numeric" placeholder="$ 0" aria-label="Precio" />
                      <button
                        onClick={() => setRows(rs => (rs.length > 1 ? rs.filter((_, j) => j !== i) : [emptyRow()]))}
                        className="h-9 w-8 flex items-center justify-center rounded-lg text-ink-muted hover:text-action-600 hover:bg-brand-50"
                        aria-label="Quitar producto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setRows(rs => [...rs, emptyRow()])}
                    className="flex items-center gap-1.5 text-xs font-semibold text-action-600 hover:text-action-700 px-1 py-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Otro producto
                  </button>
                </div>
              </section>

              {/* Envío */}
              <section className="space-y-3">
                <p className="text-sm font-medium text-ink-soft">Dirección de entrega</p>
                <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Calle 10 # 20-30, apto 401" aria-label="Dirección" />
                <div className="grid grid-cols-3 gap-3">
                  <Input value={city} onChange={e => setCity(e.target.value)} placeholder="Ciudad" aria-label="Ciudad" />
                  <Input value={state} onChange={e => setState(e.target.value)} placeholder="Departamento" aria-label="Departamento" />
                  <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Barrio / referencia" aria-label="Barrio o referencia" />
                </div>
                <div className="grid grid-cols-3 gap-3 items-end">
                  <div>
                    <label className="text-xs text-ink-muted">Costo de envío <span className="font-normal">· opcional</span></label>
                    <Input value={shipping} onChange={e => setShipping(e.target.value)} inputMode="numeric" placeholder="$ 0" className="mt-1" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-ink-muted">Notas internas <span className="font-normal">· opcional</span></label>
                    <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej. entregar después de las 2 p. m." className="mt-1" />
                  </div>
                </div>
              </section>

              {/* Confirmación */}
              <section className="space-y-2">
                <p className="text-sm font-medium text-ink-soft">Confirmación</p>
                {[
                  { value: false, title: 'Ya confirmó en el chat', hint: 'El pedido queda Confirmado y no se envía nada.' },
                  { value: true,  title: 'Enviar plantilla de confirmación', hint: 'Queda Por confirmar y sale el WhatsApp con los botones Confirmar / Tengo dudas (si ese flujo está encendido).' },
                ].map(o => (
                  <label
                    key={String(o.value)}
                    className={cn(
                      'flex gap-3 items-start rounded-xl border px-3 py-2.5 cursor-pointer transition-colors',
                      sendConfirmation === o.value ? 'border-action-500 bg-brand-50' : 'border-brand-100 hover:bg-brand-50',
                    )}
                  >
                    <input
                      type="radio"
                      name="confirmation"
                      checked={sendConfirmation === o.value}
                      onChange={() => setSendConfirmation(o.value)}
                      className="mt-1 accent-[#0050D6]"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-ink">{o.title}</span>
                      <span className="block text-xs text-ink-muted mt-0.5">{o.hint}</span>
                    </span>
                  </label>
                ))}
              </section>
            </div>

            <div className="border-t border-brand-100 px-6 py-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                {error ? (
                  <p className="text-sm text-rose-700 flex items-center gap-1.5"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</p>
                ) : (
                  <p className="text-sm text-ink-soft">
                    Total <span className="text-lg font-bold text-action-600 ml-1 tabular-nums">{formatCOP(total)}</span>
                    {toNumber(shipping) > 0 && <span className="text-xs text-ink-muted ml-2">incluye envío</span>}
                  </p>
                )}
              </div>
              <button onClick={onClose} className="px-4 h-10 rounded-xl border border-brand-200 text-sm font-semibold text-ink-soft hover:bg-brand-50">
                Cancelar
              </button>
              <button
                onClick={submit}
                disabled={saving}
                className="px-5 h-10 rounded-xl bg-action-600 hover:bg-action-700 disabled:opacity-60 text-white text-sm font-semibold flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Crear pedido
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
