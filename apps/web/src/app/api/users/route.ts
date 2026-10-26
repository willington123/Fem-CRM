import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth-server';
import { can, ROLES } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { createLogin, checkPassword, TeamError } from '@/services/team';

export const dynamic = 'force-dynamic';

/**
 * Administración ve el equipo completo. El resto solo ve quién está activo
 * (nombre y rol), que es lo que hace falta para asignar conversaciones.
 */
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  if (!can(user.role, 'team.manage')) {
    const active = await prisma.crmUser.findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(active);
  }

  const users = await prisma.crmUser.findMany({
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    select: {
      id: true, name: true, email: true, role: true, isActive: true, createdAt: true,
      authUserId: true,
      _count: { select: { assignedConversations: { where: { status: { not: 'RESOLVED' } } } } },
    },
  });
  return NextResponse.json(users.map(({ authUserId, ...u }) => ({ ...u, hasLogin: !!authUserId })));
}

/** Da de alta a una persona: cuenta de acceso + fila en el CRM. */
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!can(user.role, 'team.manage')) return forbidden();

  const body = await req.json().catch(() => ({}));
  const name  = String(body.name ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const role  = String(body.role ?? 'AGENT');

  try {
    if (!name) throw new TeamError('Escribe el nombre.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new TeamError('El correo no es válido.');
    if (!ROLES.includes(role as any)) throw new TeamError('Rol no válido.');
    const password = checkPassword(body.password);

    const exists = await prisma.crmUser.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    if (exists) throw new TeamError('Ya hay alguien del equipo con ese correo.', 409);

    const { authUserId, existing } = await createLogin(email, password);
    const created = await prisma.crmUser.create({
      data: { name, email, role: role as any, authUserId, isActive: true },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    });

    await prisma.activityLog.create({
      data: { userId: user.id, action: 'team.create', resource: 'crm_user', resourceId: created.id, metadata: { role } },
    }).catch(() => {});

    return NextResponse.json({ user: created, existingLogin: existing }, { status: 201 });
  } catch (e) {
    if (e instanceof TeamError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[users] alta', e);
    return NextResponse.json({ error: 'No se pudo crear la cuenta.' }, { status: 500 });
  }
}
