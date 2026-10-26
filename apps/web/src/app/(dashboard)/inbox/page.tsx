'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Search, Send, Lock, MessageSquare, Instagram, Facebook,
  Clock, CheckCheck, AlertCircle, ChevronRight, Loader2, X, ShoppingBag
} from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { api } from '@/lib/api';
import { MediaBubble } from '@/components/media-bubble';
import { CreateOrderModal } from '@/components/create-order-modal';

type Channel  = 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK';
type ConvStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';

interface MessageMedia {
  url: string; mimeType: string; size: number;
  filename?: string | null;
}
interface Message {
  id: string; content: string;
  direction: 'INBOUND' | 'OUTBOUND';
  createdAt: string; isInternal?: boolean;
  sentBy?: { id: string; name: string } | null;
  status?: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  media?: MessageMedia | null;
}
interface CustomerInfo {
  id: string; name: string; phone: string;
  city?: string | null; ltv?: string | number | null; totalOrders?: number | null;
}
interface Conversation {
  id: string; channel: Channel; status: ConvStatus;
  tags: string[]; isRead: boolean;
  lastMessageAt: string | null;
  customer: CustomerInfo;
  agent?: { id: string; name: string } | null;
  messages: Message[];
}

const CH = {
  WHATSAPP: { label: 'WhatsApp', short: 'WA', icon: MessageSquare,
    pill: 'bg-[#E8F8F0] text-[#1A7A4A] border border-[#B7DFD0]',
    dot: 'bg-[#25D366]', header: 'from-[#E8F8F0] to-white', activeBg: 'bg-[#1A7A4A]' },
  INSTAGRAM: { label: 'Instagram', short: 'IG', icon: Instagram,
    pill: 'bg-[#FDE8F4] text-[#9B2C6F] border border-[#F4B8DC]',
    dot: 'bg-[#E1306C]', header: 'from-[#FDE8F4] to-white', activeBg: 'bg-[#9B2C6F]' },
  FACEBOOK: { label: 'Facebook', short: 'FB', icon: Facebook,
    pill: 'bg-[#E7EFFE] text-[#1A4A9B] border border-[#B3C8F8]',
    dot: 'bg-[#1877F2]', header: 'from-[#E7EFFE] to-white', activeBg: 'bg-[#1A4A9B]' },
} as const;

interface Template {
  id: string; name: string; content: string;
  variables: string[]; status: string; category: string; language: string;
}

// Rellena {{1}}, {{2}}… con los valores dados (para preview y para el texto guardado)
function fillTemplate(content: string, params: string[]): string {
  return content.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => params[Number(n) - 1] || `{{${n}}}`);
}

/** Texto del mensaje con los enlaces clicables (ubicaciones, rastreo, catálogo). */
function MessageText({ text }: { text: string }) {
  const partes = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {partes.map((parte, i) =>
        /^https?:\/\//.test(parte) ? (
          <a
            key={i}
            href={parte}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 break-all hover:opacity-80"
          >
            {parte}
          </a>
        ) : (
          parte
        ),
      )}
    </>
  );
}

const TPL_STATUS: Record<string, { dot: string; label: string }> = {
  APPROVED: { dot: 'bg-emerald-500', label: 'Aprobada' },
  PENDING:  { dot: 'bg-amber-400',   label: 'En revisión' },
  REJECTED: { dot: 'bg-rose-400',    label: 'Rechazada' },
};

const TPL_CATEGORY: Record<string, string> = {
  CONFIRMATION: 'Confirmación', LOGISTICS: 'Logística', REPURCHASE: 'Recompra',
  SUPPORT: 'Atención', PROMOTIONAL: 'Promocional',
};


// El listado trae el último mensaje (desc, take 1); el detalle los trae todos (asc)
const lastMsg = (c: Conversation): Message | undefined =>
  c.messages.length ? c.messages[c.messages.length - 1] : undefined;

const isWaiting = (c: Conversation) =>
  c.status !== 'RESOLVED' && lastMsg(c)?.direction === 'INBOUND';

