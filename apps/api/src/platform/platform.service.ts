import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlanInterval, Prisma, Role } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import {
  ActorType,
  ALL_FEATURES,
  CORE_FEATURES,
  ApproveHotelDto,
  ExtendTrialDto,
  Feature,
  FeatureOverrides,
  HotelStatus,
  PlanDto,
  PlatformRole,
  RegisterHotelDto,
  resolveFeatures,
  SetFeatureOverridesDto,
  SetHotelPlanDto,
  SuspendHotelDto,
  UpdatePlanDto,
} from '@hospitalityos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/configuration';
import { AuditService } from '../common/audit.service';
import { AuthService, TokenPair } from '../auth/auth.service';
import { PublicUser } from '../auth/auth.service';
import { PlatformSettingsService } from './platform-settings.service';
import { PlatformBillingService } from './platform-billing.service';

const HOTEL_SELECT = {
  id: true,
  name: true,
  slug: true,
  currency: true,
  timezone: true,
  status: true,
  approved: true,
  approvalRequested: true,
  planId: true,
  featureOverrides: true,
  trialEndsAt: true,
  approvedAt: true,
  suspendedAt: true,
  suspendReason: true,
  contactName: true,
  contactEmail: true,
  createdAt: true,
  plan: true,
} satisfies Prisma.HotelSelect;

