/**
 * Qué puede hacer cada rol. Es la única fuente de verdad: la usan las rutas de
 * la API (que son las que de verdad protegen) y las pantallas (que solo
 * esconden lo que el rol no puede usar).
 *
 * Ver datos (bandeja, clientas, pedidos, dashboard, flujos, plantillas) lo
 * pueden hacer todos los roles con sesión. Aquí solo se listan las acciones.
 */

export type Role = 'ADMIN' | 'AGENT' | 'ANALYST';

export type Permission =
  | 'inbox.reply'        // responder, notas internas, resolver, etiquetar y asignar conversaciones
  | 'customers.edit'     // editar notas, etiquetas y estado de una clienta
  | 'orders.edit'        // crear pedidos y cambiarles estado, guía y transportadora
  | 'templates.manage'   // crear, editar, borrar y sincronizar plantillas con Meta
  | 'flows.manage'       // encender, apagar y editar flujos (mandan WhatsApps reales)
  | 'settings.view'      // ver y probar integraciones
  | 'team.manage';       // crear usuarias, cambiar roles, desactivar, restablecer contraseñas

const MATRIX: Record<Role, readonly Permission[]> = {
  ADMIN:   ['inbox.reply', 'customers.edit', 'orders.edit', 'templates.manage', 'flows.manage', 'settings.view', 'team.manage'],
  AGENT:   ['inbox.reply', 'customers.edit', 'orders.edit'],
  ANALYST: [],
};

export function can(role: string | null | undefined, permission: Permission): boolean {
  return !!role && (MATRIX[role as Role]?.includes(permission) ?? false);
}

export const ROLES: Role[] = ['ADMIN', 'AGENT', 'ANALYST'];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN:   'Administración',
  AGENT:   'Agente',
  ANALYST: 'Analista',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN:   'Todo: además de atender, maneja el equipo, los flujos, las plantillas y los ajustes.',
  AGENT:   'Atiende la bandeja, crea y actualiza pedidos y edita clientas.',
  ANALYST: 'Solo mira: ve todo, pero no responde ni cambia nada.',
};