function waitPriority(c: Conversation): 'urgent' | 'high' | 'normal' {
  if (!isWaiting(c) || !c.lastMessageAt) return 'normal';
  const mins = (Date.now() - new Date(c.lastMessageAt).getTime()) / 60000;
  return mins > 60 ? 'urgent' : mins > 15 ? 'high' : 'normal';
}

function WaitBadge({ since }: { since: string }) {
  const mins = Math.floor((Date.now() - new Date(since).getTime()) / 60000);
  const hours = Math.floor(mins / 60);
  const label = hours >= 1 ? `${hours}h ${mins % 60}m` : `${mins}m`;
  const urgent = mins > 60;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full',
      urgent ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-700')}>
      <Clock className="w-2.5 h-2.5" />{label} sin resp.
    </span>
  );
}

const initials = (n: string) => n.split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2);

// ─── Avatar con inicial de canal ─────────────────────────────────────────────
function ConvAvatar({ conv, size = 'md' }: { conv: Conversation; size?: 'sm' | 'md' }) {
  const cfg = CH[conv.channel] ?? CH.WHATSAPP;
  const dim = size === 'sm' ? 'w-8 h-8 text-[10px]' : 'w-10 h-10 text-[12px]';
  return (
    <div className="relative shrink-0">
      <div className={cn('rounded-2xl flex items-center justify-center font-black bg-[#FFF8F7] text-[#2E1614]', dim)}>
        {initials(conv.customer.name)}
      </div>
      <span className={cn('absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white flex items-center justify-center', cfg.activeBg)}>
        <cfg.icon className="w-2 h-2 text-white" />
      </span>
    </div>
  );
}

