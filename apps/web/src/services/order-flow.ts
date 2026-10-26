import { prisma } from '@/lib/prisma';
import { sendWhatsAppTemplate } from '@/services/whatsapp';
import { appendStatusHistory } from '@/services/orders';

/**
 * Motor del flujo de pedido: desde que la clienta compra hasta que le entregan.
 * Cada estado del pedido dispara su paso (plantilla de WhatsApp) si el flujo
 * correspondiente está encendido en /flows.
 */
export type FlowStep =
  | 'POR_CONFIRMAR'
  | 'POR_ALISTAR'
  | 'EN_TRANSITO'
  | 'EN_REPARTO'
  | 'EN_OFICINA'
  | 'ENTREGADO'
  | 'NOVEDAD'
  | 'DEVOLUCION';

/** Paso del flujo que corresponde a un estado del pedido. `null` = no manda nada. */
export function stepForStatus(status: string): FlowStep | null {
  switch (status) {
    case 'PENDING_CONFIRMATION': return 'POR_CONFIRMAR';
    case 'DISPATCHED':           return 'POR_ALISTAR';
    case 'IN_TRANSIT':           return 'EN_TRANSITO';
    case 'OUT_FOR_DELIVERY':     return 'EN_REPARTO';
    case 'IN_DESTINATION':       return 'EN_OFICINA';
    case 'DELIVERED':            return 'ENTREGADO';
    case 'FAILED_DELIVERY':      return 'NOVEDAD';
    case 'RETURNED':             return 'DEVOLUCION';
    default:                     return null;
  }
}

export const STEP_TRIGGER: Record<FlowStep, string> = {
  POR_CONFIRMAR: 'ORDER_CREATED',
  POR_ALISTAR:   'ORDER_DISPATCHED',
  EN_TRANSITO:   'ORDER_IN_TRANSIT',
  EN_REPARTO:    'ORDER_OUT_FOR_DELIVERY',
  EN_OFICINA:    'ORDER_AT_OFFICE',
  ENTREGADO:     'ORDER_DELIVERED',
  NOVEDAD:       'ORDER_NOVELTY',
  DEVOLUCION:    'ORDER_RETURNED',
};

export const STEP_LABEL: Record<FlowStep, string> = {
  POR_CONFIRMAR: 'Paso 1 · Por confirmar',
  POR_ALISTAR:   'Paso 2 · Por alistar',
  EN_TRANSITO:   'Paso 3 · En tránsito',
  EN_REPARTO:    'Paso 4 · En reparto',
  EN_OFICINA:    'Paso 5 · Entrega en oficina',
  ENTREGADO:     'Paso 6 · Entregado',
  NOVEDAD:       'Paso 7 · Novedad',
  DEVOLUCION:    'Paso 8 · Devolución',
};

/** Minutos de espera antes del recordatorio de confirmación y de escalar a humano. */
export const REMINDER_DELAY_MIN   = 90;
export const ESCALATION_DELAY_MIN = 120;

interface OrderContext {
  firstName: string;
  product: string;
  address: string;
  city: string;
  guide: string;
  carrier: string;
}

function buildContext(order: any): OrderContext {
  const items = Array.isArray(order.items) ? order.items : [];
  const addr  = (order.shippingAddress ?? {}) as Record<string, string>;

  return {
    firstName: (order.customer?.name ?? '').trim().split(/\s+/)[0] || 'Hola',
    product:   items[0]?.name?.trim() || items[0]?.name_product?.trim() || 'tu pedido Fem',
    address:   addr.address || addr.address1 || 'la dirección registrada',
    city:      addr.city || order.customer?.city || 'tu ciudad',
    guide:     order.trackingNumber || 'la guía asignada',
    carrier:   order.carrier || 'la transportadora',
  };
}

const ORDER_WITH_CONTEXT = { customer: true } as const;

