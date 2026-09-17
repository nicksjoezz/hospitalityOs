/**
 * Phase 11 proofs (tenant login scoping): two hotels can share an owner phone
 * without mixing up — a per-hotel login slug scopes the login to the right hotel,
 * an ambiguous slug-less login is rejected, a unique phone still logs in directly,
 * and the public slug→hotel lookup resolves the hotel name for the login page.
 */
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PlatformService } from '../src/platform/platform.service';
import { AuthService } from '../src/auth/auth.service';

describe('Phase 11 tenant login scoping (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let platform: PlatformService;
  let auth: AuthService;

  const stamp = Date.now();
  const sharedPhone = `+15${stamp}`.slice(0, 15);
  const uniquePhone = `+16${stamp}`.slice(0, 15);
  const ids: string[] = [];
  let slugA = '';
  let slugB = '';

  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = m.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    platform = app.get(PlatformService);
    auth = app.get(AuthService);

    // Two hotels, SAME owner phone — the classic multi-tenant collision.
    const a = await platform.register({
      hotelName: `Alpha Hotel ${stamp}`, currency: 'NGN', timezone: 'Africa/Lagos',
      ownerName: 'Owner A', ownerPhone: sharedPhone, ownerPassword: 'passAlpha1',
    });
    const b = await platform.register({
      hotelName: `Beta Hotel ${stamp}`, currency: 'NGN', timezone: 'Africa/Lagos',
      ownerName: 'Owner B', ownerPhone: sharedPhone, ownerPassword: 'passBeta22',
    });
    // A third hotel with a unique phone.
    const c = await platform.register({
      hotelName: `Gamma Hotel ${stamp}`, currency: 'NGN', timezone: 'Africa/Lagos',
      ownerName: 'Owner C', ownerPhone: uniquePhone, ownerPassword: 'passGamma3',
    });
    ids.push(a.hotel.id, b.hotel.id, c.hotel.id);
    slugA = a.hotel.slug!;
    slugB = b.hotel.slug!;
  });

  afterAll(async () => {
    for (const id of ids) {
      await prisma.subscriptionInvoice.deleteMany({ where: { hotelId: id } });
      await prisma.auditLog.deleteMany({ where: { hotelId: id } });
      await prisma.session.deleteMany({ where: { user: { hotelId: id } } });
      await prisma.user.deleteMany({ where: { hotelId: id } });
      await prisma.hotel.deleteMany({ where: { id } });
    }
    await app.close();
  });

  it('assigns a unique login slug per hotel', () => {
    expect(slugA).toBeTruthy();
    expect(slugB).toBeTruthy();
    expect(slugA).not.toBe(slugB);
  });

  it('a per-hotel slug scopes the login to the right hotel', async () => {
    const a = await auth.login({ phone: sharedPhone, password: 'passAlpha1', hotelSlug: slugA });
    expect(a.user.hotelId).toBe(ids[0]);
    const b = await auth.login({ phone: sharedPhone, password: 'passBeta22', hotelSlug: slugB });
    expect(b.user.hotelId).toBe(ids[1]);
  });

  it('rejects the right password at the wrong hotel (no cross-tenant leak)', async () => {
    // Alpha's password must not authenticate against Beta's slug.
    await expect(
      auth.login({ phone: sharedPhone, password: 'passAlpha1', hotelSlug: slugB }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses an ambiguous slug-less login when a phone exists at multiple hotels', async () => {
    await expect(
      auth.login({ phone: sharedPhone, password: 'passAlpha1' }),
    ).rejects.toThrow(/hotel login link/i);
  });

  it('still allows a slug-less login when the phone is globally unique', async () => {
    const c = await auth.login({ phone: uniquePhone, password: 'passGamma3' });
    expect(c.user.hotelId).toBe(ids[2]);
  });

  it('resolves a public slug → hotel name for the login page', async () => {
    const h = await platform.hotelBySlug(slugA);
    expect(h.name).toContain('Alpha Hotel');
    await expect(platform.hotelBySlug('no-such-hotel-xyz')).rejects.toThrow();
  });
});
