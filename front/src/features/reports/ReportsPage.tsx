import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageLoader } from '@/components/ui/Spinner';
import { api } from '@/lib/api-client';
import { FEATURES, hasFeature } from '@/lib/features';
import { useAuth } from '@/lib/auth';
import { formatDateShort, formatMoney, todayIso } from '@/lib/format';

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toNumber(value: string | number | undefined | null): number {
  if (value == null) return 0;
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function HorizontalBar({
  label,
  value,
  max,
  color = 'bg-brand-600',
  valueLabel,
}: {
  label: string;
  value: number;
  max: number;
  color?: string;
  valueLabel: string;
}) {
  const width = max > 0 ? Math.max(4, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
        <span className="truncate font-medium text-text">{label}</span>
        <span className="shrink-0 text-text-muted">{valueLabel}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function ReportsPage() {
  const { user, branchId } = useAuth();
  const [date, setDate] = useState(todayIso());
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [range, setRange] = useState<'today' | 'week' | 'month' | 'custom'>('today');

  const canStaffPerf = hasFeature(user, FEATURES.USERS_MANAGE);

  const dates = useMemo(() => {
    const now = new Date();
    if (range === 'today') {
      const d = todayIso();
      return { from: d, to: d };
    }
    if (range === 'week') {
      const start = new Date(now);
      start.setDate(now.getDate() - 7);
      return { from: start.toISOString().slice(0, 10), to: todayIso() };
    }
    if (range === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: start.toISOString().slice(0, 10), to: todayIso() };
    }
    return { from, to };
  }, [range, from, to]);

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });

  const { data: summary } = useQuery({
    queryKey: ['reports', 'summary', dates.from, dates.to, branchId],
    queryFn: () => api.reports.salesSummary(dates.from, dates.to, branchId ?? undefined),
  });

  const { data: daily, isLoading } = useQuery({
    queryKey: ['reports', 'daily', date, branchId],
    queryFn: () => api.reports.dailySales(date, branchId ?? undefined),
  });

  const { data: aging } = useQuery({
    queryKey: ['reports', 'aging'],
    queryFn: () => api.reports.udhaarAging(),
  });

  const { data: stockMovement } = useQuery({
    queryKey: ['reports', 'stock', dates.from, dates.to],
    queryFn: () => api.reports.stockMovement(dates.from, dates.to),
  });

  const { data: staffPerf } = useQuery({
    queryKey: ['reports', 'staff', dates.from, dates.to],
    queryFn: () => api.reports.staffPerformance(dates.from, dates.to),
    enabled: canStaffPerf,
  });

  const { data: discountUsage } = useQuery({
    queryKey: ['reports', 'discount-usage', dates.from, dates.to],
    queryFn: () => api.discounts.usageReport(dates.from, dates.to),
  });

  const currency = settings?.currency ?? 'PKR';
  const salesVisuals = [
    { label: 'Revenue', value: toNumber(summary?.revenue), color: 'bg-brand-600' },
    { label: 'Gross Profit', value: toNumber(summary?.grossProfit), color: 'bg-emerald-500' },
    { label: 'Tax', value: toNumber(summary?.taxTotal), color: 'bg-sky-500' },
    { label: 'Discount', value: toNumber(summary?.discountTotal), color: 'bg-rose-500' },
  ];
  const maxSalesVisual = Math.max(...salesVisuals.map((v) => v.value), 1);
  const topProducts = summary?.topProducts ?? [];
  const maxTopProductRevenue = Math.max(...topProducts.map((p) => toNumber(p.revenue)), 1);
  const agingRows = aging ?? [];
  const maxAging = Math.max(...agingRows.map((r) => toNumber(r.total)), 1);
  const maxDiscountUsage = Math.max(...(discountUsage ?? []).map((r) => toNumber(r.totalDiscount)), 1);

  const exportSummaryCsv = () => {
    downloadCsv(`sales-summary-${dates.from}-${dates.to}.csv`, [
      ['Metric', 'Value'],
      ['From', dates.from],
      ['To', dates.to],
      ['Revenue', summary?.revenue ?? '0'],
      ['Transactions', String(summary?.transactionCount ?? 0)],
      ['Average ticket', summary?.averageTicket ?? '0'],
      ['Discount given', summary?.discountTotal ?? '0'],
      ['Tax collected', summary?.taxTotal ?? '0'],
      ['Gross profit', summary?.grossProfit ?? '0'],
    ]);
  };

  const exportAgingCsv = () => {
    downloadCsv('udhaar-aging.csv', [
      ['Customer', '0-7 days', '8-30 days', '30+ days', 'Total'],
      ...(aging ?? []).map((r) => [r.name, r.bucket0_7, r.bucket8_30, r.bucket30_plus, r.total]),
    ]);
  };

  if (isLoading) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Sales, stock, udhaar, and staff analytics"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={exportSummaryCsv}>
              Export CSV
            </Button>
            <Button variant="secondary" onClick={exportAgingCsv}>
              Export aging
            </Button>
          </div>
        }
      />

      <Card className="mb-6">
        <CardHeader title="Date range" subtitle="Applies to summary, stock, and staff reports" />
        <div className="mb-4 flex flex-wrap gap-2">
          {(['today', 'week', 'month', 'custom'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${range === r ? 'bg-brand-600 text-white' : 'bg-surface-muted'}`}
            >
              {r === 'today' ? 'Today' : r === 'week' ? 'This week' : r === 'month' ? 'This month' : 'Custom'}
            </button>
          ))}
        </div>
        {range === 'custom' && (
          <div className="mb-4 flex gap-2">
            <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        )}
      </Card>

      <Card className="mb-6">
        <CardHeader title="Sales summary" subtitle={`${dates.from} to ${dates.to}`} />
        <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl bg-brand-50 px-4 py-3">
            <p className="text-xs text-text-muted">Revenue</p>
            <p className="text-xl font-bold">{formatMoney(summary?.revenue ?? '0', currency)}</p>
          </div>
          <div className="rounded-xl bg-surface-muted px-4 py-3">
            <p className="text-xs text-text-muted">Transactions</p>
            <p className="text-xl font-bold">{summary?.transactionCount ?? 0}</p>
          </div>
          <div className="rounded-xl bg-surface-muted px-4 py-3">
            <p className="text-xs text-text-muted">Avg ticket</p>
            <p className="text-xl font-bold">{formatMoney(summary?.averageTicket ?? '0', currency)}</p>
          </div>
          <div className="rounded-xl bg-surface-muted px-4 py-3">
            <p className="text-xs text-text-muted">Discount given</p>
            <p className="text-xl font-bold text-danger">{formatMoney(summary?.discountTotal ?? '0', currency)}</p>
          </div>
          <div className="rounded-xl bg-surface-muted px-4 py-3">
            <p className="text-xs text-text-muted">Gross profit</p>
            <p className="text-xl font-bold">{formatMoney(summary?.grossProfit ?? '0', currency)}</p>
          </div>
        </div>
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-white p-4">
            <p className="mb-3 text-sm font-semibold">Sales visual summary</p>
            <div className="space-y-3">
              {salesVisuals.map((item) => (
                <HorizontalBar
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  max={maxSalesVisual}
                  color={item.color}
                  valueLabel={formatMoney(item.value, currency)}
                />
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-white p-4">
            <p className="mb-3 text-sm font-semibold">Top products chart</p>
            <div className="space-y-3">
              {topProducts.slice(0, 6).map((p) => (
                <HorizontalBar
                  key={p.productId}
                  label={p.name}
                  value={toNumber(p.revenue)}
                  max={maxTopProductRevenue}
                  valueLabel={formatMoney(p.revenue, currency)}
                />
              ))}
              {topProducts.length === 0 && (
                <p className="py-6 text-center text-sm text-text-muted">No product sales in this range.</p>
              )}
            </div>
          </div>
        </div>
        {(summary?.topProducts?.length ?? 0) > 0 && (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-muted text-left text-xs font-semibold uppercase text-text-muted">
                  <th className="px-4 py-3">Top products</th>
                  <th className="px-4 py-3">Qty sold</th>
                  <th className="px-4 py-3">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {summary?.topProducts.map((p) => (
                  <tr key={p.productId} className="border-t border-border/60">
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3">{p.quantitySold}</td>
                    <td className="px-4 py-3 font-semibold">{formatMoney(p.revenue, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {(discountUsage?.length ?? 0) > 0 && (
        <Card className="mb-6">
          <CardHeader title="Discount usage by rule" subtitle="Per-rule analytics for the selected period" />
          <div className="mb-4 space-y-3 rounded-xl border border-border bg-white p-4">
            {discountUsage?.slice(0, 8).map((row) => (
              <HorizontalBar
                key={row.discountRuleId}
                label={row.ruleName}
                value={toNumber(row.totalDiscount)}
                max={maxDiscountUsage}
                color="bg-rose-500"
                valueLabel={formatMoney(row.totalDiscount, currency)}
              />
            ))}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-muted text-left text-xs font-semibold uppercase text-text-muted">
                <th className="px-4 py-3">Rule</th>
                <th className="px-4 py-3">Times applied</th>
                <th className="px-4 py-3">Total discount</th>
              </tr>
            </thead>
            <tbody>
              {discountUsage?.map((row) => (
                <tr key={row.discountRuleId} className="border-t border-border/60">
                  <td className="px-4 py-3 font-medium">{row.ruleName}</td>
                  <td className="px-4 py-3">{row.usageCount}</td>
                  <td className="px-4 py-3 font-semibold text-danger">{formatMoney(row.totalDiscount, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {canStaffPerf && (staffPerf?.length ?? 0) > 0 && (
        <Card className="mb-6">
          <CardHeader title="Staff performance" subtitle="Sales by cashier" />
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-muted text-left text-xs font-semibold uppercase text-text-muted">
                <th className="px-4 py-3">Cashier</th>
                <th className="px-4 py-3">Transactions</th>
                <th className="px-4 py-3">Total sales</th>
              </tr>
            </thead>
            <tbody>
              {staffPerf?.map((s) => (
                <tr key={s.cashierId} className="border-t border-border/60">
                  <td className="px-4 py-3 font-medium">{s.cashierName}</td>
                  <td className="px-4 py-3">{s.transactionCount}</td>
                  <td className="px-4 py-3 font-semibold">{formatMoney(s.totalSales, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader title="Stock movement" subtitle="Recent movements and low-stock alerts" />
        {(stockMovement?.lowStockAlerts?.length ?? 0) > 0 && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Low stock alerts</p>
            <ul className="mt-2 space-y-1 text-sm">
              {stockMovement?.lowStockAlerts.map((p) => (
                <li key={p.id}>
                  {p.name}: {p.stockQuantity} left (threshold {p.lowStockThreshold})
                </li>
              ))}
            </ul>
          </div>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-muted text-left text-xs font-semibold uppercase text-text-muted">
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">When</th>
            </tr>
          </thead>
          <tbody>
            {(stockMovement?.movements ?? []).slice(0, 20).map((m) => (
              <tr key={m.id} className="border-t border-border/60">
                <td className="px-4 py-3">{m.productName}</td>
                <td className="px-4 py-3">{m.movementType}</td>
                <td className="px-4 py-3">{m.quantityDelta}</td>
                <td className="px-4 py-3 text-text-muted">{formatDateShort(m.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="mb-6">
        <CardHeader title="Daily sales" subtitle="Completed transactions for a date" />
        <div className="mb-4 max-w-xs">
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="mb-4 flex gap-6 rounded-xl bg-brand-50 px-5 py-4">
          <div>
            <p className="text-xs font-medium text-text-muted">Total</p>
            <p className="text-xl font-bold text-brand-800">{formatMoney(daily?.total ?? '0', currency)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-text-muted">Transactions</p>
            <p className="text-xl font-bold">{daily?.transactionCount ?? 0}</p>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-muted text-left text-xs font-semibold uppercase text-text-muted">
              <th className="px-4 py-3">Sale #</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Time</th>
            </tr>
          </thead>
          <tbody>
            {(daily?.sales ?? []).map((s) => (
              <tr key={s.id} className="border-t border-border/60">
                <td className="px-4 py-3 font-medium">{s.saleNumber}</td>
                <td className="px-4 py-3 text-text-muted">{s.customerName ?? 'Walk-in'}</td>
                <td className="px-4 py-3 font-semibold">{formatMoney(s.grandTotal, currency)}</td>
                <td className="px-4 py-3 text-text-muted">{formatDateShort(s.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <CardHeader title="Udhaar aging" subtitle="Outstanding credit by age bucket (FIFO)" />
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          {agingRows.slice(0, 6).map((row) => (
            <div key={row.customerId} className="rounded-xl border border-border bg-white p-3">
              <HorizontalBar
                label={row.name}
                value={toNumber(row.total)}
                max={maxAging}
                color="bg-slate-500"
                valueLabel={formatMoney(row.total, currency)}
              />
            </div>
          ))}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-muted text-left text-xs font-semibold uppercase text-text-muted">
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">0–7 days</th>
              <th className="px-4 py-3">8–30 days</th>
              <th className="px-4 py-3">30+ days</th>
              <th className="px-4 py-3">Total</th>
            </tr>
          </thead>
          <tbody>
            {(aging ?? []).map((row) => (
              <tr key={row.customerId} className="border-t border-border/60">
                <td className="px-4 py-3 font-medium">{row.name}</td>
                <td className="px-4 py-3">{formatMoney(row.bucket0_7, currency)}</td>
                <td className="px-4 py-3">{formatMoney(row.bucket8_30, currency)}</td>
                <td className="px-4 py-3 font-medium text-warning">{formatMoney(row.bucket30_plus, currency)}</td>
                <td className="px-4 py-3 font-bold">{formatMoney(row.total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
