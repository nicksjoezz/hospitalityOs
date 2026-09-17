import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  Feature,
  FeatureOverrides,
  hasFeature,
  HotelStatus,
  isOperational,
  resolveFeatures,
} from '@hospitalityos/shared';
import {
  ALLOW_SUSPENDED_KEY,
  FEATURE_KEY,
} from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

interface CachedHotel {
  status: HotelStatus;
  suspendReason: string | null;
  hasPlan: boolean;
  planFeatures: string[];
  featureOverrides: FeatureOverrides;
}

/**
 * Tenant gate (runs after auth + RBAC, only for hotel-user requests):
 *  1. Blocks SUSPENDED/CANCELLED hotels (unless the route is @AllowSuspended()).
 *  2. Enforces @RequireFeature(): the hotel's plan + overrides must include it.
 * Platform/public routes have no req.user and are skipped. The hotel record is
 * cached briefly to avoid a DB hit on every request.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  private readonly cache = new Map<string, { exp: number; hotel: CachedHotel }>();
  private static readonly TTL_MS = 15_000;

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user?.hotelId) return true; // public or platform-admin routes

    const allowSuspended = this.reflector.getAllAndOverride<boolean>(
      ALLOW_SUSPENDED_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredFeature = this.reflector.getAllAndOverride<Feature>(
      FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    const hotel = await this.loadHotel(user.hotelId);
    if (!hotel) throw new ForbiddenException('Hotel not found');

    if (!allowSuspended && !isOperational(hotel.status)) {
      throw new ForbiddenException({
        error: {
          code: 'HOTEL_SUSPENDED',
          message:
            hotel.status === 'CANCELLED'
              ? 'This hotel account has been closed.'
              : `This hotel account is suspended${
                  hotel.suspendReason ? `: ${hotel.suspendReason}` : ''
                }. Contact the platform operator.`,
        },
      });
    }

    // A hotel with no plan assigned is an unmanaged / self-hosted install and is
    // unrestricted; feature gating only applies once the platform puts it on a plan.
    if (requiredFeature && hotel.hasPlan) {
      const features = resolveFeatures(hotel.planFeatures, hotel.featureOverrides);
      if (!hasFeature(features, requiredFeature)) {
        throw new ForbiddenException({
          error: {
            code: 'FEATURE_NOT_ENABLED',
            message: `The "${requiredFeature}" feature is not included in this hotel's plan.`,
          },
        });
      }
    }

    req.hotel = hotel;
    return true;
  }

  /** Invalidate a hotel's cached entitlements (called after plan/status edits). */
  invalidate(hotelId: string): void {
    this.cache.delete(hotelId);
  }

  private async loadHotel(hotelId: string): Promise<CachedHotel | null> {
    const now = Date.now();
    const hit = this.cache.get(hotelId);
    if (hit && hit.exp > now) return hit.hotel;

    const row = await this.prisma.hotel.findUnique({
      where: { id: hotelId },
      select: {
        status: true,
        suspendReason: true,
        planId: true,
        featureOverrides: true,
        plan: { select: { features: true } },
      },
    });
    if (!row) return null;

    const hotel: CachedHotel = {
      status: row.status as HotelStatus,
      suspendReason: row.suspendReason,
      hasPlan: row.planId != null,
      planFeatures: row.plan?.features ?? [],
      featureOverrides: (row.featureOverrides as FeatureOverrides) ?? {},
    };
    this.cache.set(hotelId, { exp: now + TenantGuard.TTL_MS, hotel });
    return hotel;
  }
}
