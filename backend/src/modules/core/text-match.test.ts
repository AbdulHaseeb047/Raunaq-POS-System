import { describe, expect, it } from 'vitest';

import { compactText } from './text-match.js';

describe('compactText', () => {
  it('strips spaces and lowercases for space-insensitive match', () => {
    expect(compactText('abc sd')).toBe('abcsd');
    expect(compactText('AbcSD')).toBe('abcsd');
    expect(compactText('  Ali   Khan ')).toBe('alikhan');
  });

  it('matches the same compact key for spaced and unspaced names', () => {
    expect(compactText('abc sd')).toBe(compactText('abcsd'));
    expect(compactText('Ali Khan')).toBe(compactText('alikhan'));
  });
});
