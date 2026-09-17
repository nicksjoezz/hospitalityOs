import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import {
  CreatePlatformAdminDto,
  PlatformLoginDto,
  PlatformRole,
} from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/configuration';
import { TokenPair } from '../auth/auth.service';

export interface PublicAdmin {
  id: string;
  name: string;
  email: string;
  role: PlatformRole;
}

/**
 * Master-controller authentication. Platform admins are global accounts (not
 * tied to any hotel) and authenticate by email. Access tokens carry
 * `typ: 'platform'` and are verified by the shared JwtAuthGuard; refresh is
 * stateless (the `active` flag, checked on every request, is the kill switch).
 */
@Injectable()
export class PlatformAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async login(dto: PlatformLoginDto): Promise<TokenPair & { admin: PublicAdmin }> {
    const admin = await this.prisma.platformAdmin.findFirst({
      where: { email: dto.email.toLowerCase(), active: true },
    });
    if (!admin) throw new UnauthorizedException('Invalid credentials');
    const ok = await argon2.verify(admin.passwordHash, dto.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    await this.prisma.platformAdmin.update({
      where: { id: admin.id },
      data: { lastSeenAt: new Date() },
    });
    const tokens = await this.issueTokens(admin.id, admin.role as PlatformRole);
    return { ...tokens, admin: toPublicAdmin(admin) };
  }

  async issueTokens(adminId: string, role: PlatformRole): Promise<TokenPair> {
    const payload = { sub: adminId, typ: 'platform' as const, prole: role };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }),
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      expiresIn: this.config.get('JWT_REFRESH_TTL', { infer: true }),
    });
    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: { sub: string; typ?: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.typ !== 'platform') {
      throw new UnauthorizedException('Not a platform token');
    }
    const admin = await this.prisma.platformAdmin.findFirst({
      where: { id: payload.sub, active: true },
    });
    if (!admin) throw new UnauthorizedException('Platform admin not found');
    return this.issueTokens(admin.id, admin.role as PlatformRole);
  }

  async createAdmin(
    creator: PlatformRole,
    dto: CreatePlatformAdminDto,
  ): Promise<PublicAdmin> {
    if (creator !== PlatformRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only a super admin can create platform admins');
    }
    const admin = await this.prisma.platformAdmin.create({
      data: {
        email: dto.email.toLowerCase(),
        name: dto.name,
        passwordHash: await argon2.hash(dto.password),
        role: dto.superAdmin ? PlatformRole.SUPER_ADMIN : PlatformRole.STAFF,
      },
    });
    return toPublicAdmin(admin);
  }

  async listAdmins(): Promise<(PublicAdmin & { active: boolean })[]> {
    const admins = await this.prisma.platformAdmin.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return admins.map((a) => ({ ...toPublicAdmin(a), active: a.active }));
  }

  /** Activate/deactivate a platform admin (super-admin only; can't lock yourself
   *  out or disable the last active super-admin). */
  async setActive(
    actor: { id: string; role: PlatformRole },
    id: string,
    active: boolean,
  ) {
    if (actor.role !== PlatformRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only a super admin can manage platform admins');
    }
    if (id === actor.id && !active) {
      throw new ForbiddenException('You cannot deactivate your own account');
    }
    const target = await this.prisma.platformAdmin.findUnique({ where: { id } });
    if (!target) throw new ForbiddenException('Admin not found');
    if (!active && target.role === PlatformRole.SUPER_ADMIN) {
      const supers = await this.prisma.platformAdmin.count({
        where: { role: PlatformRole.SUPER_ADMIN, active: true },
      });
      if (supers <= 1) throw new ForbiddenException('Cannot disable the last super admin');
    }
    await this.prisma.platformAdmin.update({ where: { id }, data: { active } });
    return { ...toPublicAdmin(target), active };
  }
}

function toPublicAdmin(a: {
  id: string;
  name: string;
  email: string;
  role: string;
}): PublicAdmin {
  return { id: a.id, name: a.name, email: a.email, role: a.role as PlatformRole };
}
