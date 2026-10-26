'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Package, Clock, MapPin, Search, Pencil } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { OrderUpdateModal, OrderDetail, STATUS_ORDER } from '@/components/order-update-modal';
import { api } from '@/lib/api';
import { cn, formatCOP, formatRelativeTime, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@/lib/utils';

const COLUMN_COLOR: Record<string, string> = {
  PENDING_CONFIRMATION: 'border-yellow-300 bg-yellow-50',
  CONFIRMED:            'border-blue-300 bg-blue-50',
  PREPARING:            'border-indigo-300 bg-indigo-50',
  DISPATCHED:           'border-purple-300 bg-purple-50',
  IN_TRANSIT:           'border-cyan-300 bg-cyan-50',
  OUT_FOR_DELIVERY:     'border-sky-300 bg-sky-50',
  IN_DESTINATION:       'border-teal-300 bg-teal-50',
  DELIVERED:            'border-green-300 bg-green-50',
  FAILED_DELIVERY:      'border-red-300 bg-red-50',
  RETURNED:             'border-brand-200 bg-brand-50',
  CANCELLED:            'border-brand-100 bg-brand-50',
};

const initials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
const orderLabel = (o: OrderDetail) => o.orderNumber || o.id.slice(0, 8);

function OrderCard({ order, onOpen }: { order: OrderDetail; onOpen: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-brand-100 p-4 hover:shadow-md transition-shadow space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar className="w-7 h-7">
            <AvatarFallback className="text-xs">{initials(order.customer.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <Link href={`/customers/${order.customer.id}`} className="text-sm font-semibold text-ink hover:text-pepper-600 leading-tight truncate block">
              {order.customer.name}
            </Link>
            <p className="text-xs text-muted-foreground">{orderLabel(order)}</p>
          </div>
        </div>
        <p className="font-bold text-pepper-600 text-sm shrink-0">{formatCOP(Number(order.totalAmount))}</p>
      </div>

      <div className="space-y-1">
        {order.customer.city && (
          <div className="flex items-center gap-1.5 text-xs text-ink-muted">
            <MapPin className="w-3 h-3" /> {order.customer.city}
          </div>
        )}
        {order.trackingNumber && (
          <div className="flex items-center gap-1.5 text-xs text-ink-muted">
            <Package className="w-3 h-3" /> {order.trackingNumber}{order.carrier && ` · ${order.carrier}`}
          </div>
        )}
        <div className="flex items-center gap-1.5 text-xs text-ink-muted">
          <Clock className="w-3 h-3" /> {formatRelativeTime(order.createdAt)}
        </div>
      </div>

      <button
        onClick={onOpen}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs border border-brand-100 rounded-lg hover:bg-brand-50 transition-colors text-ink-soft font-semibold"
      >
        <Pencil className="w-3 h-3" /> Actualizar
      </button>
    </div>
  );
}

export default function OrdersPage() {
  const [orders, setOrders]   = useState<OrderDetail[]>([]);
  const [view, setView]       = useState<'kanban' | 'list'>('kanban');
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [open, setOpen]       = useState<OrderDetail | null>(null);

  useEffect(() => {
    api.get<{ data: OrderDetail[] }>('/api/orders?limit=1000')
      .then(r => setOrders(r.data ?? []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(o =>
      o.customer.name.toLowerCase().includes(q) ||
      o.customer.phone.includes(q) ||
      (o.orderNumber ?? '').toLowerCase().includes(q) ||
      (o.trackingNumber ?? '').toLowerCase().includes(q),
    );
  }, [orders, search]);

  const grouped = useMemo(() => {
    const g: Record<string, OrderDetail[]> = {};
    for (const s of STATUS_ORDER) g[s] = [];
    for (const o of visible) (g[o.status] ??= []).push(o);
    return g;
  }, [visible]);

  function handleSaved(saved: OrderDetail) {
    setOrders(prev => prev.map(o => (o.id === saved.id ? { ...o, ...saved } : o)));
    setOpen(o => (o && o.id === saved.id ? { ...o, ...saved } : o));
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="sticky top-0 bg-white border-b border-brand-100 px-8 py-4 z-10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-ink">Pedidos</h1>
            <p className="text-sm text-muted-foreground">
              {loading ? 'Cargando…' : `${orders.length} pedidos · se crean desde la bandeja con «Crear pedido»`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Clienta, teléfono, pedido o guía"
                className="h-9 w-64 pl-8 pr-3 rounded-lg border border-brand-100 text-sm bg-white outline-none focus:border-pepper-500"
              />
            </div>
            <div className="flex gap-1 bg-brand-50 rounded-lg p-1">
              {(['kanban', 'list'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                    view === v ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:text-ink-soft',
                  )}
                >
                  {v === 'kanban' ? 'Tablero' : 'Lista'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {view === 'kanban' ? (
        <div className="flex-1 overflow-x-auto p-6">
          <div className="flex gap-4 min-w-max h-full">
            {STATUS_ORDER.map(key => (
              <div key={key} className="w-64 flex flex-col">
                <div className={cn('rounded-xl border-2 px-3 py-2 mb-3', COLUMN_COLOR[key])}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-ink-soft">{ORDER_STATUS_LABELS[key]}</p>
                    <span className="bg-white text-ink-soft text-xs font-bold min-w-5 h-5 px-1 rounded-full flex items-center justify-center shadow-sm">
                      {grouped[key]?.length || 0}
                    </span>
                  </div>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                  {grouped[key]?.map(order => (
                    <OrderCard key={order.id} order={order} onOpen={() => setOpen(order)} />
                  ))}
                  {grouped[key]?.length === 0 && (
                    <div className="text-center py-8 text-ink-muted text-xs">Sin pedidos</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-8">
          <div className="bg-white rounded-xl border border-brand-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-brand-100">
                  {['Pedido', 'Clienta', 'Ciudad', 'Estado', 'Guía', 'Monto', 'Fecha', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-100">
                {visible.map(order => (
                  <tr key={order.id} className="hover:bg-brand-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-sm text-ink-soft">{orderLabel(order)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar className="w-7 h-7"><AvatarFallback className="text-xs">{initials(order.customer.name)}</AvatarFallback></Avatar>
                        <Link href={`/customers/${order.customer.id}`} className="text-sm font-medium text-ink hover:text-pepper-600">{order.customer.name}</Link>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-soft">{order.customer.city || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', ORDER_STATUS_COLORS[order.status])}>
                        {ORDER_STATUS_LABELS[order.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-ink-muted">{order.trackingNumber || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-pepper-600">{formatCOP(Number(order.totalAmount))}</td>
                    <td className="px-4 py-3 text-xs text-ink-muted">{formatRelativeTime(order.createdAt)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => setOpen(order)} className="p-1.5 hover:bg-white rounded-lg" title="Actualizar pedido" aria-label="Actualizar pedido">
                        <Pencil className="w-3.5 h-3.5 text-ink-muted" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {open && <OrderUpdateModal order={open} onClose={() => setOpen(null)} onSaved={handleSaved} />}
    </div>
  );
}
