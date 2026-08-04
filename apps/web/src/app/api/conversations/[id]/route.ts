import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorized } from '@/lib/auth-server';
import { prisma } from '@/lib/prisma';
import { signMediaToken } from '@/services/media';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const conversation = await prisma.conversation.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      agent:    { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: 'asc' },
        include: {
          sentBy: { select: { id: true, name: true } },
          // Sin `data`: el binario se sirve aparte por /api/media/[id].
          media:  { select: { mimeType: true, filename: true, size: true } },
        },
      },
    },
  });
  if (!conversation) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 });

  // Cada adjunto viaja con su URL ya firmada, lista para <img src>.
  const messages = conversation.messages.map(m =>
    m.media
      ? { ...m, media: { ...m.media, url: `/api/media/${m.id}?t=${signMediaToken(m.id)}` } }
      : m,
  );

  await prisma.conversation.update({ where: { id: params.id }, data: { isRead: true } });
  return NextResponse.json({ ...conversation, messages });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { status, assignedTo, tags } = await req.json();
  const conversation = await prisma.conversation.update({
    where: { id: params.id },
    data: { status, assignedTo, tags },
    include: { agent: { select: { id: true, name: true } } },
  });
  return NextResponse.json(conversation);
}
