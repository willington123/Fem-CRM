import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorized } from '@/lib/auth-server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const where: any = {};
  if (status) where.status = status;

  const carts = await prisma.abandonedCart.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { customer: { select: { id: true, name: true, phone: true, city: true } } },
  });

  return NextResponse.json({ data: carts, total: carts.length });
}
