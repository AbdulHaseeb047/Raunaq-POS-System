import { useMemo, useState } from 'react';

import { localDateIso, todayIso } from '@/lib/format';

export type DateRangeKey = 'today' | 'week' | 'month' | 'custom';

export const DATE_RANGE_BUTTONS: Array<{ key: DateRangeKey; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'custom', label: 'Custom' },
];

/** Inclusive start of the last 7 local calendar days (today and 6 days before). */
export function startOfWeekIso(d = new Date()): string {
  const x = new Date(d);
  x.setDate(x.getDate() - 6);
  return localDateIso(x);
}

export function startOfMonthIso(d = new Date()): string {
  return localDateIso(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function resolveDateRange(
  range: DateRangeKey,
  customFrom: string,
  customTo: string,
): { from: string; to: string } {
  const today = todayIso();
  if (range === 'today') return { from: today, to: today };
  if (range === 'week') return { from: startOfWeekIso(), to: today };
  if (range === 'month') return { from: startOfMonthIso(), to: today };
  const from = customFrom <= customTo ? customFrom : customTo;
  const to = customFrom <= customTo ? customTo : customFrom;
  return { from, to };
}

export function useDateRangeFilter(defaultRange: DateRangeKey = 'today') {
  const [range, setRange] = useState<DateRangeKey>(defaultRange);
  const [customFrom, setCustomFrom] = useState(todayIso());
  const [customTo, setCustomTo] = useState(todayIso());

  const dates = useMemo(
    () => resolveDateRange(range, customFrom, customTo),
    [range, customFrom, customTo],
  );

  return {
    range,
    setRange,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    dates,
  };
}
