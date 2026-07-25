import { BRAND } from '@pos/shared';

import { RaunaqMark } from './RaunaqMark';

export function RaunaqLogo({
  tone = 'dark',
  className = '',
}: {
  tone?: 'light' | 'dark';
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 items-center gap-1.5 ${className}`}>
      <RaunaqMark size={34} tone={tone} className="shrink-0" />
      <div className="min-w-0 leading-none">
        <p
          className={`truncate text-[14px] font-bold ${tone === 'dark' ? 'text-white' : 'text-text'}`}
        >
          {BRAND.name}
        </p>
        <p
          className={`mt-0.5 truncate text-[9px] font-semibold uppercase tracking-[0.18em] ${
            tone === 'dark' ? 'text-brand-200' : 'text-brand-600'
          }`}
        >
          {BRAND.tagline}
        </p>
      </div>
    </div>
  );
}

export function RaunaqLogoFull({
  tone = 'light',
  className = '',
}: {
  tone?: 'light' | 'dark';
  className?: string;
}) {
  return (
    <img
      src={tone === 'dark' ? '/raunaq-logo-dark.png' : '/raunaq-logo-light.png'}
      alt={BRAND.productName}
      className={`w-auto object-contain ${className || 'h-48 max-w-[280px]'}`}
      draggable={false}
    />
  );
}
