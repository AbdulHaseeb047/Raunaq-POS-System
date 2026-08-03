import type { DashboardLayout, DashboardWidgetId } from '@/types/api';

export const DASHBOARD_WIDGET_META: Array<{ id: DashboardWidgetId; label: string }> = [
  { id: 'kpis', label: 'KPI cards' },
  { id: 'trend', label: 'Sales trend' },
  { id: 'payments', label: 'Payment methods' },
  { id: 'topProducts', label: 'Top products' },
  { id: 'topCategories', label: 'Top categories' },
  { id: 'returns', label: 'Returns' },
  { id: 'lowStock', label: 'Low stock alerts' },
];

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = {
  widgets: DASHBOARD_WIDGET_META.map((w) => ({ id: w.id, visible: true })),
};

/** Merge saved layout with defaults so new widgets appear for older saves. */
export function resolveDashboardLayout(saved: DashboardLayout | null | undefined): DashboardLayout {
  if (!saved?.widgets?.length) return DEFAULT_DASHBOARD_LAYOUT;

  const seen = new Set<DashboardWidgetId>();
  const widgets: DashboardLayout['widgets'] = [];

  for (const w of saved.widgets) {
    if (!DASHBOARD_WIDGET_META.some((m) => m.id === w.id) || seen.has(w.id)) continue;
    seen.add(w.id);
    widgets.push({ id: w.id, visible: w.visible !== false });
  }

  for (const meta of DASHBOARD_WIDGET_META) {
    if (seen.has(meta.id)) continue;
    widgets.push({ id: meta.id, visible: true });
  }

  return { widgets };
}

export function widgetLabel(id: DashboardWidgetId): string {
  return DASHBOARD_WIDGET_META.find((m) => m.id === id)?.label ?? id;
}
