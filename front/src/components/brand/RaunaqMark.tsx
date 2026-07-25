/** Raunaq "R" mark — white body + mint chart inset (matches supplied reference). */
export function RaunaqMark({
  size = 40,
  tone = 'dark',
  className = '',
}: {
  size?: number;
  tone?: 'light' | 'dark';
  className?: string;
}) {
  if (tone === 'dark') {
    return (
      <img
        src="/raunaq-mark-reference.png"
        alt=""
        aria-hidden
        className={`shrink-0 object-contain ${className}`}
        style={{ height: size, width: 'auto' }}
        draggable={false}
      />
    );
  }

  const rFill = '#064e3b';
  const mintFill = '#10b981';
  const barFill = '#FFFFFF';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        fill={rFill}
        d="M14 10h18.5c9.2 0 15.5 5.8 15.5 14.8 0 6.2-3.2 10.8-8.5 13.2L46 54H36.5L28 42.5H20V54H14V10zm6 6v14.5h10.8c4.4 0 7-2.6 7-6.4 0-3.6-2.6-6.1-7-6.1H20z"
      />
      <path fill={mintFill} d="M20 22h16.5l7.5 9.5-7.5 9.5H20l5.5-9.5L20 22z" />
      <rect x="25.5" y="29" width="2.8" height="7.5" rx="0.6" fill={barFill} />
      <rect x="30.2" y="26.5" width="2.8" height="10" rx="0.6" fill={barFill} />
      <rect x="34.9" y="31" width="2.8" height="5.5" rx="0.6" fill={barFill} />
    </svg>
  );
}
