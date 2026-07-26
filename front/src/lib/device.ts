/** True when the device likely has a physical keyboard / fine pointer (desktop). */
export function prefersDesktopInput(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.matchMedia('(pointer: fine) and (hover: hover)').matches;
  } catch {
    return true;
  }
}

/** Avoid focusing inputs on touch phones — opens the on-screen keyboard and covers the UI. */
export function safeFocus(el: HTMLElement | null | undefined, opts?: { force?: boolean }): void {
  if (!el) return;
  if (!opts?.force && !prefersDesktopInput()) return;
  el.focus({ preventScroll: true });
}
