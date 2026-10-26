/**
 * Vista previa local sin Supabase.
 *
 * Existe solo para abrir el CRM con datos de demostración antes de tener el
 * proyecto de Supabase. Exige DOS condiciones, y la segunda es la que lo vuelve
 * inofensivo: la base de datos tiene que estar en la máquina. En Vercel, con
 * Supabase en un host remoto, nunca se activa aunque alguien ponga la variable.
 */
export function devLoginAllowed(): boolean {
  if (process.env.ALLOW_DEV_LOGIN !== 'true') return false;
  return /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? '');
}
