/**
 * Phase 9 proofs (multi-tenant platform layer): public self-registration creates
 * a TRIAL hotel; the TenantGuard enforces plan features (trial lacks the channel
 * manager) and blocks suspended hotels; the master controller approves a hotel
 * onto a paid plan (unlocking the feature), suspends and reactivates it; and
 * platform-admin auth + plan listing work.
 */
import { ExecutionContext, ForbiddenException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import {
  CORE_FEATURES,
  Feature,
  HotelStatus,
  PlanInterval,
  PlatformRole,
} from '@hospitalityos/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PlatformService } from '../src/platform/platform.service';
import { PlatformAuthService } from '../src/platform/platform-auth.service';
import { TenantGuard } from '../src/auth/tenant.guard';
import { FEATURE_KEY, ALLOW_SUSPENDED_KEY } from '../src/common/decorators';

// Minimal Reflector stub: returns the configured feature / allow-suspended flag.
function reflectorFor(feature?: Feature, allowSuspended = false) {
  return {
    getAllAndOverride: (key: string) => {
      if (key === FEATURE_KEY) return feature;
      if (key === ALLOW_SUSPENDED_KEY) return allowSuspended;
      return undefined;
    },
  } as any;
}
const ctxFor = (hotelId: string): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user: { hotelId } }) }),
    getHandler: () => null,
    getClass: () => null,
  }) as any;

/** Run a fresh guard (so the 15s entitlement cache never masks a state change). */
async function guardAllows(
  prisma: PrismaService,
  hotelId: string,
  feature?: Feature,
  allowSuspended = false,
): Promise<boolean> {
  const guard = new TenantGuard(reflectorFor(feature, allowSuspended), prisma);
  try {
    return await guard.canActivate(ctxFor(hotelId));
  } catch (e) {
    if (e instanceof ForbiddenException) return false;
    throw e;
  }
}

describe('Phase 9 multi-tenant platform (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let platform: PlatformService;
  let platformAuth: PlatformAuthService;

  let trialPlanId: string;
  let proPlanId: string;
  let hotelId: string;
  let adminId: string;
  const stamp = Date.now();
  const adminEmail = `admin_${stamp}@platform.test`;

  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = m.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    platform = app.get(PlatformService);
    platformAuth = app.get(PlatformAuthService);

    const trial = await prisma.plan.upsert({
      where: { code: 'trial' },
      update: {},
      create: {
        code: 'trial',
        name: 'Free Trial',
        interval: PlanInterval.MONTHLY,
        features: [
          ...CORE_FEATURES,
          Feature.RESTAURANT_POS,
          Feature.RATE_MANAGEMENT,
          Feature.ANALYTICS,
        ],
      },
    });
    trialPlanId = trial.id;
    const pro = await prisma.plan.upsert({
      where: { code: 'pro' },
      update: {},
      create: {
        code: 'pro',
        name: 'Professional',
        priceMinor: 14900,
        interval: PlanInterval.MONTHLY,
        features: [...trial.features, Feature.CHANNEL_MANAGER, Feature.ONLINE_PAYMENTS],
      },
    });
    proPlanId = pro.id;

    const admin = await prisma.platformAdmin.create({
      data: {
        email: adminEmail,
        name: 'Test Admin',
        passwordHash: await argon2.hash('superSecret123'),
        role: PlatformRole.SUPER_ADMIN,
      },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    if (hotelId) {
      await prisma.subscriptionInvoice.deleteMany({ where: { hotelId } });
      await prisma.auditLog.deleteMany({ where: { hotelId } });
      await prisma.session.deleteMany({ where: { user: { hotelId } } });
      await prisma.user.deleteMany({ where: { hotelId } });
      await prisma.hotel.deleteMany({ where: { id: hotelId } });
    }
    await prisma.platformAdmin.deleteMany({ where: { id: adminId } });
    await app.close();
  });

  it('self-registers a hotel as TRIAL on the trial plan', async () => {
    const res = await platform.register({
      hotelName: `Trial Inn ${stamp}`,
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      ownerName: 'Trial Owner',
      ownerPhone: `+99${stamp}`.slice(0, 15),
      ownerPassword: 'ownerPass123',
      planCode: 'trial',
    });
    hotelId = res.hotel.id;
    expect(res.hotel.status).toBe(HotelStatus.TRIAL);
    expect(res.accessToken).toBeTruthy();
    expect(res.user.role).toBe('OWNER');

    const sub = await platform.getSubscription(hotelId);
    expect(sub.plan?.code).toBe('trial');
    expect(sub.features).toContain(Feature.RESTAURANT_POS);
    expect(sub.features).not.toContain(Feature.CHANNEL_MANAGER);
  });

  it('TenantGuard allows core + trial features but blocks an ungranted feature', async () => {
    expect(await guardAllows(prisma, hotelId, Feature.RESERVATIONS)).toBe(true); // core
    expect(await guardAllows(prisma, hotelId, Feature.RESTAURANT_POS)).toBe(true); // in trial
    expect(await guardAllows(prisma, hotelId, Feature.CHANNEL_MANAGER)).toBe(false); // not in trial
  });

  it('approval onto the pro plan unlocks the channel manager and goes ACTIVE', async () => {
    const updated = await platform.approve(adminId, hotelId, { planId: proPlanId });
    expect(updated.status).toBe(HotelStatus.ACTIVE);
    expect(updated.approved).toBe(true);
    expect(await guardAllows(prisma, hotelId, Feature.CHANNEL_MANAGER)).toBe(true);
  });

  it('suspension blocks normal access but @AllowSuspended routes still work', async () => {
    await platform.suspend(adminId, hotelId, { reason: 'non-payment' });
    expect(await guardAllows(prisma, hotelId, Feature.RESERVATIONS)).toBe(false);
    expect(await guardAllows(prisma, hotelId, Feature.RESERVATIONS, true)).toBe(true); // allowSuspended
    // reactivation restores access
    await platform.reactivate(adminId, hotelId);
    expect(await guardAllows(prisma, hotelId, Feature.RESERVATIONS)).toBe(true);
  });

  it('platform-admin can log in and list plans', async () => {
    const login = await platformAuth.login({ email: adminEmail, password: 'superSecret123' });
    expect(login.accessToken).toBeTruthy();
    expect(login.admin.role).toBe(PlatformRole.SUPER_ADMIN);
    const plans = await platform.listPlans();
    expect(plans.map((p) => p.code)).toEqual(expect.arrayContaining(['trial', 'pro']));
  });
});
