import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth-server';
import { can } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!can(user.role, 'templates.manage')) return forbidden();

  const body = await req.json().catch(() => ({}));
  const data = pick(body, ['shortcut', 'category', 'content', 'variables', 'channels']);
  const template = await prisma.messageTemplate.update({ where: { id: params.id }, data });
  return NextResponse.json(template);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!can(user.role, 'templates.manage')) return forbidden();

  await prisma.messageTemplate.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}

/** Solo estos campos se pueden cambiar desde la API; el resto (id, fechas…) no. */
function pick(body: any, keys: string[]) {
  return Object.fromEntries(keys.filter(k => body?.[k] !== undefined).map(k => [k, body[k]]));
}
