import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '../common/decorators';
import { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './auth.service';

/** Global guard: validates the access token and attaches request.user. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = header.slice(7);
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Master-controller (platform admin) token: not tied to a hotel.
    if (payload.typ === 'platform') {
      const admin = await this.prisma.platformAdmin.findFirst({
        where: { id: payload.sub, active: true },
        select: { id: true, name: true, email: true, role: true },
      });
      if (!admin) throw new UnauthorizedException('Platform admin not found');
      req.platformAdmin = admin;
      return true;
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, active: true, deletedAt: null },
      select: {
        id: true,
        hotelId: true,
        name: true,
        role: true,
        extraPermissions: true,
      },
    });
    if (!user) throw new UnauthorizedException('User not found');

    req.user = user;
    return true;
  }
}
