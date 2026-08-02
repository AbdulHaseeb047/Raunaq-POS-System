import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ReactNode } from 'react';

import type { DashboardSummary, DashboardWidgetId } from '@/types/api';

type KpiMetric = {
  id: string;
  label: string;
  value: number;
  changePct: number;
  format: 'currency' | 'number';
};

function formatMoney(value: number, currency: string) {
  return `${currency} ${value.toLocaleString('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function KpiCard({
  metric,
  currency,
  compareLabel,
}: {
  metric: KpiMetric;
  currency: string;
  compareLabel: string;
}) {
  const up = metric.changePct >= 0;
  const display =
    metric.format === 'currency'
      ? formatMoney(metric.value, currency)
      : metric.value.toLocaleString('en-PK');

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{metric.label}</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
        <p className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{display}</p>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
            up ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
          }`}
        >
          {up ? '↑' : '↓'} {Math.abs(metric.changePct).toFixed(1)}%
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-400">{compareLabel}</p>
    </div>
  );
}

function HourlyTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ payload: { revenue: number; transactions: number } }>;
  label?: string;
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-slate-800">{label}</p>
      <p className="mt-1 text-emerald-700">Revenue: {formatMoney(row.revenue, currency)}</p>
      <p className="text-slate-600">Transactions: {row.transactions}</p>
    </div>
  );
}

function MoneyTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; name?: string }>;
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-slate-800">{payload[0].name}</p>
      <p className="mt-1 text-emerald-700">
        {formatMoney(Number(payload[0].value ?? 0), currency)}
      </p>
    </div>
  );
}

const DEFAULT_CHART_ORDER: DashboardWidgetId[] = ['kpis', 'trend', 'payments', 'topProducts'];

export function SalesDashboard({
  data,
  currency = 'PKR',
  visibleIds,
}: {
  data: DashboardSummary;
  currency?: string;
  /** When set, only render these chart widgets (order preserved). */
  visibleIds?: DashboardWidgetId[];
}) {
  const order = (visibleIds ?? DEFAULT_CHART_ORDER).filter((id) =>
    DEFAULT_CHART_ORDER.includes(id),
  );

  const kpis: KpiMetric[] = [
    {
      id: 'revenue',
      label: 'Total Revenue',
      value: Number(data.todaySalesTotal) || 0,
      changePct: data.revenueChangePct ?? 0,
      format: 'currency',
    },
    {
      id: 'aov',
      label: 'Average Order Value',
      value: Number(data.averageOrderValue ?? 0) || 0,
      changePct: data.aovChangePct ?? 0,
      format: 'currency',
    },
    {
      id: 'transactions',
      label: 'Total Transactions',
      value: data.todayTransactionCount ?? 0,
      changePct: data.transactionChangePct ?? 0,
      format: 'number',
    },
  ];

  const hourlySales = data.hourlySales ?? [];
  const paymentMethods = data.paymentMethods ?? [];
  const topProducts = data.topProducts ?? [];
  const paymentTotal = paymentMethods.reduce((s, p) => s + p.value, 0);
  const hasHourly = hourlySales.some((h) => h.revenue > 0 || h.transactions > 0);
  const compareLabel = data.compareLabel ?? 'vs prior period';
  const isHourly = (data.chartMode ?? 'hourly') === 'hourly';

  const kpisNode = (
    <div key="kpis" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {kpis.map((kpi) => (
        <KpiCard key={kpi.id} metric={kpi} currency={currency} compareLabel={compareLabel} />
      ))}
    </div>
  );

  const trendNode = (
    <div key="trend" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-900">
          {isHourly ? 'Hourly sales trend' : 'Daily sales trend'}
        </h3>
        <p className="text-sm text-slate-500">
          {isHourly
            ? 'Revenue across store hours (8:00 AM – 10:00 PM)'
            : `Revenue by day (${data.from ?? ''} – ${data.to ?? ''})`}
        </p>
      </div>
      <div className="h-64 w-full sm:h-72">
        {!hasHourly ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            No sales recorded in this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={hourlySales} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="hourlyRevenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#059669" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#059669" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="hour"
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                width={40}
              />
              <Tooltip content={<HourlyTooltip currency={currency} />} />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#059669"
                strokeWidth={2.5}
                fill="url(#hourlyRevenueFill)"
                activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );

  const paymentsNode = (
    <div key="payments" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-900">Payment methods</h3>
        <p className="text-sm text-slate-500">Share of sales by tender type in this period</p>
      </div>
      {paymentMethods.length === 0 ? (
        <div className="flex h-52 items-center justify-center text-sm text-slate-500">
          No payments recorded in this period
        </div>
      ) : (
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
          <div className="h-52 w-full max-w-[220px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={paymentMethods}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="58%"
                  outerRadius="82%"
                  paddingAngle={3}
                  stroke="none"
                >
                  {paymentMethods.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [`${Number(value)}%`, 'Share']}
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="w-full flex-1 space-y-3">
            {paymentMethods.map((method) => {
              const pct = paymentTotal > 0 ? (method.value / paymentTotal) * 100 : 0;
              return (
                <li key={method.name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: method.color }}
                    />
                    <span className="truncate font-medium text-slate-700">{method.name}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                    {pct.toFixed(0)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );

  const topProductsNode = (
    <div
      key="topProducts"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-900">Top selling products</h3>
        <p className="text-sm text-slate-500">Top 5 items by revenue in this period</p>
      </div>
      <div className="h-64 w-full sm:h-72">
        {topProducts.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            No product sales in this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={topProducts}
              margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={150}
                tick={{ fill: '#334155', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<MoneyTooltip currency={currency} />} cursor={{ fill: '#f1f5f9' }} />
              <Bar dataKey="revenue" name="Revenue" radius={[0, 8, 8, 0]} barSize={18}>
                {topProducts.map((item) => (
                  <Cell key={item.name} fill="#059669" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );

  const byId: Record<string, ReactNode> = {
    kpis: kpisNode,
    trend: trendNode,
    payments: paymentsNode,
    topProducts: topProductsNode,
  };

  const nodes: ReactNode[] = [];
  for (let i = 0; i < order.length; i++) {
    const id = order[i]!;
    const next = order[i + 1];
    // Keep payments + top products side-by-side when adjacent.
    if (
      (id === 'payments' && next === 'topProducts') ||
      (id === 'topProducts' && next === 'payments')
    ) {
      nodes.push(
        <div key={`${id}-${next}`} className="grid gap-6 lg:grid-cols-2">
          {byId[id]}
          {byId[next]}
        </div>,
      );
      i++;
      continue;
    }
    nodes.push(byId[id]);
  }

  return <div className="space-y-6">{nodes}</div>;
}
