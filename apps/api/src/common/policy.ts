import { Role } from '@hospitalityos/shared';
import { AuthUser } from './decorators';

/**
 * RBAC policy layer (plan.md §9). Deny by default. A user has one primary role
 * plus optional `extraPermissions`. OWNER is all-powerful. Beyond route-level
 * role gating (RolesGuard), services use `can()` for finer decisions — e.g.
 * only OWNER/MANAGER may read confidential staff reports (§11.9).
 */

export type Action =
  | 'reservation:create'
  | 'reservation:modify'
  | 'reservation:cancel'
  | 'reservation:checkin'
  | 'reservation:checkout'
  | 'payment:record'
  | 'payment:refund'
  | 'housekeeping:assign'
  | 'maintenance:register'
  | 'maintenance:update'
  | 'staffReport:read'
  | 'staffReport:submit'
  | 'po:approve'
  | 'price:approve'
  | 'audit:read';

/** Roles that can perform each action. OWNER is implicitly allowed everything. */
const ACTION_ROLES: Record<Action, Role[]> = {
  'reservation:create': [Role.MANAGER, Role.FRONT_DESK],
  'reservation:modify': [Role.MANAGER, Role.FRONT_DESK],
  'reservation:cancel': [Role.MANAGER, Role.FRONT_DESK],
  'reservation:checkin': [Role.MANAGER, Role.FRONT_DESK],
  'reservation:checkout': [Role.MANAGER, Role.FRONT_DESK],
  'payment:record': [Role.MANAGER, Role.FRONT_DESK, Role.ACCOUNTANT],
  'payment:refund': [Role.MANAGER, Role.ACCOUNTANT],
  'housekeeping:assign': [Role.MANAGER, Role.HOUSEKEEPING, Role.FRONT_DESK],
  'maintenance:register': [
    Role.MANAGER,
    Role.HOUSEKEEPING,
    Role.MAINTENANCE,
    Role.FRONT_DESK,
    Role.SECURITY,
  ],
  'maintenance:update': [Role.MANAGER, Role.MAINTENANCE],
  'staffReport:read': [Role.MANAGER], // OWNER implicit
  'staffReport:submit': [
    Role.MANAGER,
    Role.FRONT_DESK,
    Role.HOUSEKEEPING,
    Role.MAINTENANCE,
    Role.KITCHEN,
    Role.BAR,
    Role.PROCUREMENT,
    Role.SECURITY,
    Role.ACCOUNTANT,
  ],
  'po:approve': [Role.MANAGER],
  'price:approve': [Role.MANAGER],
  'audit:read': [Role.MANAGER],
};

export function can(
  user: Pick<AuthUser, 'role' | 'extraPermissions'>,
  action: Action,
): boolean {
  if (user.role === Role.OWNER) return true;
  if (user.extraPermissions?.includes(action)) return true;
  return ACTION_ROLES[action]?.includes(user.role) ?? false;
}
