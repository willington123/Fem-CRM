import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth-server';
import { prisma } from '@/lib/prisma';
import { sendWhatsAppMessage, sendWhatsAppTemplate } from '@/services/whatsapp';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (user.role === 'ANALYST') return forbidden();

  const { content, contentType = 'text', isInternal = false, template } = await req.json();
  // template opcional: { name, language?, params?[] } → se envía como plantilla real (válida fuera de la ventana de 24h)

  const conversation = await prisma.conversation.findUnique({
    where: { id: params.id },
    include: { customer: true },
  });
  if (!conversation) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 });

  let message = await prisma.message.create({
    data: {
      conversationId: params.id,
      direction: 'OUTBOUND',
      content,
      contentType,
      isInternal,
      status: 'SENT',
      sentById: user.id === 'demo' ? undefined : user.id,
    },
    include: { sentBy: { select: { id: true, name: true } } },
  });

  await prisma.conversation.update({
    where: { id: params.id },
    data: { lastMessageAt: new Date(), status: 'IN_PROGRESS' },
  });

  let sendError: string | null = null;
  if (!isInternal && conversation.channel === 'WHATSAPP') {
    try {
      const result = template?.name
        ? await sendWhatsAppTemplate(conversation.customer.phone, template.name, template.language || 'es', template.params || [])
        : await sendWhatsAppMessage(conversation.customer.phone, content);
      const wamid = result?.messages?.[0]?.id;
      if (wamid) {
        message = await prisma.message.update({
          where: { id: message.id },
          data: { externalId: wamid },
          include: { sentBy: { select: { id: true, name: true } } },
        });
      }
    } catch (e) {
      console.error('[Mensajes] Falló el envío por WhatsApp:', e);
      sendError = e instanceof Error ? e.message : 'No se pudo enviar por WhatsApp';
      message = await prisma.message.update({
        where: { id: message.id },
        data: { status: 'FAILED' },
        include: { sentBy: { select: { id: true, name: true } } },
      });
    }
  }

  return NextResponse.json({ ...message, sendError });
}
