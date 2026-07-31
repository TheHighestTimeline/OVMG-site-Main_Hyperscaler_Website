/**
 * embed.ts — the entry point for the static-site bundle.
 *
 * Built to hero3d/hero3d.js. The host page provides a mount element; every
 * option is a data-attribute or an argument, so the site never has to import
 * React or know anything about three.js.
 *
 *   <div id="hero3d-root" data-hero-height="100%" data-hero-layer="always-front"></div>
 *   <script type="module" src="/hero3d/hero3d.js"></script>
 *
 * Auto-mounts into #hero3d-root when present; mountPartnerOrbitHero() is
 * exported for explicit control.
 */

import { createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PartnerOrbitHero, type PartnerOrbitHeroProps } from './hero/PartnerOrbitHero';
import type { BackgroundMode, LayoutMode, LogoLayerMode, QualityTier } from './hero/heroConfig';

export interface MountOptions extends Partial<PartnerOrbitHeroProps> {
  strict?: boolean;
}

export interface HeroHandle {
  unmount(): void;
  element: HTMLElement;
}

const mounted = new WeakMap<HTMLElement, Root>();

function readOptions(element: HTMLElement): Partial<PartnerOrbitHeroProps> {
  const data = element.dataset;
  const options: Partial<PartnerOrbitHeroProps> = {};
  if (data.heroHeight) options.height = data.heroHeight;
  if (data.heroMinHeight) options.minHeight = data.heroMinHeight;
  if (data.heroBackground) options.background = data.heroBackground as BackgroundMode;
  if (data.heroLayout) options.layout = data.heroLayout as LayoutMode;
  if (data.heroQuality) options.quality = data.heroQuality as QualityTier | 'auto';
  if (data.heroLayer) options.logoLayer = data.heroLayer as LogoLayerMode;
  if (data.heroPointer !== undefined) options.pointerResponse = Number(data.heroPointer);
  if (data.heroScroll !== undefined) options.scrollResponse = Number(data.heroScroll);
  if (data.heroMotion !== undefined) options.motionIntensity = Number(data.heroMotion);
  return options;
}

export function mountPartnerOrbitHero(target: HTMLElement | string, options: MountOptions = {}): HeroHandle | null {
  const element = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
  if (!element) {
    console.warn('[ovmg-hero] mount target not found:', target);
    return null;
  }
  if (mounted.has(element)) mounted.get(element)!.unmount();

  const { strict = false, ...props } = options;
  const merged = { ...readOptions(element), ...props };
  const root = createRoot(element);
  const tree = createElement(PartnerOrbitHero, merged);
  root.render(strict ? createElement(StrictMode, null, tree) : tree);
  mounted.set(element, root);

  return {
    element,
    unmount() {
      root.unmount();
      mounted.delete(element);
    },
  };
}

function autoMount() {
  const element = document.getElementById('hero3d-root');
  if (element) mountPartnerOrbitHero(element);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount, { once: true });
  } else {
    autoMount();
  }
}

export { PartnerOrbitHero };
export { PARTNERS } from './hero/partnerManifest';
export type { PartnerDefinition } from './hero/partnerManifest';
