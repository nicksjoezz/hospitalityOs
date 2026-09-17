/**
 * Phase 10 proofs (master billing & platform settings): approving a hotel onto a
 * paid plan raises a subscription invoice and sets its paid-through; marking it
 * paid clears it; an overdue invoice auto-suspends the hotel via the billing
 * sweep, and paying reinstates it; settings persist and the gateway secret key
 * is encrypted (never returned).
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import {
  HotelStatus,
  PlanInterval,
  PlatformRole,
  SubInvoiceStatus,
} from '@hospitalityos/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PlatformService } from '../src/platform/platform.service';
import { PlatformBillingService } from '../src/platform/platform-billing.service';
import { PlatformSettingsService } from '../src/platform/platform-settings.service';

describe('Phase 10 master billing & settings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let platform: PlatformService;
  let billing: PlatformBillingService;
  let settings: PlatformSettingsService;

  let proPlanId: string;
  let hotelId: string;
  let adminId: string;
  const stamp = Date.now();

  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = m.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    platform = app.get(PlatformService);
    billing = app.get(PlatformBillingService);
    settings = app.get(PlatformSettingsService);

    const pro = await prisma.plan.upsert({
      where: { code: 'pro' },
      update: { priceMinor: 14900, currency: 'USD' },
      create: {
        code: 'pro',
        name: 'Professional',
        priceMinor: 14900,
        currency: 'USD',
        interval: PlanInterval.MONTHLY,
        features: [],
      },
    });
    proPlanId = pro.id;
    await prisma.plan.upsert({
      where: { code: 'trial' },
      update: {},
      create: { code: 'trial', name: 'Trial', interval: PlanInterval.MONTHLY, features: [] },
    });
    const admin = await prisma.platformAdmin.create({
      data: {
        email: `billing_${stamp}@platform.test`,
        name: 'Billing Admin',
        passwordHash: await argon2.hash('superSecret123'),
        role: PlatformRole.SUPER_ADMIN,
      },
    });
    adminId = admin.id;

    const reg = await platform.register({
      hotelName: `Billing Inn ${stamp}`,
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      ownerName: 'Owner',
      ownerPhone: `+166${stamp}`.slice(0, 15),
      ownerPassword: 'ownerPass123',
      planCode: 'trial',
    });
    hotelId = reg.hotel.id;
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

  it('approval onto a paid plan raises an OPEN subscription invoice', async () => {
    await platform.approve(adminId, hotelId, { planId: proPlanId });
    const invs = await billing.listInvoices({ hotelId });
    expect(invs.length).toBe(1);
    expect(invs[0].status).toBe(SubInvoiceStatus.OPEN);
    expect(invs[0].amountMinor).toBe(14900);
    const hotel = await prisma.hotel.findUnique({ where: { id: hotelId } });
    expect(hotel?.currentPeriodEnd).toBeTruthy();
  });

  it('marking the invoice paid clears it', async () => {
    const [inv] = await billing.listInvoices({ hotelId });
    const paid = await billing.markPaid(adminId, inv.id, { reference: 'manual-1' });
    expect(paid.status).toBe(SubInvoiceStatus.PAID);
    expect(paid.paidAt).toBeTruthy();
  });

  it('an overdue invoice auto-suspends the hotel, and paying reinstates it', async () => {
    // Raise a fresh invoice and force it past due + grace.
    const inv = await billing.issueInvoice(hotelId, new Date());
    expect(inv).toBeTruthy();
    await prisma.subscriptionInvoice.update({
      where: { id: inv!.id },
      data: { dueAt: new Date(Date.now() - 60 * 86_400_000) }, // 60 days ago
    });
    await billing.sweep();
    let hotel = await prisma.hotel.findUnique({ where: { id: hotelId } });
    expect(hotel?.status).toBe(HotelStatus.SUSPENDED);
    expect((hotel?.suspendReason ?? '').toLowerCase()).toContain('subscription');

    await billing.markPaid(adminId, inv!.id, { reference: 'manual-2' });
    hotel = await prisma.hotel.findUnique({ where: { id: hotelId } });
    expect(hotel?.status).toBe(HotelStatus.ACTIVE);
  });

  it('MRR reflects the active paid subscription', async () => {
    const m = await billing.mrr();
    expect(m.mrrMinor).toBeGreaterThanOrEqual(14900);
    expect(m.payingHotels).toBeGreaterThanOrEqual(1);
  });

  it('settings persist and the gateway secret is encrypted (never returned)', async () => {
    const updated = await settings.update({
      platformName: 'My SaaS',
      signupEnabled: false,
      trialDays: 21,
      paymentProvider: 'PAYSTACK',
      paymentPublicKey: 'pk_test_123',
      paymentSecretKey: 'sk_test_SECRET',
    });
    expect(updated.platformName).toBe('My SaaS');
    expect(updated.signupEnabled).toBe(false);
    expect(updated.hasPaymentSecret).toBe(true);
    expect((updated as Record<string, unknown>).paymentSecretKeyEnc).toBeUndefined();

    // The decrypted config is available server-side for charging.
    const cfg = await settings.paymentConfig();
    expect(cfg?.provider).toBe('PAYSTACK');
    expect(cfg?.secretKey).toBe('sk_test_SECRET');

    // restore signup for other suites
    await settings.update({ signupEnabled: true, paymentProvider: null, paymentSecretKey: '' });
  });
});
