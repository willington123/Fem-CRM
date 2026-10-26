import { NextRequest, NextResponse } from 'next/server';
import { checkCronAuth } from '@/lib/secrets';
import { processScheduled } from '@/services/order-flow';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Ejecuta los pasos del flujo que ya vencieron: el recordatorio de confirmación
 * a los 90 minutos y la escalada a una persona 2 horas después. Corre cada 10
 * minutos (vercel.json), que es precisión de sobra para esos tiempos.
 */
export async function GET(req: NextRequest) {
  const denied = checkCronAuth(req.headers.get('authorization'));
  if (denied) return denied;

  try {
    const result = await processScheduled();
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('[cron/flows]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
