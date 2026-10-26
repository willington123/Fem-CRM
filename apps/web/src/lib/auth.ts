'use client';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'AGENT' | 'ANALYST';
  avatar?: string;
}

export function getUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('konnexa_user');
  return raw ? JSON.parse(raw) : null;
}

export function setAuth(token: string, user: AuthUser) {
  localStorage.setItem('konnexa_token', token);
  localStorage.setItem('konnexa_user', JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem('konnexa_token');
  localStorage.removeItem('konnexa_user');
}

export function isAuthenticated() {
  return !!localStorage.getItem('konnexa_token');
}
