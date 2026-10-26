'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { setAuth } from '@/lib/auth';
import Image from 'next/image';

export default function LoginPage() {
  const router = useRouter();
  const [form,    setForm]    = useState({ email: '', password: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAuth(data.token, data.user);
      router.push('/dashboard');
    } catch {
      setError('Correo o contraseña incorrectos.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Panel izquierdo: marca ──
          Azul marino del logotipo como fondo y el logo con letras blancas.
          El texto va en blanco sobre #0B1630: 17:1. */}
      <div className="hidden lg:flex w-[45%] bg-ink flex-col justify-between p-12 relative overflow-hidden">
        {/* Formas decorativas con los dos colores del logo */}
        <div className="absolute -top-40 -left-32 w-[28rem] h-[28rem] rounded-full bg-action-500/25 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 w-80 h-80 rounded-full bg-mint-500/20 blur-3xl" />

        {/* Logotipo */}
        <div className="relative z-10">
          <Image
            src="/konnexa-logo-white.png"
            alt="Konnexa"
            width={900}
            height={228}
            priority
            className="w-[200px] h-auto"
          />
        </div>

        {/* Titular */}
        <div className="relative z-10 space-y-7">
          <div>
            <h2 className="font-display text-white font-bold text-[38px] leading-[1.1]">
              Cada conversación,<br />una venta.
            </h2>
            <p className="text-white/75 mt-4 text-[15px] leading-relaxed max-w-[380px]">
              Bandeja de WhatsApp, Instagram y Facebook, pedidos tomados en el chat y
              avisos de envío automáticos — todo en un solo lugar.
            </p>
          </div>

          <div className="flex gap-8">
            {[
              { value: 'WhatsApp', label: 'Instagram · Facebook' },
              { value: 'Pedidos', label: 'Tomados en el chat' },
              { value: 'Flujos',  label: 'Avisos de envío automáticos' },
            ].map(s => (
              <div key={s.value}>
                <p className="text-white font-bold text-[15px] leading-none">{s.value}</p>
                <p className="text-white/65 text-[11px] mt-1.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-white/60 text-xs relative z-10">Konnexa · CRM conversacional</p>
      </div>

      {/* ── Panel derecho: formulario ── */}
      <div className="flex-1 bg-[#F6F8FC] flex items-center justify-center p-8">
        <div className="w-full max-w-[380px]">

          {/* Logo en móvil */}
          <div className="lg:hidden mb-10">
            <Image src="/konnexa-logo.png" alt="Konnexa" width={900} height={228} className="w-[170px] h-auto" priority />
          </div>

          <div className="mb-8">
            <h1 className="font-display text-[26px] font-bold text-ink leading-tight">Hola de nuevo 👋</h1>
            <p className="text-ink-muted text-sm mt-1">Accede a tu cuenta</p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="text-[13px] font-semibold text-ink mb-1.5 block">
                Correo electrónico
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="tu@correo.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                required
                className="bg-white border-brand-200 focus:border-action-500 focus:ring-action-500/20 text-ink placeholder:text-ink-muted"
              />
            </div>

            <div>
              <label htmlFor="password" className="text-[13px] font-semibold text-ink mb-1.5 block">
                Contraseña
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  required
                  className="pr-10 bg-white border-brand-200 focus:border-action-500 focus:ring-action-500/20 text-ink"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(s => !s)}
                  aria-label={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-600 hover:text-action-600 transition-colors"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-action-600 hover:bg-action-700 text-white font-semibold py-3 rounded-xl transition-all duration-150 shadow-sm hover:shadow-md disabled:opacity-60 mt-2"
            >
              {loading ? 'Iniciando sesión…' : 'Ingresar'}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