export default function InboxPage() {
  const [convs,    setConvs]    = useState<Conversation[]>([]);
  const [sel,      setSel]      = useState<Conversation | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [sending,  setSending]  = useState(false);
  const [tab,      setTab]      = useState<'pending' | 'all' | 'resolved'>('pending');
  const [filterCh, setFilterCh] = useState<Channel | ''>('');
  const [search,   setSearch]   = useState('');
  const [msg,      setMsg]      = useState('');
  const [internal, setInternal] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTpl,  setShowTpl]  = useState(false);
  const [tplIndex, setTplIndex] = useState(0);
  const [armed,    setArmed]    = useState<{ tpl: Template; params: string[] } | null>(null);
  const [showOrder, setShowOrder] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const selIdRef = useRef<string | null>(null);
  selIdRef.current = sel?.id ?? null;

  const loadConvs = useCallback(async () => {
    try {
      const res = await api.get<{ data: Conversation[]; total: number }>('/api/conversations?limit=100');
      setConvs(res.data);
      return res.data;
    } catch {
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const conv = await api.get<Conversation>(`/api/conversations/${id}`);
      setSel(prev => (selIdRef.current === id || prev === null ? conv : prev));
      setConvs(p => p.map(c => c.id === id ? { ...c, isRead: true } : c));
    } catch { /* la conversación pudo ser eliminada */ }
  }, []);

  // Carga inicial + selección de la primera conversación
  useEffect(() => {
    loadConvs().then(data => {
      if (data.length && !selIdRef.current) loadDetail(data[0].id);
    });
  }, [loadConvs, loadDetail]);

  // Refresco automático: lista + conversación abierta
  useEffect(() => {
    const t = setInterval(() => {
      loadConvs();
      if (selIdRef.current) loadDetail(selIdRef.current);
    }, 8000);
    return () => clearInterval(t);
  }, [loadConvs, loadDetail]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [sel?.id, sel?.messages.length]);

  // Plantillas reales para el selector "/" (aprobadas primero).
  // Si la BD está vacía (arranque en frío), sincroniza con Meta y reintenta.
  useEffect(() => {
    const sortTpls = (list: Template[]) => [...list].sort((a, b) =>
      (a.status === 'APPROVED' ? 0 : 1) - (b.status === 'APPROVED' ? 0 : 1) || a.name.localeCompare(b.name));
    (async () => {
      let list = await api.get<Template[]>('/api/templates').catch(() => [] as Template[]);
      if (list.length === 0) {
        await api.post('/api/templates/sync', {}).catch(() => {});
        list = await api.get<Template[]>('/api/templates').catch(() => [] as Template[]);
      }
      setTemplates(sortTpls(list));
    })();
  }, []);

  const tplQuery = msg.startsWith('/') ? msg.slice(1).toLowerCase() : '';
  const filteredTpls = templates.filter(t =>
    !tplQuery || t.name.toLowerCase().includes(tplQuery) || t.content.toLowerCase().includes(tplQuery));

  // Reinicia el resaltado al abrir/filtrar y mantiene el activo a la vista
  useEffect(() => { setTplIndex(0); }, [tplQuery, showTpl]);
  useEffect(() => {
    pickerRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [tplIndex, showTpl]);

  function selectTemplate(t: Template) {
    if (!sel) return;
    // Prepara los valores de las variables. {{1}} se pre-rellena con el nombre si es un saludo.
    const n = t.variables.length;
    const first = (sel.customer.name || '').trim().split(/\s+/)[0] || '';
    const isGreetingName = /(hola|¡)\s*\{\{\s*1\s*\}\}|\{\{\s*1\s*\}\}\s*,/i.test(t.content);
    const params = Array.from({ length: n }, (_, i) => (i === 0 && isGreetingName ? first : ''));
    setArmed({ tpl: t, params });
    setMsg('');
    setShowTpl(false);
    setTplIndex(0);
  }

  const pending  = convs.filter(isWaiting);
  const filtered = convs.filter(c => {
    // Tab filter
    if (tab === 'pending'  && !isWaiting(c))             return false;
    if (tab === 'resolved' && c.status !== 'RESOLVED')   return false;
    if (tab === 'all'      && c.status === 'RESOLVED')   return false;
    // Channel filter (se combina con el tab)
    if (filterCh && c.channel !== filterCh)              return false;
    // Search
    if (search && !c.customer.name.toLowerCase().includes(search.toLowerCase())
               && !c.customer.phone.includes(search))    return false;
    return true;
  });

  async function send() {
    if (!sel || sending) return;
    const isTpl = !!armed;
    const params = armed?.params ?? [];
    if (isTpl) {
      if (params.some(p => !p.trim())) { alert('Completa todas las variables de la plantilla antes de enviar.'); return; }
    } else if (!msg.trim()) {
      return;
    }

    setSending(true);
    try {
      const payload = isTpl
        ? {
            content: fillTemplate(armed!.tpl.content, params),
            template: { name: armed!.tpl.name, language: armed!.tpl.language || 'es', params },
          }
        : { content: msg, isInternal: internal };
      const m = await api.post<Message & { sendError?: string | null }>(`/api/conversations/${sel.id}/messages`, payload);
      setSel(p => p && p.id === sel.id
        ? { ...p, status: p.status === 'RESOLVED' ? p.status : 'IN_PROGRESS', messages: [...p.messages, m] }
        : p);
      setMsg(''); setInternal(false); setShowTpl(false); setArmed(null);
      if (m.sendError) alert(`El mensaje se guardó pero WhatsApp lo rechazó:\n\n${m.sendError}`);
      loadConvs();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo enviar el mensaje');
    } finally {
      setSending(false);
    }
  }

  function selectConv(conv: Conversation) {
    // Muestra de inmediato lo que hay en la lista y luego carga el detalle completo
    setSel(conv);
    loadDetail(conv.id);
  }

  async function markResolved() {
    if (!sel) return;
    try {
      await api.patch(`/api/conversations/${sel.id}`, { status: 'RESOLVED' });
      setSel(p => p ? { ...p, status: 'RESOLVED' } : p);
      loadConvs();
    } catch { /* sin permisos o error de red */ }
  }

  const ch = sel ? (CH[sel.channel] ?? CH.WHATSAPP) : CH.WHATSAPP;
  const selPriority = sel ? waitPriority(sel) : 'normal';

  return (
    <div className="flex h-full bg-[#FFF8F7]">

      {/* ══════════════════════════════════════════════════════════════════════
          LEFT PANEL — Lista de conversaciones
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="w-[300px] shrink-0 flex flex-col bg-white border-r border-[#F7E4E2]">

        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-[#F7E4E2] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold text-[16px] text-[#2E1614]">Bandeja</h2>
            {pending.length > 0 && (
              <span className="bg-rose-500 text-white text-[10px] font-black px-2.5 py-1 rounded-full">
                {pending.length} sin responder
              </span>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#C6A5A2]" />
            <input
              placeholder="Buscar cliente..."
              value={search}
              onChange={e => { setSearch(e.target.value); setTab('all'); }}
              className="w-full pl-9 pr-3 py-2.5 text-[12px] bg-[#FFF5F5] border border-[#F7E4E2] rounded-xl
                         focus:outline-none focus:ring-2 focus:ring-pepper-500/20 focus:border-pepper-600
                         text-[#2E1614] placeholder:text-[#C6A5A2] transition-all"
            />
          </div>

          {/* Tabs */}
          <div className="flex rounded-xl bg-[#FFF8F7] p-1 gap-1">
            {([['pending', `Sin resp. (${pending.length})`], ['all', 'Abiertas'], ['resolved', 'Resueltas']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)}
                className={cn('flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all',
                  tab === k ? 'bg-white text-[#2E1614] shadow-sm' : 'text-[#8C6B66] hover:text-[#2E1614]')}>
                {l}
              </button>
            ))}
          </div>

          {/* Channel pills */}
          <div className="flex gap-1.5">
            <button onClick={() => setFilterCh('')}
              className={cn('flex-1 py-1.5 rounded-xl text-[10px] font-bold border transition-all',
                !filterCh ? 'bg-[#2E1614] text-white border-[#2E1614]' : 'bg-white text-[#8C6B66] border-[#F7E4E2] hover:border-[#C6A5A2]')}>
              Todos
            </button>
            {(['WHATSAPP','INSTAGRAM','FACEBOOK'] as const).map(c => {
              const cfg = CH[c]; const active = filterCh === c;
              return (
                <button key={c} onClick={() => setFilterCh(active ? '' : c)}
                  className={cn('flex-1 py-1.5 rounded-xl text-[10px] font-bold border transition-all flex items-center justify-center gap-1',
                    active ? cfg.pill : 'bg-white border-[#F7E4E2] text-[#8C6B66] hover:border-[#C6A5A2]')}>
                  <cfg.icon className="w-3 h-3" />{cfg.short}
                </button>
              );
            })}
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.map(conv => {
            const last  = lastMsg(conv);
            const cfg   = CH[conv.channel] ?? CH.WHATSAPP;
            const isAct = sel?.id === conv.id;
            const unread = !conv.isRead && !isAct;
            const priority = waitPriority(conv);
            const waiting  = isWaiting(conv);

            return (
              <button
                key={conv.id}
                onClick={() => selectConv(conv)}
                className={cn(
                  'w-full text-left px-3 py-3.5 border-b transition-all relative group',
                  /* ── ESTADO ACTIVO: fondo brand sólido ── */
                  isAct
                    ? 'bg-pepper-600 border-b-pepper-700/10'
                    : unread
                      ? 'bg-[#FFF5F5] border-b-[#F7E4E2] hover:bg-brand-50'
                      : 'bg-white border-b-[#F7E4E2] hover:bg-[#FFF5F5]'
                )}
              >
                {/* Barra lateral de prioridad */}
                {!isAct && priority === 'urgent' && (
                  <span className="absolute left-0 top-2 bottom-2 w-[3px] bg-rose-400 rounded-r-full" />
                )}
                {!isAct && priority === 'high' && (
                  <span className="absolute left-0 top-2 bottom-2 w-[3px] bg-amber-400 rounded-r-full" />
                )}

                <div className="flex items-start gap-3">
                  <ConvAvatar conv={conv} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <p className={cn('text-[13px] font-bold truncate',
                        isAct ? 'text-white' : unread ? 'text-[#2E1614]' : 'text-[#2E1614]')}>
                        {conv.customer.name}
                      </p>
                      {conv.lastMessageAt && (
                        <span className={cn('text-[10px] shrink-0 font-medium',
                          isAct ? 'text-white/70' : 'text-[#8C6B66]')}>
                          {formatRelativeTime(conv.lastMessageAt)}
                        </span>
                      )}
                    </div>

                    {/* Ciudad + canal */}
                    <div className="flex items-center gap-1.5 mb-1">
                      {conv.customer.city && (
                        <span className={cn('text-[10px]', isAct ? 'text-white/70' : 'text-[#8C6B66]')}>
                          {conv.customer.city}
                        </span>
                      )}
                      <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full border',
                        isAct ? 'bg-white/20 text-white border-white/30' : cfg.pill)}>
                        {cfg.short}
                      </span>
                    </div>

                    {/* Último mensaje */}
                    <p className={cn('text-[11px] truncate leading-snug',
                      isAct ? 'text-white/80' : 'text-[#8C6B66]')}>
                      {last?.direction === 'OUTBOUND' && (
                        <span className={isAct ? 'text-white/60' : 'text-[#C6A5A2]'}>Tú: </span>
                      )}
                      {last?.content}
                    </p>

                    {/* Badges */}
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {waiting && conv.lastMessageAt && !isAct && (
                        <WaitBadge since={conv.lastMessageAt} />
                      )}
                      {isAct && waiting && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white">
                          <Clock className="w-2.5 h-2.5" /> Esperando respuesta
                        </span>
                      )}
                      {conv.tags.slice(0,1).map(t => (
                        <span key={t} className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-bold border',
                          isAct ? 'bg-white/20 text-white border-white/30' : 'bg-brand-50 text-pepper-700 border-brand-200')}>
                          {t}
                        </span>
                      ))}
                      {unread && (
                        <span className="ml-auto w-2 h-2 bg-pepper-600 rounded-full shrink-0" />
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-16">
              <p className="text-[#C6A5A2] text-sm font-medium">
                {loading ? 'Cargando conversaciones…' : 'Sin conversaciones'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          CENTER — Chat
      ══════════════════════════════════════════════════════════════════════ */}
      {!sel ? (
        <div className="flex-1 flex items-center justify-center bg-white">
          <div className="text-center">
            <MessageSquare className="w-10 h-10 text-[#F7E4E2] mx-auto mb-3" />
            <p className="text-[#C6A5A2] text-sm font-medium">
              {loading ? 'Cargando…' : 'Cuando un cliente te escriba, la conversación aparecerá aquí'}
            </p>
          </div>
        </div>
      ) : (
      <div className="flex-1 flex flex-col min-w-0 bg-white">

        {/* Chat header */}
        <div className="bg-white border-b border-brand-100 px-5 py-3.5 flex items-center gap-3 shrink-0">
          <ConvAvatar conv={sel} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-base text-ink">{sel.customer.name}</p>
              {selPriority === 'urgent' && (
                <span className="flex items-center gap-1 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg">
                  <AlertCircle className="w-3 h-3" /> Urgente
                </span>
              )}
              {selPriority === 'high' && (
                <span className="flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">
                  Alta prioridad
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-sm text-ink-muted">{sel.customer.phone}</span>
              {sel.customer.city && <span className="text-sm text-ink-muted">· {sel.customer.city}</span>}
              {sel.agent && <span className="text-sm text-[#D33A22] font-medium">· Atiende {sel.agent.name}</span>}
            </div>
          </div>
          <button
            onClick={() => setShowOrder(true)}
            className="shrink-0 flex items-center gap-1.5 bg-pepper-600 hover:bg-pepper-700 text-white px-3.5 h-9 rounded-xl text-sm font-semibold transition-colors"
          >
            <ShoppingBag className="w-4 h-4" /> Crear pedido
          </button>
          <div className="flex gap-1.5 shrink-0">
            {sel.tags.map(t => (
              <span key={t} className="text-xs bg-brand-50 text-ink-soft px-2.5 py-1 rounded-lg font-medium">
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3 bg-[#FFF8F7]">
          {sel.messages.map((m, i) => {
            const isOut = m.direction === 'OUTBOUND';
            const showDate = i === 0 || new Date(m.createdAt).toDateString() !== new Date(sel.messages[i-1].createdAt).toDateString();
            return (
              <div key={m.id}>
                {showDate && (
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-brand-100" />
                    <span className="text-xs text-ink-muted font-medium px-3 py-1 bg-white border border-brand-100 rounded-full">
                      {new Date(m.createdAt).toLocaleDateString('es-CO', { weekday:'short', day:'2-digit', month:'short' })}
                    </span>
                    <div className="flex-1 h-px bg-brand-100" />
                  </div>
                )}
                {m.isInternal ? (
                  <div className="flex justify-center">
                    <div className="bubble-internal">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Lock className="w-3 h-3" />
                        <span className="font-semibold text-xs">Nota interna{m.sentBy ? ` · ${m.sentBy.name}` : ''}</span>
                      </div>
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div className={cn('flex items-end gap-3', isOut ? 'justify-end' : 'justify-start')}>
                    {!isOut && (
                      <div className="w-8 h-8 rounded-xl bg-brand-100 text-ink-soft flex items-center justify-center text-xs font-bold shrink-0">
                        {initials(sel.customer.name)}
                      </div>
                    )}
                    <div className={cn(
                      'flex flex-col max-w-[68%]',
                      isOut ? 'items-end' : 'items-start'
                    )}>
                      {isOut && m.sentBy && (
                        <p className="text-xs text-ink-muted mb-1 pr-1">{m.sentBy.name}</p>
                      )}
                      {m.media
                        ? <MediaBubble media={m.media} caption={m.content} isOut={isOut} />
                        : <div className={isOut ? 'bubble-out' : 'bubble-in'}><MessageText text={m.content} /></div>}
                      <div className="flex items-center gap-1.5 mt-1">
                        <p className="text-xs text-ink-muted">{formatRelativeTime(m.createdAt)}</p>
                        {isOut && m.status === 'READ'      && <CheckCheck className="w-3.5 h-3.5 text-[#D33A22]" />}
                        {isOut && m.status === 'DELIVERED' && <CheckCheck className="w-3.5 h-3.5 text-ink-muted" />}
                        {isOut && m.status === 'FAILED'    && (
                          <span className="flex items-center gap-1 text-xs font-semibold text-rose-500">
                            <AlertCircle className="w-3.5 h-3.5" /> No enviado
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {isWaiting(sel) && sel.lastMessageAt && (
            <div className="flex justify-center">
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 text-amber-700 text-[11px] font-bold px-4 py-2.5 rounded-full shadow-sm">
                <Clock className="w-3.5 h-3.5" />
                Esperando tu respuesta · <WaitBadge since={sel.lastMessageAt} />
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="bg-white border-t border-brand-100 p-4 shrink-0">
          {showTpl && !armed && (
            <div className="mb-3 bg-white border border-brand-100 rounded-xl overflow-hidden shadow-lg">
              <div className="flex items-center justify-between px-4 py-2 border-b border-brand-100 bg-brand-50">
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
                  Plantillas {tplQuery && <span className="text-ink-muted normal-case">· "{tplQuery}"</span>}
                </p>
                <p className="text-[10px] text-ink-muted font-medium hidden sm:block">
                  ↑↓ o Tab para moverte · Enter para elegir · Esc para cerrar
                </p>
              </div>
              <div ref={pickerRef} className="max-h-72 overflow-y-auto">
                {filteredTpls.length === 0 ? (
                  <p className="text-sm text-ink-muted px-4 py-6 text-center">
                    {templates.length === 0 ? 'No hay plantillas todavía' : 'Ninguna plantilla coincide'}
                  </p>
                ) : filteredTpls.map((t, i) => {
                  const st = TPL_STATUS[t.status] ?? TPL_STATUS.PENDING;
                  const active = i === tplIndex;
                  return (
                    <button
                      key={t.id}
                      data-active={active}
                      onMouseEnter={() => setTplIndex(i)}
                      onClick={() => selectTemplate(t)}
                      className={cn('w-full flex items-start gap-3 px-4 py-2.5 text-left border-b border-brand-100 last:border-0 transition-colors',
                        active ? 'bg-brand-50' : 'hover:bg-brand-50')}
                    >
                      <span className={cn('w-2 h-2 rounded-full shrink-0 mt-1.5', st.dot)} title={st.label} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-bold text-[#8C6B66] font-mono truncate">/{t.name}</code>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-brand-50 text-ink-muted shrink-0">
                            {TPL_CATEGORY[t.category] ?? t.category}
                          </span>
                          {t.variables.length > 0 && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100 shrink-0">
                              {t.variables.length} {t.variables.length === 1 ? 'variable' : 'variables'}
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] text-ink-muted truncate mt-0.5">{t.content}</p>
                      </div>
                      <ChevronRight className={cn('w-4 h-4 ml-auto shrink-0 mt-1', active ? "text-white" : "text-ink-muted")} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {internal && (
            <div className="mb-3 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl font-medium">
              <Lock className="w-3.5 h-3.5" /> Nota interna — solo visible para el equipo
            </div>
          )}
          {armed ? (
            <div className="bg-white border border-brand-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#8C6B66]">Plantilla</span>
                  <code className="text-xs font-mono font-bold text-[#8C6B66] bg-brand-50 border border-brand-200 px-2 py-0.5 rounded">/{armed.tpl.name}</code>
                  <span className={cn('w-2 h-2 rounded-full', (TPL_STATUS[armed.tpl.status] ?? TPL_STATUS.PENDING).dot)}
                    title={(TPL_STATUS[armed.tpl.status] ?? TPL_STATUS.PENDING).label} />
                </div>
                <button onClick={() => setArmed(null)} className="text-xs text-ink-muted hover:text-ink-soft flex items-center gap-1">
                  <X className="w-3.5 h-3.5" /> Cancelar
                </button>
              </div>

              {armed.tpl.variables.length > 0 && (
                <div className="space-y-2 mb-3">
                  <p className="text-[11px] font-medium text-ink-muted">Completa los datos:</p>
                  {armed.params.map((val, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <code className="text-[11px] bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-1 rounded shrink-0">{`{{${i + 1}}}`}</code>
                      <input
                        autoFocus={i === armed.params.findIndex(p => !p.trim())}
                        value={val}
                        onChange={e => setArmed(a => a ? { ...a, params: a.params.map((p, idx) => idx === i ? e.target.value : p) } : a)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
                        placeholder={`Valor para la variable ${i + 1}`}
                        className="flex-1 h-8 text-sm border border-brand-100 rounded-lg px-2.5 focus:outline-none focus:ring-1 focus:ring-pepper-500 focus:border-pepper-600"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-[#E7FFDB] rounded-lg p-3 mb-3">
                <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">{fillTemplate(armed.tpl.content, armed.params)}</p>
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-ink-muted leading-snug">Se envía como plantilla aprobada — funciona aunque hayan pasado más de 24h desde el último mensaje del cliente.</p>
                <button onClick={send} disabled={sending || armed.params.some(p => !p.trim())}
                  className="px-4 h-9 bg-[#2E1614] hover:bg-[#3A2921] disabled:opacity-30 text-white rounded-xl text-sm font-semibold flex items-center gap-2 shrink-0">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Enviar plantilla
                </button>
              </div>
            </div>
          ) : (
          <div className="flex items-end gap-3">
            <div className="flex-1 bg-brand-50 border border-brand-100 rounded-xl px-4 py-3
                            focus-within:border-[#ED5340] focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(237,83,64,0.12)]
                            transition-all">
              <textarea
                ref={inputRef}
                value={msg}
                onChange={e => { setMsg(e.target.value); setShowTpl(e.target.value.startsWith('/')); }}
                onKeyDown={e => {
                  if (showTpl && filteredTpls.length) {
                    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
                      e.preventDefault(); setTplIndex(i => (i + 1) % filteredTpls.length); return;
                    }
                    if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
                      e.preventDefault(); setTplIndex(i => (i - 1 + filteredTpls.length) % filteredTpls.length); return;
                    }
                    if (e.key === 'Enter') { e.preventDefault(); selectTemplate(filteredTpls[tplIndex]); return; }
                    if (e.key === 'Escape') { e.preventDefault(); setShowTpl(false); return; }
                  }
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                placeholder={internal ? 'Nota interna (solo equipo)...' : `Escribe por ${ch.label}… (/ para plantillas)`}
                rows={1}
                className="w-full bg-transparent text-[14px] resize-none outline-none max-h-28 text-ink placeholder:text-ink-muted"
              />
              <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-brand-100">
                <button onClick={() => { setShowTpl(s => !s); requestAnimationFrame(() => inputRef.current?.focus()); }}
                  title="Plantillas (/)"
                  className={cn('text-xs font-bold w-6 h-6 rounded-lg flex items-center justify-center transition-colors',
                    showTpl ? "bg-[#D33A22] text-white" : "text-ink-muted hover:text-[#D33A22] hover:bg-brand-50")}>
                  /
                </button>
                <button onClick={() => setInternal(i => !i)}
                  className={cn('p-1.5 rounded-lg transition-colors',
                    internal ? 'text-amber-500 bg-amber-50' : 'text-ink-muted hover:text-ink-soft hover:bg-brand-50')}>
                  <Lock className="w-4 h-4" />
                </button>
                <span className={cn('ml-auto flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border', ch.pill)}>
                  <ch.icon className="w-3 h-3" /> {ch.label}
                </span>
              </div>
            </div>
            <button onClick={send} disabled={!msg.trim() || sending}
              className="w-11 h-11 bg-[#2E1614] hover:bg-[#3A2921] disabled:opacity-30 text-white rounded-xl flex items-center justify-center shadow-sm transition-all shrink-0">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          )}
        </div>
      </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          RIGHT — Contexto del cliente
      ══════════════════════════════════════════════════════════════════════ */}
      {sel && (
      <div className="w-[220px] shrink-0 flex flex-col bg-white border-l border-brand-100">
        <div className="px-4 py-3.5 border-b border-brand-100">
          <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Contexto</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-5">

          {/* Canal */}
          <div>
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">Canal</p>
            <div className={cn('flex items-center gap-2 px-3 py-2 rounded-xl border font-semibold text-sm', ch.pill)}>
              <span className={cn('w-2 h-2 rounded-full shrink-0', ch.dot)} />
              <ch.icon className="w-4 h-4 shrink-0" />
              {ch.label}
            </div>
          </div>

          {/* Cliente */}
          <div>
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">Cliente</p>
            <div className="space-y-2.5">
              {[
                { label:'Pedidos', value: sel.customer.totalOrders ?? '—' },
                { label:'LTV',     value: Number(sel.customer.ltv || 0) > 0 ? `$${(Number(sel.customer.ltv)/1000).toFixed(0)}K` : '—' },
                { label:'Ciudad',  value: sel.customer.city || '—' },
              ].map(s => (
                <div key={s.label} className="flex justify-between items-center">
                  <span className="text-sm text-ink-muted">{s.label}</span>
                  <span className="text-sm font-semibold text-ink">{s.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Etiquetas */}
          <div>
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">Etiquetas</p>
            <div className="flex flex-wrap gap-1.5">
              {sel.tags.map(t => (
                <span key={t} className="text-xs bg-brand-50 border border-brand-200 text-brand-700 px-2.5 py-1 rounded-lg font-medium">
                  {t}
                </span>
              ))}
              {!sel.tags.length && <span className="text-sm text-ink-muted">Sin etiquetas</span>}
            </div>
          </div>

          {/* Acciones */}
          <div>
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">Acciones</p>
            <div className="space-y-1">
              <button onClick={() => setShowOrder(true)}
                className="w-full text-left text-sm text-ink-soft hover:text-ink hover:bg-brand-50 px-2.5 py-2 rounded-lg transition-colors">
                Crear pedido
              </button>
              <button onClick={markResolved} disabled={sel.status === 'RESOLVED'}
                className="w-full text-left text-sm text-ink-soft hover:text-ink hover:bg-brand-50 disabled:opacity-40 px-2.5 py-2 rounded-lg transition-colors">
                {sel.status === 'RESOLVED' ? 'Resuelta ✓' : 'Marcar resuelta'}
              </button>
              <a href={`/customers/${sel.customer.id}`}
                className="block w-full text-left text-sm text-ink-soft hover:text-ink hover:bg-brand-50 px-2.5 py-2 rounded-lg transition-colors">
                Ver cliente
              </a>
            </div>
          </div>
        </div>
      </div>
      )}

      {showOrder && sel && (
        <CreateOrderModal
          customerId={sel.customer.id}
          conversationId={sel.id}
          initial={{ name: sel.customer.name, phone: sel.customer.phone, city: sel.customer.city }}
          onClose={() => setShowOrder(false)}
          onCreated={() => { loadDetail(sel.id); loadConvs(); }}
        />
      )}
    </div>
  );
}
