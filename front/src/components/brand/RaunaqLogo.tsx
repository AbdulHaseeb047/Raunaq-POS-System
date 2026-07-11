import { BRAND } from '@pos/shared';

import { RaunaqMark } from './RaunaqMark';

type RaunaqLogoProps = {
  variant?: 'full' | 'compact' | 'mark';
  /** dark = sidebar/hero; light = white cards */
  tone?: 'light' | 'dark';
  /** Sidebar collapsed — stacked mark + name only */
  collapsed?: boolean;
  /** Enables sidebar hover animations on mark + wordmark */
  interactive?: boolean;
  className?: string;
};

export function RaunaqLogo({
  variant = 'full',
  tone = 'dark',
  collapsed = false,
  interactive = false,
  className = '',
}: RaunaqLogoProps) {
  if (variant === 'mark') {
    return (
      <RaunaqMark
        size={36}
        tone={tone}
        className={`shrink-0 ${interactive ? 'sidebar-logo-mark' : ''} ${className}`}
      />
    );
  }

  if (variant === 'compact') {
    if (collapsed) {
      return (
        <div className={`flex w-full flex-col items-center gap-1 ${className}`}>
          <RaunaqMark
            size={28}
            tone={tone}
            className={`shrink-0 ${interactive ? 'sidebar-logo-mark' : ''}`}
          />
          <p
            className={`text-center text-[10px] font-bold leading-tight ${
              tone === 'dark' ? 'text-white' : 'text-brand-900'
            } ${interactive ? 'sidebar-logo-brand-name' : ''}`}
          >
            {BRAND.name}
          </p>
        </div>
      );
    }

    const rootClass = interactive
      ? `sidebar-logo group/logo flex min-w-0 cursor-default items-start gap-2 ${className}`
      : `flex min-w-0 items-start gap-2 ${className}`;

    return (
      <div className={rootClass}>
        <RaunaqMark
          size={38}
          tone={tone}
          className={`mt-0.5 shrink-0 transition-transform duration-300 ${interactive ? 'sidebar-logo-mark' : ''}`}
        />
        <RaunaqWordmark tone={tone} interactive={interactive} />
      </div>
    );
  }

  return (
    <img
      src={tone === 'dark' ? '/raunaq-logo-dark.png' : '/raunaq-logo-light.png'}
      alt={BRAND.productName}
      className={`w-auto object-contain ${className || 'h-56 max-w-[320px]'}`}
      draggable={false}
    />
  );
}

export function RaunaqWordmark({
  tone = 'dark',
  interactive = false,
  className = '',
}: {
  tone?: 'light' | 'dark';
  interactive?: boolean;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p
        className={`truncate text-[15px] font-bold leading-[1.35] tracking-wide ${
          tone === 'dark' ? 'text-white' : 'text-brand-900'
        } ${interactive ? 'sidebar-logo-name' : ''}`}
      >
        {BRAND.name}
      </p>
      <p
        className={`mt-2 truncate text-[8px] font-semibold uppercase tracking-[0.12em] ${
          tone === 'dark' ? 'text-brand-200/55' : 'text-brand-600/60'
        } ${interactive ? 'sidebar-logo-tagline' : ''}`}
      >
        {BRAND.tagline}
      </p>
    </div>
  );
}
