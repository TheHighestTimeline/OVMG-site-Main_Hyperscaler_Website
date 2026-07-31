import { useEffect, useState } from 'react';

function systemPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Tracks prefers-reduced-motion live, so toggling the OS setting (or a
 * Playwright emulation) takes effect without a reload.
 *
 * `force` overrides the system value for the debug panel. It is applied during
 * render rather than pushed into state, so an override never costs an extra
 * render pass.
 */
export function useReducedMotion(force?: boolean): boolean {
  const [system, setSystem] = useState(systemPrefersReducedMotion);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setSystem(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return force ?? system;
}