/** Plantillas que manda cada paso, en orden. El paso 6 manda dos. */
function templatesForStep(step: FlowStep, c: OrderContext): { name: string; params: string[] }[] {
  switch (step) {
    case 'POR_CONFIRMAR':
      return [{ name: 'pedido_por_confirmar', params: [c.firstName, c.product, c.address, c.city] }];
    case 'POR_ALISTAR':
      return [{ name: 'pedido_despachado', params: [c.guide, c.carrier] }];
    case 'EN_TRANSITO':
      return [{ name: 'pedido_en_transito', params: [c.firstName, c.guide, c.carrier] }];
    case 'EN_REPARTO':
      return [{ name: 'pedido_en_reparto', params: [c.firstName] }];
    case 'EN_OFICINA':
      return [{ name: 'pedido_entrega_oficina', params: [c.firstName, c.carrier, c.guide] }];
    case 'ENTREGADO':
      // Dos mensajes: la confirmación de entrega y, de una, la guía de uso.
      return [
        { name: 'pedido_entregado', params: [c.firstName, c.product] },
        { name: 'guia_de_uso',      params: [] },
      ];
    case 'NOVEDAD':
      return [{ name: 'pedido_novedad', params: [c.firstName] }];
    case 'DEVOLUCION':
      return [{ name: 'pedido_devolucion', params: [c.firstName] }];
  }
}

/**
 * Ejecuta un paso para un pedido: valida que el flujo esté activo, que no se
 * haya mandado ya, envía las plantillas y deja registro en FlowExecution.
 */
/**
 * Qué pasó al ejecutar un paso, para poder contárselo a quien cambió el pedido:
 * sent · failed · off (flujo apagado o sin crear) · already (ya se mandó) ·
 * no_guide (falta la guía) · no_phone.
 */
export type StepResult = 'sent' | 'failed' | 'off' | 'already' | 'no_guide' | 'no_phone';

export async function runStep(orderId: string, step: FlowStep): Promise<StepResult> {
  const flow = await prisma.flowTemplate.findFirst({
    where: { trigger: STEP_TRIGGER[step] as any },
  });
  if (!flow) { console.warn(`[Flujo] Sin FlowTemplate para ${step} — no se envía`); return 'off'; }
  if (!flow.isActive) return 'off';

  // Anti-duplicados: un pedido puede volver a un estado por el que ya pasó.
  const already = await prisma.flowExecution.findFirst({
    where: { orderId, flowTemplateId: flow.id, status: { in: ['sent', 'running'] } },
  });
  if (already) return 'already';

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: ORDER_WITH_CONTEXT });
  if (!order?.customer?.phone || !order.customer.phone.startsWith('+')) return 'no_phone';

  // Los pasos que citan el número de guía no salen sin guía: mejor no mandar
  // nada que mandar "la guía asignada". Sin marcar ejecución, así el siguiente
  // cambio del pedido (cuando ya tenga guía) vuelve a intentarlo.
  const guide = order.trackingNumber;
  if (!guide && (['POR_ALISTAR', 'EN_TRANSITO', 'EN_OFICINA'] as FlowStep[]).includes(step)) {
    console.warn(`[Flujo] ${step} aplazado para el pedido ${orderId}: aún sin guía`);
    return 'no_guide';
  }

  const execution = await prisma.flowExecution.create({
    data: {
      flowTemplateId: flow.id,
      customerId: order.customerId,
      orderId,
      status: 'running',
      metadata: { step },
    },
  });

  const ctx  = buildContext(order);
  const sent: string[] = [];
  let failure: string | null = null;

  for (const tpl of templatesForStep(step, ctx)) {
    try {
      const res = await sendWhatsAppTemplate(order.customer.phone, tpl.name, 'es', tpl.params);
      // Sin credenciales la función no manda nada y devuelve null: eso no es un envío.
      if (!res) throw new Error('WhatsApp no está configurado');
      sent.push(tpl.name);
      await recordOutbound(order.customerId, tpl.name, tpl.params, res?.messages?.[0]?.id);
    } catch (e) {
      failure = e instanceof Error ? e.message : 'Error desconocido';
      console.error(`[Flujo] ${step} · ${tpl.name} falló:`, failure);
      break;
    }
  }

  await prisma.flowExecution.update({
    where: { id: execution.id },
    data: {
      status: failure ? 'failed' : 'sent',
      completedAt: new Date(),
      metadata: { step, sent, ...(failure && { error: failure }) },
    },
  });

  // Paso 1: si no contesta, recordatorio a los 90 minutos.
  if (step === 'POR_CONFIRMAR' && !failure) {
    await scheduleConfirmationReminder(orderId, order.customerId);
  }

  return failure ? 'failed' : 'sent';
}