@Injectable()
export class PlatformService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly settings: PlatformSettingsService,
    private readonly billing: PlatformBillingService,
  ) {}

  async onModuleInit(): Promise<void> {
    const logger = new Logger('PlatformBootstrap');
    try {
      await this.settings.get();

      const planCount = await this.prisma.plan.count();
      if (planCount === 0) {
        logger.log('Seeding default subscription plans (trial, starter, pro, enterprise)...');
        const defaultPlans = [
          {
            code: 'trial',
            name: 'Free Trial',
            description: 'Explore the platform free. Go-live features unlock on approval.',
            priceMinor: 0,
            interval: PlanInterval.MONTHLY,
            sortOrder: 0,
            features: [
              ...CORE_FEATURES,
              Feature.RESTAURANT_POS,
              Feature.BAR_POS,
              Feature.INVENTORY,
              Feature.RATE_MANAGEMENT,
              Feature.ANALYTICS,
              Feature.AI_ASSISTANT,
            ],
          },
          {
            code: 'starter',
            name: 'Starter',
            description: 'Independent properties: front desk, F&B, stock and invoicing.',
            priceMinor: 4900,
            interval: PlanInterval.MONTHLY,
            sortOrder: 1,
            maxRooms: 20,
            maxUsers: 15,
            features: [
              ...CORE_FEATURES,
              Feature.RESTAURANT_POS,
              Feature.BAR_POS,
              Feature.INVENTORY,
              Feature.BILLING_INVOICES,
              Feature.ANALYTICS,
            ],
          },
          {
            code: 'pro',
            name: 'Professional',
            description: 'Growing hotels: distribution, online payments, AI and loyalty.',
            priceMinor: 14900,
            interval: PlanInterval.MONTHLY,
            sortOrder: 2,
            maxRooms: 100,
            maxUsers: 60,
            features: [
              ...CORE_FEATURES,
              Feature.RESTAURANT_POS,
              Feature.BAR_POS,
              Feature.INVENTORY,
              Feature.PROCUREMENT,
              Feature.BILLING_INVOICES,
              Feature.RATE_MANAGEMENT,
              Feature.CHANNEL_MANAGER,
              Feature.ONLINE_PAYMENTS,
              Feature.AI_ASSISTANT,
              Feature.ANALYTICS,
              Feature.MARKETING,
              Feature.LOYALTY,
              Feature.GUEST_PORTAL,
              Feature.REVIEWS,
            ],
          },
          {
            code: 'enterprise',
            name: 'Enterprise',
            description: 'Everything, unlimited — full AI revenue management and reporting.',
            priceMinor: 39900,
            interval: PlanInterval.MONTHLY,
            sortOrder: 3,
            maxRooms: null as number | null,
            maxUsers: null as number | null,
            features: ALL_FEATURES,
          },
        ];

        for (const p of defaultPlans) {
          await this.prisma.plan.create({
            data: {
              code: p.code,
              name: p.name,
              description: p.description,
              priceMinor: p.priceMinor,
              currency: 'USD',
              interval: p.interval,
              features: p.features,
              maxRooms: p.maxRooms ?? null,
              maxUsers: p.maxUsers ?? null,
              isPublic: true,
              active: true,
              sortOrder: p.sortOrder,
            },
          });
        }
        logger.log('Default subscription plans seeded.');
      }

      const adminCount = await this.prisma.platformAdmin.count();
      if (adminCount === 0) {
        const email = (this.config.get('PLATFORM_ADMIN_EMAIL', { infer: true }) || 'admin@hospitalityos.local').toLowerCase();
        const password = this.config.get('PLATFORM_ADMIN_PASSWORD', { infer: true }) || 'ChangeMe_Master_2026!';
        const name = this.config.get('PLATFORM_ADMIN_NAME', { infer: true }) || 'Master Administrator';
        const passwordHash = await argon2.hash(password);
        await this.prisma.platformAdmin.create({
          data: {
            email,
            passwordHash,
            name,
            role: PlatformRole.SUPER_ADMIN,
          },
        });
        logger.log(`Master administrator seeded: ${email}`);
      }
    } catch (err) {
      logger.warn(`Platform seed check note: ${err}`);
    }
  }

  // ---------------------------------------------------------------- Registration
  /** Public self-registration → TRIAL hotel + OWNER login, auto-signed-in. */
  async register(
    dto: RegisterHotelDto,
    ip?: string,
  ): Promise<TokenPair & { user: PublicUser; hotel: { id: string; name: string; slug: string | null; status: HotelStatus } }> {
    const settings = await this.settings.get();
    if (!settings.signupEnabled) {
      throw new ForbiddenException('Self-registration is disabled');
    }
    // Trial plan defines the explore feature set; fall back gracefully if unseeded.
    const wantCode = dto.planCode ?? settings.defaultPlanCode ?? 'trial';
    const trialPlan =
      (await this.prisma.plan.findFirst({ where: { code: wantCode, active: true } })) ||
      (await this.prisma.plan.findFirst({ where: { code: 'trial', active: true } })) ||
      (await this.prisma.plan.findFirst({ where: { active: true }, orderBy: { sortOrder: 'asc' } }));

    const trialDays = settings.trialDays;
    const trialEndsAt = new Date(Date.now() + trialDays * 86400_000);
    const slug = await this.uniqueSlug(dto.hotelName);

    const { hotel, owner } = await this.prisma.$transaction(async (tx) => {
      const hotel = await tx.hotel.create({
        data: {
          name: dto.hotelName,
          slug,
          currency: dto.currency,
          timezone: dto.timezone,
          status: HotelStatus.TRIAL,
          approved: false,
          planId: trialPlan?.id ?? null,
          trialEndsAt,
          contactName: dto.ownerName,
          contactEmail: dto.ownerEmail ?? null,
        },
      });
      const owner = await tx.user.create({
        data: {
          hotelId: hotel.id,
          name: dto.ownerName,
          phone: dto.ownerPhone,
          email: dto.ownerEmail ?? null,
          role: Role.OWNER,
          passwordHash: await argon2.hash(dto.ownerPassword),
        },
      });
      return { hotel, owner };
    });

    await this.audit.record({
      actor: { type: ActorType.GUEST, hotelId: hotel.id, ip },
      action: 'platform.hotel.register',
      entity: 'Hotel',
      entityId: hotel.id,
      after: { name: hotel.name, plan: trialPlan?.code ?? null },
    });

    const tokens = await this.auth.issueTokens({
      sub: owner.id,
      hotelId: hotel.id,
      role: owner.role,
    });
    return {
      ...tokens,
      user: {
        id: owner.id,
        hotelId: hotel.id,
        name: owner.name,
        role: owner.role,
        phone: owner.phone,
        extraPermissions: owner.extraPermissions,
      },
      hotel: {
        id: hotel.id,
        name: hotel.name,
        slug: hotel.slug,
        status: hotel.status as HotelStatus,
      },
    };
  }

  /** Public: find-your-hotel search by name (returns name + login slug). */
  async searchHotels(q: string) {
    const term = (q ?? '').trim();
    if (term.length < 2) return [];
    return this.prisma.hotel.findMany({
      where: {
        slug: { not: null },
        status: { in: [HotelStatus.TRIAL, HotelStatus.ACTIVE] },
        name: { contains: term, mode: 'insensitive' },
      },
      select: { name: true, slug: true },
      orderBy: { name: 'asc' },
      take: 8,
    });
  }

  /** Public: resolve a tenant login slug to its hotel (name) for the login page. */
  async hotelBySlug(slug: string) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true, status: true },
    });
    if (!hotel) throw new NotFoundException('Hotel not found');
    return hotel;
  }

  private slugify(name: string): string {
    return (
      name
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'hotel'
    );
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = this.slugify(name);
    for (let i = 0; i < 50; i++) {
      const candidate = i === 0 ? base : `${base}-${i + 1}`;
      const taken = await this.prisma.hotel.findUnique({ where: { slug: candidate } });
      if (!taken) return candidate;
    }
    return `${base}-${randomBytes(3).toString('hex')}`;
  }

  // ---------------------------------------------------------------- Hotels (admin)
  async listHotels(opts: { status?: HotelStatus; q?: string }) {
    const hotels = await this.prisma.hotel.findMany({
      where: {
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.q
          ? {
              OR: [
                { name: { contains: opts.q, mode: 'insensitive' } },
                { contactEmail: { contains: opts.q, mode: 'insensitive' } },
                { contactName: { contains: opts.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        ...HOTEL_SELECT,
        _count: { select: { rooms: true, users: true, reservations: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return hotels.map((h) => this.decorate(h));
  }

  async getHotel(id: string) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id },
      select: {
        ...HOTEL_SELECT,
        _count: { select: { rooms: true, users: true, reservations: true } },
      },
    });
    if (!hotel) throw new NotFoundException('Hotel not found');
    return this.decorate(hotel);
  }

  async approve(adminId: string, id: string, dto: ApproveHotelDto, ip?: string) {
    const hotel = await this.mustFind(id);
    const planId = dto.planId ?? hotel.planId;
    if (!planId) {
      throw new BadRequestException('A plan is required to approve a hotel');
    }
    await this.prisma.hotel.update({
      where: { id },
      data: {
        status: HotelStatus.ACTIVE,
        approved: true,
        approvalRequested: false,
        approvedAt: new Date(),
        suspendedAt: null,
        suspendReason: null,
        planId,
      },
    });
    await this.adminAudit(adminId, id, 'platform.hotel.approve', { planId });
    // Start subscription billing for paid plans (no-op for free/trial).
    await this.billing.issueInvoice(id);
    return this.getHotel(id);
  }

  async suspend(adminId: string, id: string, dto: SuspendHotelDto) {
    await this.mustFind(id);
    await this.prisma.hotel.update({
      where: { id },
      data: {
        status: HotelStatus.SUSPENDED,
        suspendedAt: new Date(),
        suspendReason: dto.reason,
      },
    });
    await this.adminAudit(adminId, id, 'platform.hotel.suspend', { reason: dto.reason });
    return this.getHotel(id);
  }

  async reactivate(adminId: string, id: string) {
    const hotel = await this.mustFind(id);
    await this.prisma.hotel.update({
      where: { id },
      data: {
        status: hotel.approved ? HotelStatus.ACTIVE : HotelStatus.TRIAL,
        suspendedAt: null,
        suspendReason: null,
      },
    });
    await this.adminAudit(adminId, id, 'platform.hotel.reactivate', {});
    return this.getHotel(id);
  }

  async cancel(adminId: string, id: string) {
    await this.mustFind(id);
    await this.prisma.hotel.update({
      where: { id },
      data: { status: HotelStatus.CANCELLED },
    });
    await this.adminAudit(adminId, id, 'platform.hotel.cancel', {});
    return this.getHotel(id);
  }

  async setPlan(adminId: string, id: string, dto: SetHotelPlanDto) {
    const hotel = await this.mustFind(id);
    const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    await this.prisma.hotel.update({ where: { id }, data: { planId: dto.planId } });
    await this.adminAudit(adminId, id, 'platform.hotel.set_plan', { plan: plan.code });
    // If moving an active hotel onto a paid plan with no live subscription, start one.
    if (hotel.status === HotelStatus.ACTIVE && plan.priceMinor > 0 && !hotel.currentPeriodEnd) {
      await this.billing.issueInvoice(id);
    }
    return this.getHotel(id);
  }

  async setFeatures(adminId: string, id: string, dto: SetFeatureOverridesDto) {
    await this.mustFind(id);
    await this.prisma.hotel.update({
      where: { id },
      data: { featureOverrides: dto.overrides as Prisma.InputJsonValue },
    });
    await this.adminAudit(adminId, id, 'platform.hotel.set_features', dto.overrides);
    return this.getHotel(id);
  }

  async extendTrial(adminId: string, id: string, dto: ExtendTrialDto) {
    const hotel = await this.mustFind(id);
    const base = hotel.trialEndsAt && hotel.trialEndsAt > new Date() ? hotel.trialEndsAt : new Date();
    await this.prisma.hotel.update({
      where: { id },
      data: { trialEndsAt: new Date(base.getTime() + dto.days * 86400_000) },
    });
    await this.adminAudit(adminId, id, 'platform.hotel.extend_trial', { days: dto.days });
    return this.getHotel(id);
  }

  /** Support impersonation: issue a hotel OWNER token for a tenant (super-admin only). */
  async impersonate(adminRole: PlatformRole, adminId: string, id: string) {
    if (adminRole !== PlatformRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only a super admin can impersonate');
    }
    const owner = await this.prisma.user.findFirst({
      where: { hotelId: id, role: Role.OWNER, active: true, deletedAt: null },
    });
    if (!owner) throw new NotFoundException('No active owner to impersonate');
    const tokens = await this.auth.issueTokens({
      sub: owner.id,
      hotelId: id,
      role: owner.role,
    });
    await this.adminAudit(adminId, id, 'platform.hotel.impersonate', { ownerId: owner.id });
    return {
      ...tokens,
      user: {
        id: owner.id,
        hotelId: id,
        name: owner.name,
        role: owner.role,
        phone: owner.phone,
        extraPermissions: owner.extraPermissions,
      },
    };
  }

  // ---------------------------------------------------------------- Plans
  listPlans(includeInactive = true) {
    return this.prisma.plan.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ sortOrder: 'asc' }, { priceMinor: 'asc' }],
    });
  }

  listPublicPlans() {
    return this.prisma.plan.findMany({
      where: { active: true, isPublic: true },
      orderBy: [{ sortOrder: 'asc' }, { priceMinor: 'asc' }],
    });
  }

  async createPlan(dto: PlanDto) {
    const exists = await this.prisma.plan.findUnique({ where: { code: dto.code } });
    if (exists) throw new BadRequestException(`Plan code "${dto.code}" already exists`);
    return this.prisma.plan.create({ data: { ...dto } });
  }

  async updatePlan(id: string, dto: UpdatePlanDto) {
    await this.prisma.plan.findUniqueOrThrow({ where: { id } }).catch(() => {
      throw new NotFoundException('Plan not found');
    });
    return this.prisma.plan.update({ where: { id }, data: { ...dto } });
  }

  async deactivatePlan(id: string) {
    const inUse = await this.prisma.hotel.count({ where: { planId: id } });
    if (inUse > 0) {
      // Don't orphan tenants — just hide it from new signups and mark inactive.
      return this.prisma.plan.update({
        where: { id },
        data: { active: false, isPublic: false },
      });
    }
    return this.prisma.plan.delete({ where: { id } });
  }

  // ---------------------------------------------------------------- Tenant (hotel side)
  /** The calling hotel's own subscription view (status, plan, features, trial). */
  async getSubscription(hotelId: string) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id: hotelId },
      select: {
        name: true,
        status: true,
        approved: true,
        approvalRequested: true,
        trialEndsAt: true,
        featureOverrides: true,
        plan: true,
      },
    });
    if (!hotel) throw new NotFoundException('Hotel not found');
    return {
      name: hotel.name,
      status: hotel.status,
      approved: hotel.approved,
      approvalRequested: hotel.approvalRequested,
      trialEndsAt: hotel.trialEndsAt,
      plan: hotel.plan
        ? { code: hotel.plan.code, name: hotel.plan.name, features: hotel.plan.features }
        : null,
      features: hotel.plan
        ? resolveFeatures(
            hotel.plan.features,
            (hotel.featureOverrides as FeatureOverrides) ?? {},
          )
        : ALL_FEATURES,
    };
  }

  /** Hotel owner asks the platform to review/approve their account (go live). */
  async requestApproval(hotelId: string, actorId?: string, ip?: string) {
    const hotel = await this.mustFind(hotelId);
    if (hotel.approved) {
      return { ok: true, alreadyApproved: true };
    }
    await this.prisma.hotel.update({
      where: { id: hotelId },
      data: { approvalRequested: true },
    });
    await this.audit.record({
      actor: { type: ActorType.USER, id: actorId, hotelId, ip },
      action: 'platform.hotel.request_approval',
      entity: 'Hotel',
      entityId: hotelId,
      after: { approvalRequested: true },
    });
    return { ok: true, alreadyApproved: false };
  }

  // ---------------------------------------------------------------- Stats
  async stats() {
    const [byStatus, totalRooms, totalUsers, totalReservations, plans] =
      await Promise.all([
        this.prisma.hotel.groupBy({ by: ['status'], _count: { _all: true } }),
        this.prisma.room.count(),
        this.prisma.user.count(),
        this.prisma.reservation.count(),
        this.prisma.plan.count({ where: { active: true } }),
      ]);
    const counts: Record<string, number> = {
      TRIAL: 0,
      ACTIVE: 0,
      SUSPENDED: 0,
      CANCELLED: 0,
    };
    for (const g of byStatus) counts[g.status] = g._count._all;
    return {
      hotels: {
        total: Object.values(counts).reduce((a, b) => a + b, 0),
        ...counts,
      },
      totalRooms,
      totalUsers,
      totalReservations,
      activePlans: plans,
    };
  }

  // ---------------------------------------------------------------- helpers
  private async mustFind(id: string) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id },
      select: { id: true, status: true, approved: true, planId: true, trialEndsAt: true, currentPeriodEnd: true },
    });
    if (!hotel) throw new NotFoundException('Hotel not found');
    return hotel;
  }

  private decorate<T extends { featureOverrides: unknown; plan: { features: string[] } | null }>(
    hotel: T,
  ): T & { features: Feature[] } {
    return {
      ...hotel,
      features: hotel.plan
        ? resolveFeatures(
            hotel.plan.features,
            (hotel.featureOverrides as FeatureOverrides) ?? {},
          )
        : ALL_FEATURES,
    };
  }

  private adminAudit(
    adminId: string,
    hotelId: string,
    action: string,
    after: unknown,
  ) {
    return this.audit.record({
      actor: { type: ActorType.SYSTEM, id: adminId, hotelId },
      action,
      entity: 'Hotel',
      entityId: hotelId,
      after,
    });
  }
}
