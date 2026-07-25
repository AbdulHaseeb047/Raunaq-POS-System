import type { ButtonHTMLAttributes, ReactNode } from 'react';

const variants = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/20 active:bg-brand-800',
  secondary:
    'bg-white text-text border border-border hover:bg-brand-50 hover:border-brand-300 active:bg-brand-100',
  ghost: 'text-text-muted hover:bg-brand-50 hover:text-brand-700',
  danger: 'bg-danger text-white hover:bg-rose-700 shadow-sm',
  accent: 'bg-accent-500 text-white hover:bg-accent-600 shadow-sm shadow-accent-500/25',
} as const;

const sizes = {
  sm: 'px-2.5 py-1.5 text-xs min-h-[32px]',
  md: 'px-3.5 py-2 text-sm min-h-[38px]',
  lg: 'px-5 py-2.5 text-sm min-h-[42px]',
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}
