/**
 * Calendar-day bounds for Asia/Karachi (UTC+5, no DST).
 * Date-only query strings (YYYY-MM-DD) must not use `new Date(iso)` + setHours:
 * that follows the host TZ and breaks on UTC servers (Railway) vs local PK.
 */

const PK_OFFSET_MS = 5 * 60 * 60 * 1000;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateOnlyParts(iso: string): { y: number; m: number; d: number } | null {
  const m = DATE_ONLY.exec(iso.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const month = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(month) || !Number.isFinite(d)) return null;
  return { y, m: month, d };
}

/** Start of a PK calendar day (00:00:00.000 Asia/Karachi) as a UTC Date. */
export function startOfPkDay(isoDate: string, fallback = new Date()): Date {
  const parts = parseDateOnlyParts(isoDate);
  if (!parts) {
    const x = new Date(fallback);
    const key = pkDayKey(x);
    return startOfPkDay(key, x);
  }
  return new Date(Date.UTC(parts.y, parts.m - 1, parts.d, 0, 0, 0, 0) - PK_OFFSET_MS);
}

/** End of a PK calendar day (23:59:59.999 Asia/Karachi) as a UTC Date. */
export function endOfPkDay(isoDate: string, fallback = new Date()): Date {
  const parts = parseDateOnlyParts(isoDate);
  if (!parts) {
    const x = new Date(fallback);
    const key = pkDayKey(x);
    return endOfPkDay(key, x);
  }
  return new Date(Date.UTC(parts.y, parts.m - 1, parts.d, 23, 59, 59, 999) - PK_OFFSET_MS);
}

/** YYYY-MM-DD for an instant in Asia/Karachi. */
export function pkDayKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function resolvePkDateRange(
  from?: string,
  to?: string,
  now = new Date(),
): { start: Date; end: Date; fromIso: string; toIso: string; isSingleDay: boolean } {
  const today = pkDayKey(now);
  const fromIso = from && DATE_ONLY.test(from.trim()) ? from.trim() : today;
  const toIso = to && DATE_ONLY.test(to.trim()) ? to.trim() : today;
  const rangeStart = startOfPkDay(fromIso, now);
  const rangeEnd = endOfPkDay(toIso, now);
  const start = rangeStart.getTime() <= rangeEnd.getTime() ? rangeStart : rangeEnd;
  const end = rangeStart.getTime() <= rangeEnd.getTime() ? rangeEnd : rangeStart;
  const resolvedFrom = rangeStart.getTime() <= rangeEnd.getTime() ? fromIso : toIso;
  const resolvedTo = rangeStart.getTime() <= rangeEnd.getTime() ? toIso : fromIso;
  return {
    start,
    end,
    fromIso: resolvedFrom,
    toIso: resolvedTo,
    isSingleDay: resolvedFrom === resolvedTo,
  };
}
