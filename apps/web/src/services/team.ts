import { prisma } from '@/lib/prisma';
import { createServerSupabase } from '@/lib/supabase-server';
import { devLoginAllowed } from '@/lib/dev-login';

/**
 * Cuentas del equipo. La contraseña vive en Supabase Auth; el nombre, el rol y
 * si está activa viven en `crm_users`. El login necesita las dos.
 *
 * En la vista previa local (sin Supabase) solo existe la fila del CRM y se
 * entra con cualquier contraseña, así que aquí no se toca Supabase.
 */

export const MIN_PASSWORD = 8;

export class TeamError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function supabaseReady() {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function requireSupabase() {
  if (devLoginAllowed()) return null;
  if (!supabaseReady()) throw new TeamError('Supabase no está configurado: no se pueden gestionar contraseñas.', 503);
  return createServerSupabase();
}

export function checkPassword(password: unknown): string {
  const p = String(password ?? '');
  if (p.length < MIN_PASSWORD) throw new TeamError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
  return p;
}

/** Busca una cuenta de Supabase por correo (la API no tiene búsqueda directa). */
async function findAuthUserId(email: string): Promise<string | null> {
  const supabase = createServerSupabase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new TeamError(`Supabase: ${error.message}`, 502);
    const found = data.users.find(u => u.email?.toLowerCase() === email);
    if (found) return found.id;
    if (data.users.length < 1000) return null;
  }
  return null;
}

/**
 * Crea la cuenta de acceso. Si el correo ya tenía cuenta en Supabase (por
 * ejemplo, alguien que estuvo antes), se enlaza sin cambiarle la contraseña:
 * `existing` avisa de que debe entrar con la que ya tenía.
 */
export async function createLogin(email: string, password: string): Promise<{ authUserId: string | null; existing: boolean }> {
  const supabase = requireSupabase();
  if (!supabase) return { authUserId: null, existing: false };

  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (!error && data.user) return { authUserId: data.user.id, existing: false };

  const authUserId = await findAuthUserId(email);
  if (!authUserId) throw new TeamError(`No se pudo crear la cuenta: ${error?.message ?? 'error desconocido'}`, 502);
  return { authUserId, existing: true };
}

/** Pone una contraseña nueva (restablecer desde Equipo o cambiar la propia). */
export async function setPassword(user: { email: string; authUserId: string | null }, password: string) {
  const supabase = requireSupabase();
  if (!supabase) return;

  const authUserId = user.authUserId ?? (await findAuthUserId(user.email.toLowerCase()));
  if (!authUserId) throw new TeamError('Esta persona no tiene cuenta de acceso en Supabase.', 404);

  const { error } = await supabase.auth.admin.updateUserById(authUserId, { password });
  if (error) throw new TeamError(`Supabase: ${error.message}`, 502);

  if (!user.authUserId) {
    await prisma.crmUser.update({ where: { email: user.email }, data: { authUserId } });
  }
}

/** Comprueba la contraseña actual antes de dejar cambiarla. */
export async function verifyPassword(email: string, password: string): Promise<boolean> {
  const supabase = requireSupabase();
  if (!supabase) return true;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return !error && !!data.user;
}

/** Nunca puede quedar el CRM sin nadie que lo administre. */
export async function assertKeepsAnAdmin(userId: string, next: { role?: string; isActive?: boolean }) {
  const current = await prisma.crmUser.findUnique({ where: { id: userId } });
  if (!current || current.role !== 'ADMIN' || !current.isActive) return;

  const losesAdmin = (next.role && next.role !== 'ADMIN') || next.isActive === false;
  if (!losesAdmin) return;

  const others = await prisma.crmUser.count({
    where: { role: 'ADMIN', isActive: true, id: { not: userId } },
  });
  if (others === 0) throw new TeamError('Debe quedar al menos una persona activa con rol de Administración.');
}
