import { describe, expect, it } from 'vitest';

import { buildSyncStatusMessage } from './outbox-issues.service.js';

describe('buildSyncStatusMessage', () => {
  it('prioritizes conflict messaging', () => {
    expect(buildSyncStatusMessage(3, 1, 2)).toContain('need review');
  });

  it('returns null when fully synced', () => {
    expect(buildSyncStatusMessage(0, 0, 0)).toBeNull();
  });
});
