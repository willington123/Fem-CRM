import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth-server';
import { prisma } from '@/lib/prisma';
import type { PlatformKey } from '@/lib/integrations';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface TestResult {
  ok: boolean;
  /** Frase corta y accionable: qué pasó y, si falló, qué revisar. */
  detail: string;
}

/**
 * Prueba de verdad contra cada proveedor. Tener la variable puesta no significa
 * que sirva: un token caducado o un dominio mal escrito solo se ven llamando.
 */
async function testDatabase(): Promise<TestResult> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const customers = await prisma.customer.count();
    return { ok: true, detail: `Conectada. ${customers} clienta${customers === 1 ? '' : 's'} en la base.` };
  } catch (e: any) {
    return { ok: false, detail: `No conecta: ${e.message ?? 'error desconocido'}. Revisa DATABASE_URL.` };
  }
}

/**
 * Aquí no hay a quién llamar: lo que puede fallar es que el secreto exista pero
 * sea corto o de ejemplo, y eso sí se puede comprobar.
 */
async function testApp(): Promise<TestResult> {
  const jwt  = process.env.JWT_SECRET ?? '';
  const cron = process.env.CRON_SECRET ?? '';
  const problemas: string[] = [];

  if (!jwt) problemas.push('falta JWT_SECRET');
  else if (jwt.length < 32) problemas.push('JWT_SECRET es demasiado corto (usa 48 bytes aleatorios)');
  else if (/^(secret|changeme|demo|test|preview)/i.test(jwt)) problemas.push('JWT_SECRET parece de ejemplo');

  if (!cron) problemas.push('falta CRON_SECRET: los crons se rechazan y no corren');

  if (process.env.ALLOW_DEV_LOGIN === 'true') {
    problemas.push('ALLOW_DEV_LOGIN está activo (inofensivo aquí porque la base no es local, pero sobra)');
  }

  return problemas.length
    ? { ok: false, detail: problemas.join(' · ') }
    : { ok: true, detail: 'Secretos presentes y con longitud suficiente.' };
}

async function testMeta(): Promise<TestResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const waba  = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (!token) return { ok: false, detail: 'Falta WHATSAPP_ACCESS_TOKEN.' };
  if (!waba)  return { ok: false, detail: 'Falta WHATSAPP_BUSINESS_ACCOUNT_ID.' };

  try {
    const res = await fetch(
      `https://graph.facebook.com/v23.0/${waba}/message_templates?fields=name,status&limit=50`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const data = await res.json();
    if (!res.ok || data.error) {
      const msg = data.error?.message ?? `HTTP ${res.status}`;
      const caducado = /expired|session|OAuth/i.test(msg);
      return {
        ok: false,
        detail: caducado
          ? `Token inválido o caducado: ${msg}. Genera uno permanente con un usuario de sistema.`
          : `Meta respondió: ${msg}`,
      };
    }
    const total = data.data?.length ?? 0;
    const aprobadas = data.data?.filter((t: any) => t.status === 'APPROVED').length ?? 0;
    return { ok: true, detail: `Conectada. ${total} plantilla${total === 1 ? '' : 's'}, ${aprobadas} aprobada${aprobadas === 1 ? '' : 's'}.` };
  } catch (e: any) {
    return { ok: false, detail: `No se pudo alcanzar Graph API: ${e.message ?? 'error de red'}.` };
  }
}

const TESTS: Record<PlatformKey, () => Promise<TestResult>> = {
  DATABASE:   testDatabase,
  APP:        testApp,
  META:       testMeta,
};

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (user.role !== 'ADMIN') return forbidden();

  const { platform } = await req.json().catch(() => ({ platform: null }));
  const run = TESTS[platform as PlatformKey];
  if (!run) return NextResponse.json({ error: 'Plataforma desconocida' }, { status: 400 });

  const result = await run();
  return NextResponse.json({ platform, ...result });
}
