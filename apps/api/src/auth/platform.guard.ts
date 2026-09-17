import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PLATFORM_KEY, IS_PUBLIC_KEY } from '../common/decorators';

/**
 * Separates the two token audiences:
 *  - `@Platform()` routes require a master-controller (platform admin) token.
 *  - hotel routes reject platform tokens (a platform admin must impersonate to
 *    act inside a hotel), so a platform token can never accidentally read/write
 *    a tenant's data.
 */
@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const isPlatformRoute = this.reflector.getAllAndOverride<boolean>(
      IS_PLATFORM_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPlatformRoute) {
      if (!req.platformAdmin) {
        throw new ForbiddenException('Platform admin token required');
      }
      return true;
    }

    if (req.platformAdmin && !isPublic) {
      throw new ForbiddenException('Platform token cannot access hotel routes');
    }
    return true;
  }
}
