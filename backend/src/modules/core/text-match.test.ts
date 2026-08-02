import { describe, expect, it } from 'vitest';

import { compactText, matchesSearchTokens, searchTokens } from './text-match.js';

describe('compactText', () => {
  it('strips spaces and lowercases', () => {
    expect(compactText('abc sd')).toBe('abcsd');
    expect(compactText('  Ali   Khan ')).toBe('alikhan');
  });
});

describe('searchTokens', () => {
  it('splits on whitespace', () => {
    expect(searchTokens('mil fay')).toEqual(['mil', 'fay']);
    expect(searchTokens('  mil   fay  ')).toEqual(['mil', 'fay']);
  });
});

describe('matchesSearchTokens', () => {
  it('matches mil fay against million faayaz supreme', () => {
    expect(matchesSearchTokens('million faayaz supreme', 'mil fay')).toBe(true);
  });

  it('matches compacted no-space query', () => {
    expect(matchesSearchTokens('abc sd', 'abcsd')).toBe(true);
    expect(matchesSearchTokens('abcsd', 'abc sd')).toBe(true);
  });

  it('rejects when a token is missing', () => {
    expect(matchesSearchTokens('million supreme', 'mil fay')).toBe(false);
  });

  it('matches tokens spanning joined fields (name + phone)', () => {
    expect(matchesSearchTokens('Ali Khan 03001234567', 'ali 0300')).toBe(true);
  });
});
