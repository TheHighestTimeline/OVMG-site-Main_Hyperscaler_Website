/**
 * useHeroScroll.ts — scroll progress through the hero, via GSAP ScrollTrigger.
 *
 * The page keeps its own scrolling: nothing here pins, scrubs or hijacks. The
 * hook only observes how far the hero has travelled out of view and writes a
 * 0..1 scalar into the runtime. It also drives the visibility pause, so a hero
 * scrolled well past no longer costs frames.
 */

import { useEffect } from 'react';
import type { RefObject } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { HeroRuntime } from './heroRuntime';

let registered = false;

export interface HeroScrollOptions {
  enabled: boolean;
  element: RefObject<HTMLElement | null>;
  runtime: HeroRuntime;
  onVisibilityChange?: (visible: boolean) => void;
}

export function useHeroScroll({ enabled, element, runtime, onVisibilityChange }: HeroScrollOptions): void {
  useEffect(() => {
    const host = element.current;
    if (typeof window === 'undefined' || !host) return;

    if (!registered) {
      gsap.registerPlugin(ScrollTrigger);
      registered = true;
    }

    // Pause work when the hero is nowhere near the viewport, regardless of
    // whether scroll response itself is enabled.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const visible = entry.isIntersecting;
          runtime.paused = !visible || document.hidden;
          onVisibilityChange?.(visible);
        }
      },
      { rootMargin: '120px 0px 120px 0px', threshold: 0 },
    );
    observer.observe(host);

    const onDocumentVisibility = () => {
      if (document.hidden) runtime.paused = true;
    };
    document.addEventListener('visibilitychange', onDocumentVisibility);

    let trigger: ScrollTrigger | null = null;
    if (enabled) {
      trigger = ScrollTrigger.create({
        trigger: host,
        start: 'top top',
        end: 'bottom top',
        onUpdate: (self) => {
          runtime.scrollTarget = self.progress;
        },
        onRefresh: (self) => {
          runtime.scrollTarget = self.progress;
        },
      });
    } else {
      runtime.scrollTarget = 0;
      runtime.scroll = 0;
    }

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onDocumentVisibility);
      trigger?.kill();
      runtime.scrollTarget = 0;
    };
  }, [enabled, element, runtime, onVisibilityChange]);
}
