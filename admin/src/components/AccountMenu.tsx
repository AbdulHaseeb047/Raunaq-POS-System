import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@/lib/auth';

const POS_URL = import.meta.env.VITE_POS_URL ?? 'http://localhost:5173';

export function AccountMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const initials = user?.fullName
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const signOut = async () => {
    setOpen(false);
    try {
      await logout();
    } finally {
      navigate('/login', { replace: true });
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm shadow-sm transition hover:bg-slate-50"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white">
          {initials}
        </span>
        <span className="hidden max-w-[140px] truncate font-medium text-slate-800 sm:block">
          {user?.fullName}
        </span>
        <svg
          className={`h-4 w-4 text-slate-400 transition ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-slate-900">{user?.fullName}</p>
            <p className="truncate text-xs text-slate-500">{user?.email}</p>
            <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-indigo-600">
              Super Admin
            </p>
          </div>
          <button
            type="button"
            role="menuitem"
            className="flex w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => {
              setOpen(false);
              navigate('/account/password');
            }}
          >
            Change password
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
          <div className="my-1 border-t border-slate-100" />
          <a
            href={POS_URL}
            role="menuitem"
            className="block px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50"
            onClick={() => setOpen(false)}
          >
            Open POS app →
          </a>
        </div>
      )}
    </div>
  );
}
