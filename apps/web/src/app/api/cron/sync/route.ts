import { NextRequest, NextResponse } from 'next/server';
import { runMastershopSync } from '@/services/mastershop-sync';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Ejecutado por el cron de Vercel (vercel.json). Los webhooks de Mastershop
// actualizan en tiempo real; este cron reconcilia cualquier evento perdido.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  if (!process.env.MASTERSHOP_API_KEY) {
    return NextResponse.json({ error: 'MASTERSHOP_API_KEY no configurado' }, { status: 500 });
  }

  const days = parseInt(new URL(req.url).searchParams.get('days') || '30');

  try {
    const result = await runMastershopSync({ days });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[cron/sync]', err);
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
