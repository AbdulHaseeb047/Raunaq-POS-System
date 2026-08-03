import { describe, expect, it } from 'vitest';

import { FEATURES, TENANT_TIERS, getTierFeaturePreset } from '@pos/shared';

import { mergePlanWithFeatureOverrides, userHasFeature } from './permissions.service.js';

describe('permission helpers', () => {
  it('userHasFeature returns true when feature is granted', () => {
    expect(
      userHasFeature(
        [FEATURES.BILLING_CREATE_SALE, FEATURES.CUSTOMERS_VIEW],
        FEATURES.CUSTOMERS_VIEW,
      ),
    ).toBe(true);
  });

  it('userHasFeature returns false when feature is missing', () => {
    expect(userHasFeature([FEATURES.BILLING_CREATE_SALE], FEATURES.CUSTOMERS_LEDGER_EDIT)).toBe(
      false,
    );
  });

  it('keeps every plan feature while adding advanced overrides', () => {
    const result = mergePlanWithFeatureOverrides(TENANT_TIERS.STARTER, [
      FEATURES.INVENTORY_PRODUCT_IMAGES,
    ]);

    expect(result).toEqual(
      expect.arrayContaining([
        ...getTierFeaturePreset(TENANT_TIERS.STARTER),
        FEATURES.INVENTORY_PRODUCT_IMAGES,
      ]),
    );
  });
});
