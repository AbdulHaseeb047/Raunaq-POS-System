import { describe, expect, it } from 'vitest';

import { FEATURES } from '@pos/shared';

import { userHasFeature } from './permissions.service.js';

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
});
