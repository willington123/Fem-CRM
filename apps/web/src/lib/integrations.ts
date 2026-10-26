/**
 * Catálogo único de las credenciales que necesita el CRM.
 *
 * Este archivo es la fuente de verdad para tres cosas a la vez: la página de
 * Ajustes, el endpoint de estado y el `.env.example`. Si mañana aparece otra
 * integración, se añade aquí y las tres se enteran solas.
 *
 * Regla dura: aquí NUNCA se exporta el valor de una variable, solo si existe.
 * Los secretos no salen del servidor.
 */

export type PlatformKey = 'DATABASE' | 'APP' | 'META';

export interface EnvVarSpec {
  name: string;
  /** Sin esta variable la integración no funciona en absoluto. */
  required: boolean;
  /** Para qué sirve, en una línea, en la página de Ajustes. */
  help: string;
}

export interface PlatformSpec {
  key: PlatformKey;
  label: string;
  /** Qué deja de funcionar si esta integración está caída. */
  purpose: string;
  /** Dónde se sacan las credenciales. */
  where: string;
  vars: EnvVarSpec[];
  /** Rutas que hay que registrar en el panel del proveedor. */
  webhooks: { path: string; note: string }[];
}

export const PLATFORMS: PlatformSpec[] = [
  {
    key: 'DATABASE',
    label: 'Base de datos (Supabase)',
    purpose: 'Guarda clientas, pedidos, conversaciones y flujos. Sin ella no arranca nada.',
    where: 'Supabase → Project Settings → Database / API',
    vars: [
      { name: 'DATABASE_URL',              required: true,  help: 'Transaction pooler (puerto 6543). Es la que usa la app en Vercel.' },
      { name: 'DIRECT_URL',                required: true,  help: 'Conexión directa (puerto 5432). Solo para migraciones de Prisma.' },
      { name: 'SUPABASE_URL',              required: true,  help: 'URL del proyecto Supabase.' },
      { name: 'SUPABASE_SERVICE_ROLE_KEY', required: true,  help: 'Clave de servicio. Autentica el login. Solo servidor, nunca en el navegador.' },
    ],
    webhooks: [],
  },
  {
    key: 'APP',
    label: 'La propia app',
    purpose: 'Firma la sesión, protege los crons y arma las URLs de webhook.',
    where: 'Las generas tú: openssl rand -base64 48',
    vars: [
      { name: 'JWT_SECRET',          required: true,  help: 'Cadena aleatoria larga: firma la sesión y los enlaces temporales de adjuntos.' },
      { name: 'CRON_SECRET',         required: true,  help: 'Protege /api/cron/*. Sin ella los crons se rechazan y no corren.' },
      { name: 'NEXT_PUBLIC_APP_URL', required: false, help: 'Dominio público del CRM. Si falta, se deduce del de Vercel.' },
    ],
    webhooks: [],
  },
  {
    key: 'META',
    label: 'Meta · WhatsApp, Instagram y Facebook',
    purpose: 'Manda y recibe los mensajes de la bandeja y las plantillas de los flujos.',
    where: 'developers.facebook.com → tu app → WhatsApp / Messenger',
    vars: [
      { name: 'WHATSAPP_ACCESS_TOKEN',        required: true,  help: 'Token permanente de un usuario de sistema. Los de 24 h no sirven.' },
      { name: 'WHATSAPP_PHONE_NUMBER_ID',     required: true,  help: 'ID del número desde el que se escribe.' },
      { name: 'WHATSAPP_BUSINESS_ACCOUNT_ID', required: true,  help: 'WABA ID: hace falta para listar y crear plantillas.' },
      { name: 'META_APP_SECRET',              required: true,  help: 'Verifica la firma de cada webhook entrante.' },
      { name: 'META_WEBHOOK_VERIFY_TOKEN',    required: true,  help: 'Cadena que tú inventas y repites en el panel de Meta.' },
      { name: 'META_INSTAGRAM_ACCOUNT_ID',    required: false, help: 'Solo si se atiende Instagram Direct: separa lo de IG de lo de Messenger.' },
    ],
    webhooks: [
      { path: '/api/webhooks/meta', note: 'Suscribir a messages y message_status. Usa el mismo verify token.' },
    ],
  },
];

/** Solo booleanos: qué variables están puestas y cuáles faltan. */
export function inspectPlatform(spec: PlatformSpec) {
  const vars = spec.vars.map(v => ({
    ...v,
    present: Boolean(process.env[v.name]?.trim()),
  }));
  const missingRequired = vars.filter(v => v.required && !v.present).map(v => v.name);

  return {
    key: spec.key,
    label: spec.label,
    purpose: spec.purpose,
    where: spec.where,
    webhooks: spec.webhooks,
    vars,
    ready: missingRequired.length === 0,
    missingRequired,
  };
}
