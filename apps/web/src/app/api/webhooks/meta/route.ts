import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { markMessageRead } from '@/services/whatsapp';
import { handleConfirmationButton } from '@/services/order-flow';
import { attachMediaToMessage } from '@/services/media';
import { describeIncoming } from '@/services/whatsapp-inbound';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode      = searchParams.get('hub.mode');
  const token     = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!verifySignature(rawBody, req.headers.get('x-hub-signature-256'))) {
    console.warn('[Meta webhook] Firma inválida — evento rechazado');
    return new NextResponse('Invalid signature', { status: 401 });
  }

  // En Vercel la función se congela al responder: hay que procesar ANTES de
  // devolver el 200 (si no, los eventos se pierden). Meta tolera unos segundos.
  const body = JSON.parse(rawBody);
  try {
    await processMetaEvent(body);
  } catch (e) {
    console.error('[Meta webhook]', e);
  }
  return new NextResponse('EVENT_RECEIVED', { status: 200 });
}

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return true; // sin secreto configurado no hay forma de validar

  if (!signatureHeader?.startsWith('sha256=')) return false;
  const received = signatureHeader.slice('sha256='.length);
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
  } catch {
    return false;
  }
}

async function processMetaEvent(body: any) {
  if (body.object !== 'whatsapp_business_account' && body.object !== 'page' && body.object !== 'instagram') return;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;

      if (value?.messages) {
        for (const message of value.messages) {
          // Los errores se registran: tragárselos en silencio fue lo que dejó
          // mensajes en "[Mensaje sin texto]" sin rastro de qué había pasado.
          await handleIncomingWhatsApp(message, value.contacts?.[0])
            .catch(e => console.error('[Meta webhook] Entrante de WhatsApp:', e));
        }
      }

      if (value?.statuses) {
        for (const status of value.statuses) {
          await handleMessageStatus(status)
            .catch(e => console.error('[Meta webhook] Estado de mensaje:', e));
        }
      }

      for (const messaging of entry.messaging || []) {
        if (messaging.message) {
          await handleIncomingInstagramFacebook(messaging, entry.id)
            .catch(e => console.error('[Meta webhook] Entrante de IG/Messenger:', e));
        }
      }
    }
  }
}

async function handleIncomingWhatsApp(message: any, contact: any) {
  const phone = `+${message.from}`;
  const info = describeIncoming(message);
  const { attachment } = info;
  let content = info.content;

  // Una reacción suelta no dice nada: se cita el mensaje al que responde.
  if (info.reactionTo) {
    const target = await prisma.message.findFirst({
      where: { externalId: info.reactionTo },
      select: { content: true },
    });
    if (target) {
      const cita = target.content.replace(/\s+/g, ' ').trim();
      content = `${content}: "${cita.slice(0, 60)}${cita.length > 60 ? '…' : ''}"`;
    }
  }

  // Lo que no se reconoce se guarda crudo: es la única forma de saber después
  // qué mandó la clienta, porque la Cloud API no deja releer el mensaje.
  if (!info.understood) {
    await prisma.webhookEvent.create({
      data: {
        platform: 'META',
        eventType: `whatsapp.${message.type ?? 'desconocido'}`,
        status: 'IGNORED',
        payload: message,
        headers: {},
        error: 'Tipo de mensaje entrante sin soporte en el CRM',
      },
    }).catch(e => console.error('[Meta webhook] No se pudo guardar el payload crudo:', e));
  }

  let customer = await prisma.customer.findUnique({ where: { phone } });
  if (!customer) {
    customer = await prisma.customer.create({
      data: { phone, name: contact?.profile?.name || 'Nuevo contacto', originChannel: 'WHATSAPP', status: 'NEW' },
    });
  }

  let conversation = await prisma.conversation.findFirst({
    where: { customerId: customer.id, channel: 'WHATSAPP', status: { not: 'RESOLVED' } },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { customerId: customer.id, channel: 'WHATSAPP', status: 'OPEN', lastMessageAt: new Date() },
    });
  } else {
    await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date(), isRead: false } });
  }

  const stored = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'INBOUND',
      content,
      contentType: info.contentType,
      externalId: message.id,
      status: 'DELIVERED',
    },
  });

  if (attachment) {
    const ok = await attachMediaToMessage(stored.id, attachment.mediaId, attachment.filename);
    // Si la descarga falla el mensaje queda con su etiqueta pero sin archivo, y
    // eso no se distingue de un adjunto normal en la bandeja: se deja dicho.
    if (!ok) {
      await prisma.message.update({
        where: { id: stored.id },
        data: { content: `${content} · ⚠️ no se pudo descargar el archivo` },
      });
    }
  }

  await markMessageRead(message.id).catch(() => {});

  // Botón de la plantilla de confirmación: responde y ramifica el flujo.
  if (info.quickReply) {
    await handleConfirmationButton(customer.id, info.quickReply)
      .catch(e => console.error('[Meta webhook] Botón de confirmación:', e));
  }
}

async function handleIncomingInstagramFacebook(messaging: any, pageId: string) {
  const senderId = messaging.sender.id;
  const content  = messaging.message?.text || '[Multimedia]';
  const channel  = pageId === process.env.META_INSTAGRAM_ACCOUNT_ID ? 'INSTAGRAM' : 'FACEBOOK';

  let customer = await prisma.customer.findFirst({ where: { phone: `ig_${senderId}` } });
  if (!customer) {
    customer = await prisma.customer.create({
      data: { phone: `ig_${senderId}`, name: `Usuario ${channel}`, originChannel: channel as any, status: 'NEW' },
    });
  }

  let conversation = await prisma.conversation.findFirst({
    where: { customerId: customer.id, channel: channel as any, status: { not: 'RESOLVED' } },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { customerId: customer.id, channel: channel as any, externalId: senderId, status: 'OPEN', lastMessageAt: new Date() },
    });
  }

  await prisma.message.create({
    data: { conversationId: conversation.id, direction: 'INBOUND', content, status: 'DELIVERED' },
  });
}

async function handleMessageStatus(status: any) {
  const map: Record<string, string> = { sent: 'SENT', delivered: 'DELIVERED', read: 'READ', failed: 'FAILED' };
  const mapped = map[status.status];
  if (!mapped) return;
  await prisma.message.updateMany({ where: { externalId: status.id }, data: { status: mapped as any } });
}
