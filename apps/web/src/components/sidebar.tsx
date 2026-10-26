'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  MessageSquare, Users, ShoppingBag, BarChart3, Zap,
  FileText, LogOut, Settings, UsersRound, KeyRound
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { clearAuth } from '@/lib/auth';
import { useCurrentUser } from '@/lib/use-current-user';
import { ROLE_LABELS, Permission, Role } from '@/lib/permissions';
import { ChangePasswordModal } from './change-password-modal';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback } from './ui/avatar';
import Image from 'next/image';
import { useState, useEffect } from 'react';

/**
 * `badge` nombra el contador de /api/stats/badges que le corresponde.
 * `perm` esconde la entrada a quien no la puede usar (la API igual lo bloquea).
 */
const navItems: { href: string; icon: any; label: string; badge: 'inbox' | 'orders' | null; perm?: Permission }[] = [
  { href: '/dashboard',       icon: BarChart3,     label: 'Dashboard',  badge: null },
  { href: '/inbox',           icon: MessageSquare, label: 'Bandeja',    badge: 'inbox'  as const },
  { href: '/customers',       icon: Users,         label: 'Clientas',   badge: null },
  { href: '/orders',          icon: ShoppingBag,   label: 'Pedidos',    badge: 'orders' as const },
  { href: '/flows',           icon: Zap,           label: 'Flujos',     badge: null },
  { href: '/templates',       icon: FileText,      label: 'Plantillas', badge: null },
  { href: '/team',            icon: UsersRound,    label: 'Equipo',     badge: null, perm: 'team.manage' },
  { href: '/settings',        icon: Settings,      label: 'Ajustes',    badge: null, perm: 'settings.view' },
];

type Badges = { inbox: number; orders: number };

export function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const { user, can } = useCurrentUser();
  const [changingPassword, setChangingPassword] = useState(false);
  const [badges, setBadges] = useState<Badges>({ inbox: 0, orders: 0 });


  // Los contadores se refrescan solos: el CRM se deja abierto todo el día.
  useEffect(() => {
    let alive = true;
    const load = () => api.get<Badges>('/api/stats/badges')
      .then(b => { if (alive) setBadges(b); })
      .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [pathname]);

  const initials = (n: string) => n.split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2);

  return (
    <aside className="fixed left-0 top-0 h-screen w-[220px] bg-white border-r border-brand-100 flex flex-col z-30">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-brand-100">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl overflow-hidden bg-brand-50 flex items-center justify-center border border-brand-100">
            <Image
              src="/fem-icon.png"
              alt="Fem"
              width={32}
              height={32}
              className="object-contain w-full h-full p-0.5"
              priority
            />
          </div>
          <div>
            <p className="font-display font-bold text-[15px] text-ink leading-none">Fem</p>
            <p className="text-[10px] text-pepper-600 font-semibold uppercase tracking-widest mt-0.5">CRM</p>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.filter(i => !i.perm || can(i.perm)).map(({ href, icon: Icon, label, badge }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          const count  = badge ? badges[badge] : 0;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                active
                  ? 'bg-pepper-600 text-white'
                  : 'text-ink-soft hover:bg-brand-50 hover:text-ink'
              )}
            >
              <span className="flex items-center gap-3">
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </span>
              {count > 0 && !active && (
                <span className="min-w-[20px] h-5 bg-pepper-600 text-white text-[11px] font-bold rounded-full flex items-center justify-center px-1.5 tabular-nums">
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-brand-100">
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-brand-50 group cursor-pointer transition-colors">
          <Avatar className="w-7 h-7 shrink-0">
            <AvatarFallback className="text-xs bg-brand-100 text-pepper-700 font-semibold">
              {initials(user?.name || 'US')}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink truncate leading-none">{user?.name || 'Usuaria'}</p>
            <p className="text-xs text-ink-muted mt-0.5">{user?.role ? ROLE_LABELS[user.role as Role] : ''}</p>
          </div>
          <button
            onClick={() => setChangingPassword(true)}
            title="Cambiar mi contraseña"
            aria-label="Cambiar mi contraseña"
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1 rounded-lg hover:bg-brand-100"
          >
            <KeyRound className="w-3.5 h-3.5 text-ink-muted" />
          </button>
          <button
            onClick={() => { clearAuth(); router.push('/login'); }}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1 rounded-lg hover:bg-brand-100"
          >
            <LogOut className="w-3.5 h-3.5 text-ink-muted" />
          </button>
        </div>
      </div>
      {changingPassword && <ChangePasswordModal onClose={() => setChangingPassword(false)} />}
    </aside>
  );
}