/** Deja el mensaje saliente en la conversación para que se vea en la bandeja. */
async function recordOutbound(customerId: string, templateName: string, params: string[], wamid?: string) {
  let conversation = await prisma.conversation.findFirst({
    where: { customerId, channel: 'WHATSAPP', status: { not: 'RESOLVED' } },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { customerId, channel: 'WHATSAPP', status: 'OPEN', lastMessageAt: new Date() },
    });
  }

  const tpl = await prisma.messageTemplate.findFirst({ where: { name: templateName } });
  const body = tpl?.content
    ? tpl.content.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? `{{${n}}}`)
    : `[Plantilla ${templateName}]`;

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'OUTBOUND',
      content: body,
      status: 'SENT',
      externalId: wamid ?? null,
    },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });
}

/** Programa el recordatorio de confirmación (lo ejecuta /api/cron/flows). */
async function scheduleConfirmationReminder(orderId: string, customerId: string) {
  const flow = await prisma.flowTemplate.findFirst({
    where: { trigger: 'CONFIRMATION_REMINDER' as any },
  });
  if (!flow?.isActive) return;

  const pending = await prisma.flowExecution.findFirst({
    where: { orderId, flowTemplateId: flow.id, status: { in: ['scheduled', 'sent'] } },
  });
  if (pending) return;

  await prisma.flowExecution.create({
    data: {
      flowTemplateId: flow.id,
      customerId,
      orderId,
      status: 'scheduled',
      scheduledAt: new Date(Date.now() + REMINDER_DELAY_MIN * 60_000),
      metadata: { step: 'RECORDATORIO', stage: 'reminder' },
    },
  });
}

/**
 * La clienta tocó un botón de la plantilla de confirmación.
 * Devuelve true si el botón se reconoció y se atendió.
 */
export async function handleConfirmationButton(customerId: string, buttonText: string): Promise<boolean> {
  const text = buttonText.trim().toLowerCase();
  const order = await prisma.order.findFirst({
    where: { customerId, status: { in: ['PENDING_CONFIRMATION', 'PREPARING'] } },
    orderBy: { createdAt: 'desc' },
    include: { customer: true },
  });
  if (!order) return false;

  // Cualquiera de los dos botones cancela el recordatorio pendiente.
  await cancelPendingReminders(order.id);

  if (text.startsWith('confirmar')) {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        confirmedAt: new Date(),
        ...(order.status === 'PENDING_CONFIRMATION' && {
          status: 'CONFIRMED',
          statusHistory: appendStatusHistory(order.statusHistory, {
            status: 'CONFIRMED', source: 'whatsapp-boton', changedAt: new Date().toISOString(),
          }),
        }),
      },
    });
    await sendAndRecord(order, 'confirmacion_recibida', []);
    await tagCustomer(customerId, 'confirmado-whatsapp');
    return true;
  }

  if (text.includes('duda') || text.includes('humano') || text.includes('ayuda')) {
    await sendAndRecord(order, 'confirmacion_dudas', []);
    await tagCustomer(customerId, 'prioridad');
    await flagForHuman(customerId, 'La clienta pidió ayuda desde la plantilla de confirmación');
    return true;
  }

  return false;
}

async function sendAndRecord(order: any, templateName: string, params: string[]) {
  try {
    const res = await sendWhatsAppTemplate(order.customer.phone, templateName, 'es', params);
    await recordOutbound(order.customerId, templateName, params, res?.messages?.[0]?.id);
  } catch (e) {
    console.error(`[Flujo] No se pudo enviar ${templateName}:`, e);
  }
}

export async function cancelPendingReminders(orderId: string) {
  await prisma.flowExecution.updateMany({
    where: { orderId, status: 'scheduled' },
    data: { status: 'cancelled', completedAt: new Date() },
  });
}

