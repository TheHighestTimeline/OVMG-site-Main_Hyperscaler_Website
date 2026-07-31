/**
 * usePointerParallax.ts — writes a normalised pointer position into the shared
 * runtime object. Never sets React state: the render loop reads the runtime.
 *
 * Pointer input is ignored entirely on coarse-pointer devices (where there is
 * no hover position to speak of) and under reduced motion.
 */

import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { HeroRuntime } from './heroRuntime';

export interface PointerParallaxOptions {
  enabled: boolean;
  /** Falls back to the window when the element ref is empty. */
  element: RefObject<HTMLElement | null>;
  runtime: HeroRuntime;
}

export function usePointerParallax({ enabled, element, runtime }: PointerParallaxOptions): void {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      runtime.pointerTargetX = 0;
      runtime.pointerTargetY = 0;
      return;
    }

    const isCoarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    if (isCoarse) {
      runtime.pointerTargetX = 0;
      runtime.pointerTargetY = 0;
      return;
    }

    const onPointerMove = (event: PointerEvent) => {
      const host = element.current;
      const rect = host ? host.getBoundingClientRect() : null;
      const width = rect?.width || window.innerWidth;
      const height = rect?.height || window.innerHeight;
      const left = rect?.left ?? 0;
      const top = rect?.top ?? 0;
      const x = ((event.clientX - left) / width) * 2 - 1;
      const y = ((event.clientY - top) / height) * 2 - 1;
      runtime.pointerTargetX = Math.max(-1.6, Math.min(1.6, x));
      runtime.pointerTargetY = Math.max(-1.6, Math.min(1.6, y));
    };

    const onPointerLeave = () => {
      runtime.pointerTargetX = 0;
      runtime.pointerTargetY = 0;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave, { passive: true });
    window.addEventListener('blur', onPointerLeave);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('blur', onPointerLeave);
      runtime.pointerTargetX = 0;
      runtime.pointerTargetY = 0;
    };
  }, [enabled, element, runtime]);
}
