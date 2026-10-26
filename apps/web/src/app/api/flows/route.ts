import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth-server';
import { can } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const flows = await prisma.flowTemplate.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { executions: true } } },
  });
  return NextResponse.json(flows);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!can(user.role, 'flows.manage')) return forbidden();

  const body = await req.json().catch(() => ({}));
  if (!body.name || !body.trigger) return NextResponse.json({ error: 'Faltan nombre y disparador' }, { status: 400 });
  const flow = await prisma.flowTemplate.create({
    data: { ...pick(body, ['name', 'description', 'trigger', 'conditions', 'steps']), isActive: false } as any,
  });
  return NextResponse.json(flow, { status: 201 });
}

/** Solo estos campos se pueden cambiar desde la API; el resto (id, fechas…) no. */
function pick(body: any, keys: string[]) {
  return Object.fromEntries(keys.filter(k => body?.[k] !== undefined).map(k => [k, body[k]]));
}
