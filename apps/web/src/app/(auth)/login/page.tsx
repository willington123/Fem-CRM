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
          Rosa Melocotón como fondo (la tinta del 70 % del manual) y tinta
          oscura encima: 8.5:1, muy por encima de AA. El logotipo va en blanco,
          que es uno de los usos correctos del manual. */}
      <div className="hidden lg:flex w-[45%] bg-brand flex-col justify-between p-12 relative overflow-hidden">
        {/* Formas decorativas */}
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-white/25" />
        <div className="absolute -bottom-28 -right-24 w-72 h-72 rounded-full bg-pepper-500/25" />

        {/* Logotipo */}
        <div className="relative z-10">
          <Image
            src="/fem-logo-white.png"
            alt="Fem"
            width={900}
            height={525}
            priority
            className="w-[104px] h-auto"
          />
          <p className="text-white/90 text-[10px] font-bold uppercase tracking-[0.25em] mt-2">CRM</p>
        </div>

        {/* Titular */}
        <div className="relative z-10 space-y-7">
          <div>
            <h2 className="font-display text-ink font-bold text-[38px] leading-[1.1]">
              Cada clienta,<br />acompañada.
            </h2>
            <p className="text-ink-soft mt-4 text-[15px] leading-relaxed max-w-[380px]">
              Bandeja omnicanal, seguimiento de pedidos punta a punta y flujos automáticos
              de WhatsApp — todo en un solo lugar.
            </p>
          </div>

          <div className="flex gap-8">
            {[
              { value: 'WhatsApp', label: 'Instagram · Facebook' },
              { value: 'Pedidos', label: 'Tomados en el chat' },
              { value: 'Flujos',  label: 'Avisos de envío automáticos' },
            ].map(s => (
              <div key={s.value}>
                <p className="text-ink font-bold text-[15px] leading-none">{s.value}</p>
                <p className="text-ink-soft text-[11px] mt-1.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-ink-soft text-xs relative z-10">Fem · Colombia</p>
      </div>

      {/* ── Panel derecho: formulario ── */}
      <div className="flex-1 bg-[#FFF8F7] flex items-center justify-center p-8">
        <div className="w-full max-w-[380px]">

          {/* Logo en móvil */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-brand-50 border border-brand-200 flex items-center justify-center">
              <Image src="/fem-icon.png" alt="Fem" width={40} height={40} className="object-contain w-full h-full p-1" />
            </div>
            <div>
              <p className="font-display font-bold text-ink text-[15px] leading-none">Fem CRM</p>
              <p className="text-pepper-600 text-[10px] font-bold uppercase tracking-widest mt-1">Plataforma de clientas</p>
            </div>
          </div>

          <div className="mb-8">
            <h1 className="font-display text-[26px] font-bold text-ink leading-tight">Bienvenida 👋</h1>
            <p className="text-ink-muted text-sm mt-1">Accede a tu cuenta</p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 p-3 rounded-xl bg-pepper-50 border border-pepper-200 text-pepper-700 text-sm"
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
                placeholder="hola@fem.com.co"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                required
                className="bg-white border-brand-200 focus:border-pepper-500 focus:ring-pepper-500/20 text-ink placeholder:text-brand-700"
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
                  className="pr-10 bg-white border-brand-200 focus:border-pepper-500 focus:ring-pepper-500/20 text-ink"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(s => !s)}
                  aria-label={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-600 hover:text-pepper-600 transition-colors"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-pepper-600 hover:bg-pepper-700 text-white font-semibold py-3 rounded-xl transition-all duration-150 shadow-sm hover:shadow-md disabled:opacity-60 mt-2"
            >
              {loading ? 'Iniciando sesión…' : 'Ingresar'}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
