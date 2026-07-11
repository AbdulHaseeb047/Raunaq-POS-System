import { describe, expect, it } from 'vitest';

import { nextFailedPushState } from './reconcile-remote.service.js';

describe('nextFailedPushState', () => {
  it('stays FAILED below the retry cap', () => {
    const result = nextFailedPushState(2, 5, 'bad payload');
    expect(result.status).toBe('FAILED');
    expect(result.retryCount).toBe(3);
  });

  it('escalates to CONFLICT at the retry cap', () => {
    const result = nextFailedPushState(4, 5, 'bad payload');
    expect(result.status).toBe('CONFLICT');
    expect(result.retryCount).toBe(5);
    expect(result.errorMessage).toContain('max retries');
  });
});
