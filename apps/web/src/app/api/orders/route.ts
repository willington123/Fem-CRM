import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorized } from '@/lib/auth-server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const page   = parseInt(searchParams.get('page')  || '1');
  const limit  = Math.min(parseInt(searchParams.get('limit') || '1000'), 1000);
  const skip   = (page - 1) * limit;

  const where: any = {};
  if (status) where.status = status;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where, skip, take: limit,
      orderBy: { createdAt: 'desc' },
      include: { customer: { select: { id: true, name: true, phone: true, city: true } } },
    }),
    prisma.order.count({ where }),
  ]);

  return NextResponse.json({ data: orders, total });
}
