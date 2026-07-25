import 'dotenv/config';

import {
  DEPRECATED_FEATURE_KEYS,
  FEATURE_REGISTRY,
  TENANT_TIERS,
  TIER_FEATURE_PRESETS,
} from '@pos/shared';
import { PrismaClient, TenantTier } from '@prisma/client';
import * as argon2 from 'argon2';

import { hashPassword } from '../src/modules/auth/auth.service.js';
import { createDefaultBranch } from '../src/modules/core/branch.js';
import { applyTierPreset } from '../src/modules/permissions/permissions.service.js';
import { ensureBusinessSettings } from '../src/modules/settings/settings.service.js';
import { ensureMiscProduct } from '../src/modules/billing/misc-product.js';

const prisma = new PrismaClient();

async function main() {
  // RLS (when enabled) blocks writes unless bypass is set for seed/migrations.
  await prisma.$executeRaw`SELECT set_config('app.bypass_rls', 'true', false)`;
  await prisma.$executeRaw`SELECT set_config('app.current_tenant_id', '', false)`;

  for (const feature of FEATURE_REGISTRY) {
    await prisma.featureRegistry.upsert({
      where: { key: feature.key },
      create: {
        key: feature.key,
        module: feature.module,
        label: feature.label,
        description: feature.description,
        isActive: true,
      },
      update: {
        module: feature.module,
        label: feature.label,
        description: feature.description,
        isActive: true,
      },
    });
  }

  for (const key of DEPRECATED_FEATURE_KEYS) {
    await prisma.featureRegistry.updateMany({
      where: { key },
      data: { isActive: false },
    });
  }

  for (const [tier, keys] of Object.entries(TIER_FEATURE_PRESETS)) {
    await prisma.tierPreset.deleteMany({ where: { tier: tier as TenantTier } });
    await prisma.tierPreset.createMany({
      data: keys.map((featureKey) => ({
        tier: tier as TenantTier,
        featureKey,
      })),
      skipDuplicates: true,
    });
  }

  const superAdminEmail = process.env.SEED_SUPER_ADMIN_EMAIL ?? 'superadmin@nexmind.com';
  const superAdminPassword = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'SuperAdmin123!';

  const existing = await prisma.user.findFirst({
    where: { email: superAdminEmail, tenantId: null, deletedAt: null },
  });

  if (!existing) {
    await prisma.user.create({
      data: {
        email: superAdminEmail,
        passwordHash: await argon2.hash(superAdminPassword, { type: argon2.argon2id }),
        fullName: 'Super Admin',
        role: 'SUPER_ADMIN',
        tenantId: null,
        mustChangePassword: true,
      },
    });
    console.log(`Super Admin created: ${superAdminEmail} / ${superAdminPassword}`);
  } else {
    console.log(`Super Admin already exists: ${superAdminEmail}`);
  }

  const salesRepEmail = process.env.SEED_SALES_REP_EMAIL ?? 'sales@nexmind.com';
  const salesRepPassword = process.env.SEED_SALES_REP_PASSWORD ?? 'SalesRep123!';

  let salesRep = await prisma.user.findFirst({
    where: { email: salesRepEmail, tenantId: null, deletedAt: null },
  });

  if (!salesRep) {
    salesRep = await prisma.user.create({
      data: {
        email: salesRepEmail,
        passwordHash: await argon2.hash(salesRepPassword, { type: argon2.argon2id }),
        fullName: 'Demo Sales Rep',
        role: 'SUPER_ADMIN',
        tenantId: null,
        isSalesRep: true,
        mustChangePassword: true,
      },
    });
    console.log(`Sales rep created: ${salesRepEmail} / ${salesRepPassword}`);
  }

  const demoSlug = 'demo-shop';
  const demoOwnerEmail = process.env.SEED_DEMO_OWNER_EMAIL ?? 'owner@demo.shop';
  const demoOwnerPassword = process.env.SEED_DEMO_OWNER_PASSWORD ?? 'DemoShop123!';

  const existingDemo = await prisma.tenant.findFirst({
    where: { slug: demoSlug, deletedAt: null },
  });

  if (!existingDemo) {
    const superAdmin = await prisma.user.findFirst({
      where: { email: superAdminEmail, tenantId: null, deletedAt: null },
    });

    const tenant = await prisma.$transaction(async (tx) => {
      const created = await tx.tenant.create({
        data: {
          name: 'Demo Shop',
          slug: demoSlug,
          tier: TenantTier.STANDARD,
          feeStatus: 'ACTIVE',
          monthlyFee: 5000,
          acquiredById: salesRep?.id ?? null,
        },
      });

      await tx.user.create({
        data: {
          tenantId: created.id,
          email: demoOwnerEmail.toLowerCase(),
          passwordHash: await hashPassword(demoOwnerPassword),
          fullName: 'Demo Shop Owner',
          role: 'CLIENT_ADMIN',
          mustChangePassword: false,
        },
      });

      return created;
    });

    if (superAdmin) {
      await applyTierPreset(tenant.id, TENANT_TIERS.STANDARD, superAdmin.id);
    }
    await ensureBusinessSettings(tenant.id, 'Demo Shop');
    await createDefaultBranch(tenant.id, 'Demo Shop');
    await ensureMiscProduct(tenant.id);

    await prisma.category.create({
      data: {
        tenantId: tenant.id,
        name: 'Groceries',
        sortOrder: 0,
      },
    });

    const category = await prisma.category.findFirst({
      where: { tenantId: tenant.id, name: 'Groceries' },
    });

    await prisma.product.createMany({
      data: [
        {
          tenantId: tenant.id,
          categoryId: category?.id,
          name: 'Basmati Rice 5kg',
          barcode: '890100001',
          sellPrice: 950,
          stockQuantity: 50,
          lowStockThreshold: 10,
        },
        {
          tenantId: tenant.id,
          categoryId: category?.id,
          name: 'Cooking Oil 1L',
          barcode: '890100002',
          sellPrice: 520,
          stockQuantity: 30,
          lowStockThreshold: 5,
        },
        {
          tenantId: tenant.id,
          categoryId: category?.id,
          name: 'Sugar 1kg',
          barcode: '890100003',
          sellPrice: 180,
          stockQuantity: 100,
          lowStockThreshold: 20,
        },
      ],
    });

    console.log(`Demo shop created — login: ${demoOwnerEmail} / ${demoOwnerPassword}`);
  } else {
    console.log(`Demo shop already exists: ${demoSlug}`);
    await ensureMiscProduct(existingDemo.id);
    const superAdmin = await prisma.user.findFirst({
      where: { email: superAdminEmail, tenantId: null, deletedAt: null },
    });
    if (superAdmin) {
      await applyTierPreset(existingDemo.id, TENANT_TIERS.STANDARD, superAdmin.id);
      console.log('Demo shop features refreshed to STANDARD (includes void/return)');
    }

    const demoOwner = await prisma.user.findFirst({
      where: {
        email: demoOwnerEmail.toLowerCase(),
        tenantId: existingDemo.id,
        deletedAt: null,
      },
    });

    if (!demoOwner) {
      await prisma.user.create({
        data: {
          tenantId: existingDemo.id,
          email: demoOwnerEmail.toLowerCase(),
          passwordHash: await hashPassword(demoOwnerPassword),
          fullName: 'Demo Shop Owner',
          role: 'CLIENT_ADMIN',
          mustChangePassword: false,
        },
      });
      console.log(`Demo owner created: ${demoOwnerEmail} / ${demoOwnerPassword}`);
    }

    if (salesRep) {
      await prisma.tenant.updateMany({
        where: { slug: demoSlug, deletedAt: null, acquiredById: null },
        data: { acquiredById: salesRep.id, feeStatus: 'ACTIVE', monthlyFee: 5000 },
      });
    }
  }

  console.log('Seed completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
