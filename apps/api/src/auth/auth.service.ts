import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import {
  ALL_FEATURES,
  FeatureOverrides,
  LoginDto,
  resolveFeatures,
} from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/configuration';

export interface JwtPayload {
  sub: string;
  hotelId: string;
  role: string;
  /** 'platform' for master-controller admin tokens; absent for hotel users. */
  typ?: 'platform';
  /** platform-admin role (only on platform tokens). */
  prole?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Resolve a login to a single user. With multiple hotels a phone is only unique
   * *within* a hotel, so `hotelSlug` scopes the lookup (per-hotel login link). When
   * no slug is given we allow the login only if the phone is globally unambiguous.
   */
  async validateUser(phone: string, password: string, hotelSlug?: string) {
    let hotelId: string | undefined;
    if (hotelSlug) {
      const hotel = await this.prisma.hotel.findUnique({
        where: { slug: hotelSlug },
        select: { id: true },
      });
      if (!hotel) throw new UnauthorizedException('Unknown hotel');
      hotelId = hotel.id;
    }

    const matches = await this.prisma.user.findMany({
      where: { phone, active: true, deletedAt: null, ...(hotelId ? { hotelId } : {}) },
      take: 2,
    });
    if (matches.length === 0) throw new UnauthorizedException('Invalid credentials');
    if (matches.length > 1) {
      // Same phone at more than one hotel — caller must use their hotel login link.
      throw new UnauthorizedException('Multiple hotels use this phone — please use your hotel login link');
    }
    const user = matches[0];
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return user;
  }

  async login(dto: LoginDto): Promise<TokenPair & { user: PublicUser }> {
    const user = await this.validateUser(dto.phone, dto.password, dto.hotelSlug);
    const tokens = await this.issueTokens({
      sub: user.id,
      hotelId: user.hotelId,
      role: user.role,
    });
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date() },
    });
    return { ...tokens, user: toPublicUser(user) };
  }

  async issueTokens(payload: JwtPayload): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }),
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      expiresIn: this.config.get('JWT_REFRESH_TTL', { infer: true }),
    });

    const refreshTokenHash = await argon2.hash(refreshToken);
    await this.prisma.session.create({
      data: {
        userId: payload.sub,
        refreshTokenHash,
        expiresAt: this.refreshExpiry(),
      },
    });
    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Find a live, matching session and rotate it.
    const sessions = await this.prisma.session.findMany({
      where: {
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    let matched = null as (typeof sessions)[number] | null;
    for (const s of sessions) {
      if (await argon2.verify(s.refreshTokenHash, refreshToken)) {
        matched = s;
        break;
      }
    }
    if (!matched) throw new UnauthorizedException('Session not found or revoked');

    await this.prisma.session.update({
      where: { id: matched.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens({
      sub: payload.sub,
      hotelId: payload.hotelId,
      role: payload.role,
    });
  }

  /** Tenant context for /auth/me: subscription status + effective features, so
   *  the web can gate navigation and show trial/suspended banners. */
  async hotelContext(hotelId: string) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id: hotelId },
      select: {
        name: true,
        slug: true,
        currency: true,
        status: true,
        approved: true,
        approvalRequested: true,
        trialEndsAt: true,
        featureOverrides: true,
        plan: { select: { code: true, name: true, features: true } },
      },
    });
    if (!hotel) return null;
    return {
      name: hotel.name,
      slug: hotel.slug,
      currency: hotel.currency,
      status: hotel.status,
      approved: hotel.approved,
      approvalRequested: hotel.approvalRequested,
      trialEndsAt: hotel.trialEndsAt,
      plan: hotel.plan,
      features: hotel.plan
        ? resolveFeatures(
            hotel.plan.features,
            (hotel.featureOverrides as FeatureOverrides) ?? {},
          )
        : ALL_FEATURES,
    };
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private refreshExpiry(): Date {
    // best-effort parse of "30d"/"15m"/"900s" into a Date
    const ttl = this.config.get('JWT_REFRESH_TTL', { infer: true });
    const m = /^(\d+)([smhd])$/.exec(ttl);
    const now = Date.now();
    if (!m) return new Date(now + 30 * 24 * 3600 * 1000);
    const n = Number(m[1]);
    const unit = { s: 1, m: 60, h: 3600, d: 86400 }[m[2]] ?? 86400;
    return new Date(now + n * unit * 1000);
  }
}

export interface PublicUser {
  id: string;
  hotelId: string;
  name: string;
  role: string;
  phone: string;
  extraPermissions: string[];
}

function toPublicUser(u: {
  id: string;
  hotelId: string;
  name: string;
  role: string;
  phone: string;
  extraPermissions: string[];
}): PublicUser {
  return {
    id: u.id,
    hotelId: u.hotelId,
    name: u.name,
    role: u.role,
    phone: u.phone,
    extraPermissions: u.extraPermissions,
  };
}
