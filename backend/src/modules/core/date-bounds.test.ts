import { describe, expect, it } from 'vitest';

import { endOfPkDay, pkDayKey, resolvePkDateRange, startOfPkDay } from './date-bounds.js';

describe('date-bounds', () => {
  it('maps YYYY-MM-DD to Asia/Karachi day bounds independent of host TZ math', () => {
    const start = startOfPkDay('2026-08-03');
    const end = endOfPkDay('2026-08-03');

    expect(start.toISOString()).toBe('2026-08-02T19:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-03T18:59:59.999Z');
    expect(pkDayKey(start)).toBe('2026-08-03');
    expect(pkDayKey(end)).toBe('2026-08-03');
  });

  it('keeps early-morning PK sales inside the selected day', () => {
    const { start, end, isSingleDay, fromIso, toIso } = resolvePkDateRange(
      '2026-08-03',
      '2026-08-03',
    );
    const earlyMorningPk = new Date('2026-08-02T20:00:00.000Z'); // 01:00 PKT Aug 3

    expect(isSingleDay).toBe(true);
    expect(fromIso).toBe('2026-08-03');
    expect(toIso).toBe('2026-08-03');
    expect(earlyMorningPk.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(earlyMorningPk.getTime()).toBeLessThanOrEqual(end.getTime());
  });

  it('resolves multi-day week ranges without UTC off-by-one on from/to', () => {
    const { start, end, fromIso, toIso, isSingleDay } = resolvePkDateRange(
      '2026-07-28',
      '2026-08-03',
    );

    expect(isSingleDay).toBe(false);
    expect(fromIso).toBe('2026-07-28');
    expect(toIso).toBe('2026-08-03');
    expect(start.toISOString()).toBe('2026-07-27T19:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-03T18:59:59.999Z');
  });
});
