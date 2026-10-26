'use client';
import { useEffect, useState } from 'react';
import { AuthUser, getUser } from '@/lib/auth';
import { api } from '@/lib/api';
import { can, Permission } from '@/lib/permissions';

/**
 * Quién está usando el CRM. Arranca con lo guardado al entrar y lo refresca
 * con el servidor, para que un cambio de rol se note sin volver a iniciar sesión.
 * Solo sirve para esconder botones: los permisos de verdad los aplica la API.
 */
export function useCurrentUser() {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(getUser());
    api.get<AuthUser>('/api/auth/me')
      .then(fresh => {
        if (!fresh) return;
        setUser(fresh);
        try { localStorage.setItem('konnexa_user', JSON.stringify(fresh)); } catch {}
      })
      .catch(() => {});
  }, []);

  return {
    user,
    can: (permission: Permission) => can(user?.role, permission),
  };
}
