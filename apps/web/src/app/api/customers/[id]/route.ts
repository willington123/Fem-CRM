import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorized } from '@/lib/auth-server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const customer = await prisma.customer.findUnique({
    where: { id: params.id },
    include: {
      orders:        { orderBy: { createdAt: 'desc' } },
      conversations: { orderBy: { lastMessageAt: 'desc' }, include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } } },
    },
  });
  if (!customer) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
  return NextResponse.json(customer);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { tags, notes, status } = await req.json();
  const customer = await prisma.customer.update({
    where: { id: params.id },
    data: { tags, notes, status },
  });
  return NextResponse.json(customer);
}
