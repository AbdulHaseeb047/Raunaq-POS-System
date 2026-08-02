export function formatMoney(value: string | number, currency = 'PKR'): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(num)) return `${currency} 0.00`;
  return `${currency} ${num.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-PK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Local calendar YYYY-MM-DD (not UTC — avoids off-by-one in PK / other offsets). */
export function localDateIso(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayIso(): string {
  return localDateIso();
}

/** True if an ISO timestamp falls on a local calendar day within [from, to] inclusive. */
export function isTimestampInLocalDateRange(iso: string, from: string, to: string): boolean {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T23:59:59.999`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  return t >= lo && t <= hi;
}
