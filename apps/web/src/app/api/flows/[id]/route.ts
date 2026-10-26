import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth-server';
import { can } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const flow = await prisma.flowTemplate.findUnique({
    where: { id: params.id },
    include: { executions: { orderBy: { createdAt: 'desc' }, take: 20 } },
  });
  if (!flow) return NextResponse.json({ error: 'Flujo no encontrado' }, { status: 404 });
  return NextResponse.json(flow);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!can(user.role, 'flows.manage')) return forbidden();

  const body = await req.json().catch(() => ({}));
  const data = pick(body, ['name', 'description', 'isActive', 'conditions', 'steps']);
  const flow = await prisma.flowTemplate.update({ where: { id: params.id }, data });
  return NextResponse.json(flow);
}

/** Solo estos campos se pueden cambiar desde la API; el resto (id, fechas…) no. */
function pick(body: any, keys: string[]) {
  return Object.fromEntries(keys.filter(k => body?.[k] !== undefined).map(k => [k, body[k]]));
}
