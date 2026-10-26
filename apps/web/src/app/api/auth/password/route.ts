import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorized } from '@/lib/auth-server';
import { prisma } from '@/lib/prisma';
import { setPassword, verifyPassword, checkPassword, TeamError } from '@/services/team';

/** Cualquiera con sesión cambia su propia contraseña, confirmando la actual. */
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { currentPassword, newPassword } = await req.json().catch(() => ({}));
  try {
    const next = checkPassword(newPassword);
    if (!(await verifyPassword(user.email, String(currentPassword ?? '')))) {
      throw new TeamError('La contraseña actual no es correcta.', 403);
    }
    const me = await prisma.crmUser.findUnique({ where: { id: user.id } });
    if (!me) return unauthorized();
    await setPassword(me, next);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TeamError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[auth/password]', e);
    return NextResponse.json({ error: 'No se pudo cambiar la contraseña.' }, { status: 500 });
  }
}
