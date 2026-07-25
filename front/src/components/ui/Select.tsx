import type { SelectHTMLAttributes } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: Array<{ value: string; label: string }>;
}

export function Select({ label, options, className = '', id, ...props }: SelectProps) {
  const selectId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={selectId} className="block text-xs font-medium text-text">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`w-full cursor-pointer rounded-xl border border-border bg-white px-3 py-2 text-sm text-text min-h-[38px] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed ${className}`}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
