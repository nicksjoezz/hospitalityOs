import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@hospitalityos/shared';
import { ROLES_KEY } from '../common/decorators';

/**
 * Enforces `@Roles(...)` route metadata. OWNER passes everything. Runs after
 * JwtAuthGuard, so request.user is present.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const role: Role | undefined = req.user?.role;
    if (!role) throw new ForbiddenException('No role on principal');
    if (role === Role.OWNER) return true;
    if (!required.includes(role)) {
      throw new ForbiddenException(
        `Role ${role} not permitted for this action`,
      );
    }
    return true;
  }
}
