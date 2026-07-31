import type { ConsoleMessage, Page, Request } from '@playwright/test';
import type { HeroTelemetry } from '../../src/hero/heroTelemetry';

export const VIEWPORTS = {
  'phone-390': { width: 390, height: 844 },
  'phone-430': { width: 430, height: 932 },
  'tablet-768': { width: 768, height: 1024 },
  'laptop-1440': { width: 1440, height: 900 },
  'desktop-1920': { width: 1920, height: 1080 },
} as const;

export type ViewportName = keyof typeof VIEWPORTS;

export interface PageWatcher {
  errors: string[];
  failedRequests: string[];
}

/** Collects console errors and failed network requests for the page's lifetime. */
export function watchPage(page: Page): PageWatcher {
  const watcher: PageWatcher = { errors: [], failedRequests: [] };

  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') watcher.errors.push(message.text());
  });
  page.on('pageerror', (error: Error) => {
    watcher.errors.push(`pageerror: ${error.message}`);
  });
  page.on('requestfailed', (request: Request) => {
    // Ignore aborts caused by navigation teardown.
    const failure = request.failure()?.errorText ?? '';
    if (/ERR_ABORTED/.test(failure)) return;
    watcher.failedRequests.push(`${request.url()} (${failure})`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) watcher.failedRequests.push(`${response.url()} -> ${response.status()}`);
  });

  return watcher;
}

/** Waits until the scene has built and has drawn real geometry. */
export async function waitForHero(page: Page, timeout = 150_000): Promise<void> {
  await page.waitForFunction(
    () => {
      const api = window.__OVMG_HERO__;
      if (!api) return false;
      const state = api.getState();
      return state.ready && state.drawCalls > 0 && state.centralPresent && state.partners.length > 0;
    },
    undefined,
    { timeout },
  );
}

export async function heroState(page: Page): Promise<HeroTelemetry> {
  return page.evaluate(() => window.__OVMG_HERO__!.getState());
}

/** Advances real time and returns the telemetry afterwards. */
export async function sampleAfter(page: Page, ms: number): Promise<HeroTelemetry> {
  await page.waitForTimeout(ms);
  return heroState(page);
}

export function url(path = '/', params: Record<string, string | number> = {}): string {
  const query = new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  ).toString();
  return query ? `${path}?${query}` : path;
}
