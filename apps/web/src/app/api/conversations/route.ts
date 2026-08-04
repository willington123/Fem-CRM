import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorized } from '@/lib/auth-server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const channel = searchParams.get('channel');
  const status  = searchParams.get('status');
  const tag     = searchParams.get('tag');
  const agentId = searchParams.get('agentId');
  const search  = searchParams.get('search');
  const page    = parseInt(searchParams.get('page')  || '1');
  const limit   = parseInt(searchParams.get('limit') || '30');
  const skip    = (page - 1) * limit;

  const where: any = {};
  if (channel) where.channel = channel;
  if (status)  where.status  = status;
  if (agentId) where.assignedTo = agentId;
  if (tag)     where.tags = { has: tag };
  if (search)  where.customer = { OR: [{ name: { contains: search, mode: 'insensitive' } }, { phone: { contains: search } }] };

  const [conversations, total] = await Promise.all([
    prisma.conversation.findMany({
      where, skip, take: limit,
      orderBy: { lastMessageAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true, phone: true, city: true, ltv: true, totalOrders: true } },
        agent:    { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    }),
    prisma.conversation.count({ where }),
  ]);

  return NextResponse.json({ data: conversations, total });
}
