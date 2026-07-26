import { useId, useState, type InputHTMLAttributes } from 'react';

import { IconEye, IconEyeOff } from '@/components/icons';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({
  label,
  error,
  hint,
  className = '',
  id,
  type = 'text',
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : generatedId);
  const isPassword = type === 'password';
  const [showPassword, setShowPassword] = useState(false);
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-text">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={inputId}
          type={inputType}
          className={`w-full rounded-lg border bg-white px-2.5 py-1.5 text-[13px] text-text placeholder:text-text-muted/60 transition-colors min-h-[34px] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 ${
            isPassword ? 'pr-11' : ''
          } ${error ? 'border-danger' : 'border-border'} ${className}`}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 cursor-pointer items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-medium text-text-muted hover:bg-brand-50 hover:text-brand-700"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            title={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
            <span className="hidden sm:inline">{showPassword ? 'Hide' : 'Show'}</span>
          </button>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {hint && !error && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  );
}
