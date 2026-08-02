import { Input } from '@/components/ui/Input';
import { DATE_RANGE_BUTTONS, type DateRangeKey } from '@/lib/date-range';

type Props = {
  range: DateRangeKey;
  onRangeChange: (range: DateRangeKey) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
  from: string;
  to: string;
  className?: string;
};

export function DateRangeFilter({
  range,
  onRangeChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
  from,
  to,
  className = '',
}: Props) {
  return (
    <div
      className={`mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between ${className}`}
    >
      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1">
        {DATE_RANGE_BUTTONS.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => onRangeChange(b.key)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              range === b.key
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-text-muted hover:bg-surface-muted hover:text-text'
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>
      {range === 'custom' ? (
        <div className="flex flex-wrap gap-2">
          <Input
            label="From"
            type="date"
            value={customFrom}
            onChange={(e) => onCustomFromChange(e.target.value)}
            className="max-w-[160px]"
          />
          <Input
            label="To"
            type="date"
            value={customTo}
            onChange={(e) => onCustomToChange(e.target.value)}
            className="max-w-[160px]"
          />
        </div>
      ) : (
        <p className="text-sm text-text-muted">Showing {from === to ? from : `${from} → ${to}`}</p>
      )}
    </div>
  );
}
