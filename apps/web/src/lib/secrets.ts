import crypto from 'crypto';
import { NextResponse } from 'next/server';

/**
 * Secretos del servidor. Si falta uno, se RECHAZA la petición: antes se usaba
 * 'secret' como clave por defecto o se saltaba la verificación, y eso dejaba
 * fabricar sesiones de administradora o meter webhooks falsos.
 */

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET no está configurado');
  return secret;
}

/** Devuelve el secreto o null, avisando en el log de que falta. */
export function webhookSecret(name: string): string | null {
  const value = process.env[name];
  if (!value) console.error(`[Seguridad] ${name} no está configurado — se rechaza la petición`);
  return value || null;
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Los crons de Vercel mandan `Authorization: Bearer CRON_SECRET`. Sin secreto, nadie entra. */
export function checkCronAuth(authHeader: string | null): NextResponse | null {
  const secret = webhookSecret('CRON_SECRET');
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 503 });
  if (!authHeader || !safeEqual(authHeader, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  return null;
}
