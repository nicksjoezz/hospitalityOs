import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { ActorType, Feature, PlatformRole, Role } from '@hospitalityos/shared';
import { Actor } from './actor';

/** Marks a route as not requiring authentication (e.g. login, webhooks). */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Roles allowed to call a route. Empty/absent => any authenticated user. */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Marks a route as requiring a platform-admin (master controller) token. */
export const IS_PLATFORM_KEY = 'isPlatform';
export const Platform = () => SetMetadata(IS_PLATFORM_KEY, true);

/** Requires the calling hotel's plan/overrides to include this feature. */
export const FEATURE_KEY = 'requiredFeature';
export const RequireFeature = (feature: Feature) =>
  SetMetadata(FEATURE_KEY, feature);

/** Allows a suspended/cancelled hotel to still reach this route (e.g. /auth/me). */
export const ALLOW_SUSPENDED_KEY = 'allowSuspended';
export const AllowSuspended = () => SetMetadata(ALLOW_SUSPENDED_KEY, true);

/** The authenticated platform admin, attached by JwtAuthGuard as request.platformAdmin. */
export interface PlatformPrincipal {
  id: string;
  name: string;
  email: string;
  role: PlatformRole;
}

export const CurrentPlatformAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PlatformPrincipal => {
    const req = ctx.switchToHttp().getRequest();
    return req.platformAdmin;
  },
);

/** The authenticated principal, attached by JwtAuthGuard as request.user. */
export interface AuthUser {
  id: string;
  hotelId: string;
  role: Role;
  extraPermissions: string[];
  name: string;
}

/** Inject the authenticated AuthUser into a controller handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);

/**
 * Inject an Actor (for passing to services) built from the request user.
 * Only used on authenticated routes, so request.user is always present.
 */
export const CurrentActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Actor => {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as AuthUser;
    return {
      id: user.id,
      type: ActorType.USER,
      role: user.role,
      hotelId: user.hotelId,
      ip: req.ip,
    };
  },
);
