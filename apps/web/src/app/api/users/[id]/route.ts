import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth-server';
import { can, ROLES } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { setPassword, checkPassword, assertKeepsAnAdmin, TeamError } from '@/services/team';

/**
 * Cambia nombre, rol, si está activa, o le pone una contraseña nueva.
 * Desactivar no borra nada: sus mensajes y pedidos se conservan, solo deja de
 * poder entrar (la sesión abierta se corta en la siguiente petición).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!can(user.role, 'team.manage')) return forbidden();

  const body = await req.json().catch(() => ({}));
  const target = await prisma.crmUser.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: 'No se encontró esa persona.' }, { status: 404 });

  try {
    const data: { name?: string; role?: any; isActive?: boolean } = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) throw new TeamError('El nombre no puede quedar vacío.');
      data.name = name;
    }
    if (body.role !== undefined) {
      if (!ROLES.includes(body.role)) throw new TeamError('Rol no válido.');
      data.role = body.role;
    }
    if (body.isActive !== undefined) data.isActive = !!body.isActive;

    // Evita quedarse fuera por error: nadie se quita a sí mismo el acceso.
    if (target.id === user.id && (data.isActive === false || (data.role && data.role !== 'ADMIN'))) {
      throw new TeamError('No puedes desactivar tu propia cuenta ni quitarte el rol de Administración. Pídeselo a otra persona de Administración.');
    }
    await assertKeepsAnAdmin(target.id, data);

    if (body.password !== undefined) {
      await setPassword(target, checkPassword(body.password));
    }

    const updated = Object.keys(data).length
      ? await prisma.crmUser.update({ where: { id: target.id }, data })
      : target;

    // Al desactivar, sus conversaciones abiertas vuelven a quedar sin asignar.
    if (data.isActive === false) {
      await prisma.conversation.updateMany({
        where: { assignedTo: target.id, status: { not: 'RESOLVED' } },
        data: { assignedTo: null },
      });
    }

    await prisma.activityLog.create({
      data: {
        userId: user.id, action: 'team.update', resource: 'crm_user', resourceId: target.id,
        metadata: { ...data, passwordReset: body.password !== undefined },
      },
    }).catch(() => {});

    const { id, name, email, role, isActive, createdAt } = updated;
    return NextResponse.json({ id, name, email, role, isActive, createdAt });
  } catch (e) {
    if (e instanceof TeamError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[users] edición', e);
    return NextResponse.json({ error: 'No se pudo guardar.' }, { status: 500 });
  }
}
