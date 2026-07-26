import { Input } from '@/components/ui/Input';
import { prefersDesktopInput } from '@/lib/device';

export const RETURN_REASON_PRESETS = [
  'Damaged / defective',
  'Wrong item sold',
  'Customer changed mind',
  'Size / color wrong',
  'Exchange for different item',
] as const;

export const DELETE_SALE_REASON_PRESETS = [
  'Entered by mistake',
  'Duplicate bill',
  'Wrong customer / wrong amounts',
  'Payment failed / cancelled',
] as const;

const CUSTOM_KEY = '__custom__';

export type ReasonPickerValue = {
  /** Resolved reason string ready for the API (preset text or custom text). */
  reason: string;
  selectedKey: string;
  customText: string;
};

export function emptyReasonPicker(defaultPreset?: string): ReasonPickerValue {
  if (defaultPreset) {
    return { reason: defaultPreset, selectedKey: defaultPreset, customText: '' };
  }
  return { reason: '', selectedKey: '', customText: '' };
}

export function ReasonPicker({
  label,
  presets,
  value,
  onChange,
  customPlaceholder = 'Enter a custom reason…',
}: {
  label: string;
  presets: readonly string[];
  value: ReasonPickerValue;
  onChange: (next: ReasonPickerValue) => void;
  customPlaceholder?: string;
}) {
  const isCustom = value.selectedKey === CUSTOM_KEY;

  const selectPreset = (preset: string) => {
    onChange({ reason: preset, selectedKey: preset, customText: value.customText });
  };

  const selectCustom = () => {
    onChange({
      reason: value.customText.trim(),
      selectedKey: CUSTOM_KEY,
      customText: value.customText,
    });
  };

  const setCustomText = (text: string) => {
    onChange({
      reason: text.trim(),
      selectedKey: CUSTOM_KEY,
      customText: text,
    });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-text">{label}</p>
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => {
          const active = value.selectedKey === preset;
          return (
            <button
              key={preset}
              type="button"
              onClick={() => selectPreset(preset)}
              className={`rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition ${
                active
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-border bg-white text-text hover:border-brand-300 hover:bg-brand-50'
              }`}
            >
              {preset}
            </button>
          );
        })}
        <button
          type="button"
          onClick={selectCustom}
          className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
            isCustom
              ? 'border-brand-600 bg-brand-600 text-white'
              : 'border-border bg-white text-text hover:border-brand-300 hover:bg-brand-50'
          }`}
        >
          Custom
        </button>
      </div>
      {isCustom && (
        <Input
          placeholder={customPlaceholder}
          value={value.customText}
          onChange={(e) => setCustomText(e.target.value)}
          autoFocus={prefersDesktopInput()}
        />
      )}
    </div>
  );
}
