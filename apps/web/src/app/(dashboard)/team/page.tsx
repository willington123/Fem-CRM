'use client';
import { useEffect, useState } from 'react';
import {
  UserPlus, Loader2, AlertTriangle, X, KeyRound, Copy, Check, ShieldCheck, Headset, LineChart, RefreshCw,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, Role } from '@/lib/permissions';
import { useCurrentUser } from '@/lib/use-current-user';

interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  hasLogin: boolean;
  _count: { assignedConversations: number };
}

const ROLE_ICON = { ADMIN: ShieldCheck, AGENT: Headset, ANALYST: LineChart } as const;

/** Contraseña temporal legible: sin 0/O ni 1/l para dictarla sin errores. */
function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

function CopyLine({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 bg-white border border-brand-200 rounded-lg pl-3 pr-1 py-1.5">
      <span className="text-xs text-ink-muted w-20 shrink-0">{label}</span>
      <code className="text-sm text-ink flex-1 truncate">{value}</code>
      <button
        onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="p-1.5 rounded-md hover:bg-brand-50 text-ink-muted"
        aria-label={`Copiar ${label}`}
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-100">
          <h2 className="text-base font-bold text-ink">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-brand-50" aria-label="Cerrar">
            <X className="w-4 h-4 text-ink-muted" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

/** Lo que hay que pasarle a la persona: se muestra una sola vez. */
function Credentials({ email, password, existing, onDone }: { email: string; password: string; existing?: boolean; onDone: () => void }) {
  return (
    <div className="space-y-4">
      {existing ? (
        <p className="text-sm text-ink-soft">
          Este correo ya tenía cuenta de acceso, así que <strong>entra con la contraseña que ya tenía</strong>.
          Si no la recuerda, usa «Restablecer contraseña».
        </p>
      ) : (
        <>
          <p className="text-sm text-ink-soft">
            Pásale estos datos por un canal privado. <strong>La contraseña no se vuelve a mostrar</strong>;
            al entrar puede cambiarla desde «Cambiar mi contraseña», abajo en el menú.
          </p>
          <div className="space-y-2">
            <CopyLine label="Correo" value={email} />
            <CopyLine label="Contraseña" value={password} />
          </div>
        </>
      )}
      <button onClick={onDone} className="w-full h-10 rounded-xl bg-action-600 hover:bg-action-700 text-white text-sm font-semibold">
        Listo
      </button>
    </div>
  );
}

function AddMemberModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [role, setRole]         = useState<Role>('AGENT');
  const [password, setPassword] = useState(generatePassword);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [done, setDone]         = useState<{ existing: boolean } | null>(null);

  async function submit() {
    setError('');
    setSaving(true);
    try {
      const r = await api.post<{ existingLogin: boolean }>('/api/users', { name, email, role, password });
      setDone({ existing: r.existingLogin });
      onCreated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={done ? 'Persona agregada' : 'Agregar persona al equipo'} onClose={onClose}>
      {done ? (
        <Credentials email={email.trim().toLowerCase()} password={password} existing={done.existing} onDone={onClose} />
      ) : (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-ink-soft">Nombre</label>
            <Input value={name} onChange={e => setName(e.target.value)} className="mt-1" placeholder="Nombre y apellido" />
          </div>
          <div>
            <label className="text-sm font-medium text-ink-soft">Correo</label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1" placeholder="nombre@tuempresa.com" />
          </div>
          <div>
            <p className="text-sm font-medium text-ink-soft mb-1.5">Rol</p>
            <div className="space-y-1.5">
              {ROLES.map(r => (
                <label key={r} className={cn(
                  'flex gap-3 items-start rounded-xl border px-3 py-2 cursor-pointer transition-colors',
                  role === r ? 'border-action-500 bg-brand-50' : 'border-brand-100 hover:bg-brand-50',
                )}>
                  <input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} className="mt-1 accent-[#0050D6]" />
                  <span>
                    <span className="block text-sm font-semibold text-ink">{ROLE_LABELS[r]}</span>
                    <span className="block text-xs text-ink-muted">{ROLE_DESCRIPTIONS[r]}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-ink-soft">Contraseña temporal</label>
            <div className="flex gap-2 mt-1">
              <Input value={password} onChange={e => setPassword(e.target.value)} className="font-mono" />
              <button onClick={() => setPassword(generatePassword())} className="px-3 rounded-lg border border-brand-200 text-ink-soft hover:bg-brand-50" title="Generar otra" aria-label="Generar otra contraseña">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-rose-700 flex gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0 mt-px" /> {error}</p>}
          <button onClick={submit} disabled={saving} className="w-full h-10 rounded-xl bg-action-600 hover:bg-action-700 disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Agregar
          </button>
        </div>
      )}
    </Modal>
  );
}

function ResetPasswordModal({ member, onClose }: { member: Member; onClose: () => void }) {
  const [password, setPassword] = useState(generatePassword);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [done, setDone]         = useState(false);

  async function submit() {
    setError('');
    setSaving(true);
    try {
      await api.patch(`/api/users/${member.id}`, { password });
      setDone(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Restablecer contraseña · ${member.name}`} onClose={onClose}>
      {done ? (
        <Credentials email={member.email} password={password} onDone={onClose} />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">Su contraseña actual deja de funcionar y queda esta nueva.</p>
          <div className="flex gap-2">
            <Input value={password} onChange={e => setPassword(e.target.value)} className="font-mono" aria-label="Contraseña nueva" />
            <button onClick={() => setPassword(generatePassword())} className="px-3 rounded-lg border border-brand-200 text-ink-soft hover:bg-brand-50" title="Generar otra" aria-label="Generar otra contraseña">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          {error && <p className="text-sm text-rose-700 flex gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0 mt-px" /> {error}</p>}
          <button onClick={submit} disabled={saving} className="w-full h-10 rounded-xl bg-action-600 hover:bg-action-700 disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Guardar contraseña nueva
          </button>
        </div>
      )}
    </Modal>
  );
}

export default function TeamPage() {
  const { user: me } = useCurrentUser();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError]     = useState('');
  const [notice, setNotice]   = useState('');
  const [adding, setAdding]   = useState(false);
  const [resetting, setResetting] = useState<Member | null>(null);
  const [busy, setBusy]       = useState<string | null>(null);

  const load = () =>
    api.get<Member[]>('/api/users')
      .then(list => {
        // Sin permiso la API devuelve la lista corta (sin correo): no es Administración.
        if (list.length && !('email' in list[0])) setError('Solo Administración puede gestionar el equipo.');
        else setMembers(list);
      })
      .catch(e => setError(e.message));

  useEffect(() => { load(); }, []);

  async function update(m: Member, patch: Partial<Pick<Member, 'role' | 'isActive'>>) {
    setNotice('');
    setBusy(m.id);
    try {
      await api.patch(`/api/users/${m.id}`, patch);
      await load();
      if (patch.isActive === false && m._count.assignedConversations > 0) {
        setNotice(`La cuenta de ${m.name} quedó desactivada y sus ${m._count.assignedConversations} conversaciones abiertas pasaron a «sin asignar».`);
      }
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#F6F8FC] p-8">
        <div className="text-center max-w-sm">
          <AlertTriangle className="w-8 h-8 text-rose-600 mx-auto mb-3" />
          <p className="font-semibold text-ink">No se pudo abrir Equipo</p>
          <p className="text-sm text-ink-muted mt-1">{error}</p>
        </div>
      </div>
    );
  }

  const activos = members?.filter(m => m.isActive).length ?? 0;

  return (
    <div className="flex-1 overflow-auto bg-[#F6F8FC]">
      <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-[#E3E9F4] px-8 py-4 z-10 flex items-center justify-between">
        <div>
          <h1 className="text-[17px] font-bold text-ink">Equipo</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            {members ? `${activos} persona${activos === 1 ? '' : 's'} activa${activos === 1 ? '' : 's'}` : 'Cargando…'} · quién entra al CRM y qué puede hacer
          </p>
        </div>
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 bg-action-600 hover:bg-action-700 text-white px-3.5 h-9 rounded-xl text-sm font-semibold">
          <UserPlus className="w-4 h-4" /> Agregar persona
        </button>
      </div>

      <div className="p-8 space-y-6 max-w-5xl">
        {/* Qué puede hacer cada rol */}
        <div className="grid grid-cols-3 gap-3">
          {ROLES.map(r => {
            const Icon = ROLE_ICON[r];
            return (
              <div key={r} className="bg-white border border-brand-100 rounded-2xl p-4">
                <p className="flex items-center gap-2 text-sm font-bold text-ink"><Icon className="w-4 h-4 text-action-600" /> {ROLE_LABELS[r]}</p>
                <p className="text-xs text-ink-muted mt-1.5 leading-relaxed">{ROLE_DESCRIPTIONS[r]}</p>
              </div>
            );
          })}
        </div>

        {notice && (
          <p className="text-sm text-ink-soft bg-brand-50 border border-brand-200 rounded-xl px-4 py-2.5">{notice}</p>
        )}

        <div className="bg-white rounded-2xl border border-brand-100 overflow-hidden">
          {!members ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-action-600" /></div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-brand-100">
                  {['Persona', 'Rol', 'Estado', 'Conversaciones', 'Desde', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-100">
                {members.map(m => {
                  const isMe = m.id === me?.id;
                  return (
                    <tr key={m.id} className={cn(!m.isActive && 'opacity-60')}>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-ink">{m.name}{isMe && <span className="ml-1.5 text-xs font-normal text-ink-muted">(tú)</span>}</p>
                        <p className="text-xs text-ink-muted">{m.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={m.role}
                          disabled={busy === m.id || isMe}
                          title={isMe ? 'No puedes cambiar tu propio rol' : undefined}
                          onChange={e => update(m, { role: e.target.value as Role })}
                          className="h-8 rounded-lg border border-brand-100 bg-white px-2 text-sm disabled:opacity-60"
                          aria-label={`Rol de ${m.name}`}
                        >
                          {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', m.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-50 text-ink-muted')}>
                          {m.isActive ? 'Activa' : 'Desactivada'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-ink-soft tabular-nums">{m._count.assignedConversations || '—'}</td>
                      <td className="px-4 py-3 text-xs text-ink-muted">{formatDate(m.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setResetting(m)}
                            className="flex items-center gap-1 text-xs font-semibold text-ink-soft hover:text-action-600 px-2 py-1.5 rounded-lg hover:bg-brand-50"
                          >
                            <KeyRound className="w-3.5 h-3.5" /> Contraseña
                          </button>
                          {!isMe && (
                            <button
                              onClick={() => update(m, { isActive: !m.isActive })}
                              disabled={busy === m.id}
                              className="text-xs font-semibold text-ink-soft hover:text-action-600 px-2 py-1.5 rounded-lg hover:bg-brand-50 disabled:opacity-50"
                            >
                              {m.isActive ? 'Desactivar' : 'Reactivar'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <p className="text-xs text-ink-muted leading-relaxed">
          Desactivar no borra nada: sus mensajes y pedidos se conservan y solo deja de poder entrar, al instante.
          Siempre tiene que quedar al menos una persona activa en Administración.
        </p>
      </div>

      {adding && <AddMemberModal onClose={() => setAdding(false)} onCreated={load} />}
      {resetting && <ResetPasswordModal member={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
}
