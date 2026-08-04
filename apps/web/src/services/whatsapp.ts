const BASE_URL = 'https://graph.facebook.com/v23.0';

export async function sendWhatsAppMessage(to: string, body: string, templateName?: string) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !token) {
    console.warn('[WhatsApp] No configurado — mensaje no enviado');
    return null;
  }

  const payload = templateName
    ? { messaging_product: 'whatsapp', to, type: 'template', template: { name: templateName, language: { code: 'es' } } }
    : { messaging_product: 'whatsapp', to, type: 'text', text: { body } };

  const res = await fetch(`${BASE_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    console.error('[WhatsApp] Error al enviar:', JSON.stringify(data.error || data));
    throw new Error(data.error?.message || `WhatsApp API respondió ${res.status}`);
  }

  return data;
}

// Envía una plantilla APROBADA (type: template). Funciona fuera de la ventana de 24h,
// a diferencia del texto libre. bodyParams son los valores para {{1}}, {{2}}… en orden.
export async function sendWhatsAppTemplate(
  to: string, name: string, language: string, bodyParams: string[] = [],
) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !token) {
    console.warn('[WhatsApp] No configurado — plantilla no enviada');
    return null;
  }

  const template: Record<string, unknown> = { name, language: { code: language || 'es' } };
  if (bodyParams.length) {
    template.components = [{
      type: 'body',
      parameters: bodyParams.map(text => ({ type: 'text', text })),
    }];
  }

  const res = await fetch(`${BASE_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'template', template }),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    console.error('[WhatsApp] Error al enviar plantilla:', JSON.stringify(data.error || data));
    throw new Error(data.error?.message || `WhatsApp API respondió ${res.status}`);
  }
  return data;
}

export interface MetaTemplate {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components?: { type: string; text?: string }[];
}

export async function fetchMetaTemplates(): Promise<MetaTemplate[] | null> {
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!wabaId || !token) return null;

  const templates: MetaTemplate[] = [];
  let url = `${BASE_URL}/${wabaId}/message_templates?fields=name,status,category,language,components&limit=100`;

  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok || data.error) {
      console.error('[WhatsApp] Error al listar plantillas:', JSON.stringify(data.error || data));
      throw new Error(data.error?.message || `WhatsApp API respondió ${res.status}`);
    }
    templates.push(...(data.data || []));
    url = data.paging?.next || '';
  }

  return templates;
}

export interface CreateTemplateInput {
  name: string;
  language: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  body: string;
  bodyExamples?: string[];
  header?: string;
  footer?: string;
}

// Crea la plantilla en la WABA y la deja en revisión de Meta.
// Devuelve el id y estado que asigna Meta (normalmente PENDING).
export async function createMetaTemplate(
  input: CreateTemplateInput,
): Promise<{ id: string; status: string; category: string }> {
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!wabaId || !token) throw new Error('WhatsApp no está configurado');

  const components: Record<string, unknown>[] = [];

  if (input.header?.trim()) {
    components.push({ type: 'HEADER', format: 'TEXT', text: input.header.trim() });
  }

  const bodyComponent: Record<string, unknown> = { type: 'BODY', text: input.body };
  if (input.bodyExamples && input.bodyExamples.length) {
    bodyComponent.example = { body_text: [input.bodyExamples] };
  }
  components.push(bodyComponent);

  if (input.footer?.trim()) {
    components.push({ type: 'FOOTER', text: input.footer.trim() });
  }

  const res = await fetch(`${BASE_URL}/${wabaId}/message_templates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      language: input.language,
      category: input.category,
      components,
    }),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    const e = data.error || {};
    console.error('[WhatsApp] Error al crear plantilla:', JSON.stringify(e));
    // Meta suele traer un título legible en error_user_title/error_user_msg
    const friendly = e.error_user_title || e.error_user_msg;
    throw new Error(friendly ? `${friendly}${e.error_user_msg && e.error_user_title ? ': ' + e.error_user_msg : ''}` : (e.message || `WhatsApp API respondió ${res.status}`));
  }

  return { id: data.id, status: data.status, category: data.category };
}

export async function markMessageRead(messageId: string) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !token) return;

  await fetch(`${BASE_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId }),
  });
}
