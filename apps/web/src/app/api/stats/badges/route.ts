import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorized } from '@/lib/auth-server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Contadores del menú lateral. Antes eran números fijos escritos a mano
 * («Bandeja 3»), que mienten en cuanto el CRM tiene datos reales.
 */
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  try {
    const [inbox, orders] = await Promise.all([
      prisma.conversation.count({ where: { isRead: false, status: { not: 'RESOLVED' } } }),
      prisma.order.count({ where: { status: 'PENDING_CONFIRMATION' } }),
    ]);

    return NextResponse.json({ inbox, orders });
  } catch (e) {
    console.error('[stats/badges]', e);
    // Un fallo aquí no puede romper la navegación: se devuelven ceros.
    return NextResponse.json({ inbox: 0, orders: 0 });
  }
}
