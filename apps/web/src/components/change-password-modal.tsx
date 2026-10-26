'use client';
import { useState } from 'react';
import { X, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

/** Cada persona cambia su propia contraseña (por ejemplo, la temporal que le dieron). */
export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext]       = useState('');
  const [repeat, setRepeat]   = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [done, setDone]       = useState(false);

  async function submit() {
    setError('');
    if (next.length < 8) return setError('La contraseña nueva debe tener al menos 8 caracteres.');
    if (next !== repeat) return setError('Las dos contraseñas nuevas no coinciden.');
    setSaving(true);
    try {
      await api.post('/api/auth/password', { currentPassword: current, newPassword: next });
      setDone(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()} role="dialog" aria-label="Cambiar mi contraseña">
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-100">
          <h2 className="text-base font-bold text-ink">Cambiar mi contraseña</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-brand-50" aria-label="Cerrar">
            <X className="w-4 h-4 text-ink-muted" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-3">
          {done ? (
            <>
              <p className="text-sm text-emerald-800 flex gap-2"><CheckCircle2 className="w-4 h-4 shrink-0 mt-px" /> Listo. La próxima vez entra con la contraseña nueva.</p>
              <button onClick={onClose} className="w-full h-10 rounded-xl bg-action-600 hover:bg-action-700 text-white text-sm font-semibold">Cerrar</button>
            </>
          ) : (
            <>
              <div>
                <label className="text-sm font-medium text-ink-soft">Contraseña actual</label>
                <Input type="password" value={current} onChange={e => setCurrent(e.target.value)} className="mt-1" autoComplete="current-password" />
              </div>
              <div>
                <label className="text-sm font-medium text-ink-soft">Contraseña nueva</label>
                <Input type="password" value={next} onChange={e => setNext(e.target.value)} className="mt-1" autoComplete="new-password" />
              </div>
              <div>
                <label className="text-sm font-medium text-ink-soft">Repite la nueva</label>
                <Input type="password" value={repeat} onChange={e => setRepeat(e.target.value)} className="mt-1" autoComplete="new-password"
                  onKeyDown={e => { if (e.key === 'Enter') submit(); }} />
              </div>
              {error && <p className="text-sm text-rose-700 flex gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0 mt-px" /> {error}</p>}
              <button onClick={submit} disabled={saving} className="w-full h-10 rounded-xl bg-action-600 hover:bg-action-700 disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