async function tagCustomer(customerId: string, tag: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer || customer.tags.includes(tag)) return;
  await prisma.customer.update({
    where: { id: customerId },
    data: { tags: { push: tag } },
  });
}

/** Marca la conversación como no leída y con prioridad para que la atienda una persona. */
async function flagForHuman(customerId: string, reason: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { customerId, channel: 'WHATSAPP', status: { not: 'RESOLVED' } },
    orderBy: { lastMessageAt: 'desc' },
  });
  if (!conversation) return;

  const tags = conversation.tags.includes('prioridad')
    ? conversation.tags
    : [...conversation.tags, 'prioridad'];

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { tags, isRead: false, status: 'OPEN' },
  });
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'OUTBOUND',
      content: `⚑ ${reason}`,
      isInternal: true,
      status: 'SENT',
    },
  });
}

/**
 * Procesa los pasos programados que ya vencieron. Lo llama /api/cron/flows.
 * Devuelve cuántos atendió.
 */
export async function processScheduled(): Promise<{ reminders: number; escalations: number }> {
  const due = await prisma.flowExecution.findMany({
    where: { status: 'scheduled', scheduledAt: { lte: new Date() } },
    include: { order: { include: ORDER_WITH_CONTEXT } },
    take: 100,
  });

  let reminders = 0;
  let escalations = 0;

  for (const exec of due) {
    const order = exec.order;
    const stage = (exec.metadata as any)?.stage;

    // Si ya confirmó o el pedido avanzó, el recordatorio sobra.
    if (!order || order.confirmedAt || order.status !== 'PENDING_CONFIRMATION') {
      await prisma.flowExecution.update({
        where: { id: exec.id },
        data: { status: 'cancelled', completedAt: new Date() },
      });
      continue;
    }

    if (stage === 'reminder') {
      const ctx = buildContext(order);
      const params = [ctx.product, ctx.address, ctx.city];
      let failed = false;

      try {
        const res = await sendWhatsAppTemplate(
          order.customer.phone, 'pedido_recordatorio_confirmacion', 'es', params,
        );
        await recordOutbound(order.customerId, 'pedido_recordatorio_confirmacion',
          params, res?.messages?.[0]?.id);
        reminders++;
      } catch (e) {
        failed = true;
        console.error('[Flujo] Recordatorio falló:', e);
      }

      // Si falla (p. ej. la plantilla sigue en revisión), se reintenta en 30 min
      // hasta 3 veces en vez de perder el recordatorio.
      const attempts = Number((exec.metadata as any)?.attempts ?? 0) + 1;
      if (failed && attempts < 3) {
        await prisma.flowExecution.update({
          where: { id: exec.id },
          data: {
            scheduledAt: new Date(Date.now() + 30 * 60_000),
            metadata: { step: 'RECORDATORIO', stage: 'reminder', attempts },
          },
        });
        continue;
      }

      await prisma.flowExecution.update({
        where: { id: exec.id },
        data: {
          status: failed ? 'failed' : 'sent',
          completedAt: new Date(),
          metadata: { step: 'RECORDATORIO', stage: 'reminder', attempts },
        },
      });

      // Sigue sin responder: escalar a una persona en 2 horas.
      await prisma.flowExecution.create({
        data: {
          flowTemplateId: exec.flowTemplateId,
          customerId: exec.customerId,
          orderId: exec.orderId,
          status: 'scheduled',
          scheduledAt: new Date(Date.now() + ESCALATION_DELAY_MIN * 60_000),
          metadata: { step: 'RECORDATORIO', stage: 'escalation' },
        },
      });
    }

    if (stage === 'escalation') {
      await tagCustomer(order.customerId, 'prioridad');
      await flagForHuman(order.customerId,
        'No respondió a la confirmación ni al recordatorio — atender con prioridad');
      await prisma.flowExecution.update({
        where: { id: exec.id },
        data: { status: 'sent', completedAt: new Date() },
      });
      escalations++;
    }
  }

  return { reminders, escalations };
}
