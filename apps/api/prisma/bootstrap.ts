/**
 * First-run bootstrap (production-ready, NOT demo data).
 *
 * The platform is multi-tenant: every hotel is a CUSTOMER that onboards itself
 * via /register. The only identity seeded here is the platform operator (master
 * controller). Bootstrap is idempotent and:
 *   - seeds the default subscription plans (trial/starter/pro/enterprise),
 *   - seeds the master-controller super-admin from PLATFORM_ADMIN_* env,
 *   - backfills a login slug for any pre-existing hotel that lacks one.
 * It does NOT create any hotel — the first hotel is created when an operator
 * registers it.
 *
 * Configure via env: PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD / PLATFORM_ADMIN_NAME
 * Run: npm run db:bootstrap   (or npm run db:seed)
 */
import 'dotenv/config';
import { PlanInterval, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { ALL_FEATURES, CORE_FEATURES, Feature } from '@hospitalityos/shared';

const prisma = new PrismaClient();

// Plan catalogue. Trial gives a generous taste of operations; the OTA/payments/
// AI-revenue/marketing "go-live" features unlock on approval onto a paid plan.
const PLANS = [
  {
    code: 'trial',
    name: 'Free Trial',
    description: 'Explore the platform free. Go-live features unlock on approval.',
    priceMinor: 0,
    interval: PlanInterval.MONTHLY,
    sortOrder: 0,
    maxRooms: null as number | null,
    maxUsers: null as number | null,
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
    maxRooms: null,
    maxUsers: null,
    features: ALL_FEATURES,
  },
];

async function seedPlans(): Promise<void> {
  for (const p of PLANS) {
    await prisma.plan.upsert({
      where: { code: p.code },
      // Don't clobber an operator's manual edits on re-run; just ensure it exists.
      update: { active: true, isPublic: true },
      create: {
        code: p.code,
        name: p.name,
        description: p.description,
        priceMinor: p.priceMinor,
        currency: 'USD',
        interval: p.interval,
        features: p.features,
        maxRooms: p.maxRooms,
        maxUsers: p.maxUsers,
        isPublic: true,
        active: true,
        sortOrder: p.sortOrder,
      },
    });
  }
  console.log(`Plans ready: ${PLANS.map((p) => p.code).join(', ')}`);
}

async function seedPlatformAdmin(): Promise<void> {
  const email = process.env.PLATFORM_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  if (!email || !password) {
    const count = await prisma.platformAdmin.count();
    if (count === 0) {
      console.log(
        'WARNING: no PLATFORM_ADMIN_EMAIL/PASSWORD set and no master admin exists. ' +
          'Set them in .env and re-run — without a master login no one can manage the platform.',
      );
    }
    return;
  }
  const existing = await prisma.platformAdmin.findUnique({ where: { email } });
  if (existing) {
    console.log(`Master super-admin already exists (${email}).`);
    return;
  }
  await prisma.platformAdmin.create({
    data: {
      email,
      name: process.env.PLATFORM_ADMIN_NAME ?? 'Platform Admin',
      passwordHash: await argon2.hash(password),
      role: 'SUPER_ADMIN',
    },
  });
  console.log(`Created master super-admin → ${email} (sign in at /master).`);
}

function slugify(name: string): string {
  return (
    name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) ||
    'hotel'
  );
}

/** Give a login slug to any pre-existing hotel that predates the slug column. */
async function backfillSlugs(): Promise<void> {
  const noSlug = await prisma.hotel.findMany({ where: { slug: null }, select: { id: true, name: true } });
  for (const h of noSlug) {
    let slug = slugify(h.name);
    for (let i = 1; await prisma.hotel.findUnique({ where: { slug } }); i++) slug = `${slugify(h.name)}-${i + 1}`;
    await prisma.hotel.update({ where: { id: h.id }, data: { slug } });
    console.log(`Set login slug for "${h.name}" → /h/${slug}`);
  }
}

async function main(): Promise<void> {
  await seedPlans();
  await seedPlatformAdmin();
  await backfillSlugs();
  console.log('Bootstrap complete. Hotels onboard themselves at /register; manage them at /master.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
