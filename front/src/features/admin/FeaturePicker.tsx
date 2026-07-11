import { useMemo } from 'react';
import type { FeatureDefinition } from '@pos/shared';
import { groupFeaturesByModule } from '@pos/shared';

type FeaturePickerProps = {
  features: FeatureDefinition[];
  selected: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
  /** Minimum features that must stay selected (default 0). Use 1 for tenant plans. */
  minFeatures?: number;
};

const MODULE_LABELS: Record<string, string> = {
  billing: 'Billing & Sales',
  inventory: 'Inventory',
  customers: 'Customers & Udhaar',
  reports: 'Reports',
  users: 'Staff',
  settings: 'Settings',
  multi_branch: 'Multi-Branch',
};

export function FeaturePicker({ features, selected, onChange, disabled, minFeatures = 0 }: FeaturePickerProps) {
  const grouped = useMemo(() => groupFeaturesByModule(features), [features]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggle = (key: string) => {
    if (disabled) return;
    if (selectedSet.has(key) && selected.length <= minFeatures) return;
    onChange(
      selectedSet.has(key) ? selected.filter((k) => k !== key) : [...selected, key],
    );
  };

  const selectAll = () => onChange(features.map((f) => f.key));
  const clearAll = () => {
    if (minFeatures > 0) return;
    onChange([]);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Enabled features ({selected.length}/{features.length})
          {minFeatures > 0 && <span className="normal-case font-normal"> · at least {minFeatures} required</span>}
        </p>
        {!disabled && (
          <div className="flex gap-2 text-xs">
            <button type="button" className="font-medium text-brand-700 hover:underline" onClick={selectAll}>
              Select all
            </button>
            {minFeatures === 0 && (
              <>
                <span className="text-text-muted">·</span>
                <button type="button" className="font-medium text-text-muted hover:underline" onClick={clearAll}>
                  Clear
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="max-h-64 space-y-4 overflow-y-auto rounded-xl border border-border bg-surface-muted/50 p-3">
        {Object.entries(grouped).map(([module, items]) => (
          <div key={module}>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-brand-700">
              {MODULE_LABELS[module] ?? module}
            </p>
            <div className="space-y-1">
              {items.map((f) => (
                <label
                  key={f.key}
                  className={`flex cursor-pointer gap-2 rounded-lg px-2 py-2 transition hover:bg-surface ${
                    disabled ? 'cursor-not-allowed opacity-60' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={selectedSet.has(f.key)}
                    disabled={disabled || (selectedSet.has(f.key) && selected.length <= minFeatures)}
                    onChange={() => toggle(f.key)}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-text">{f.label}</span>
                    <span className="block text-xs text-text-muted">{f.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
