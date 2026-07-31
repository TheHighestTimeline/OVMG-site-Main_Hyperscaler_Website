import { defineConfig, devices } from '@playwright/test';

/**
 * WebGL in headless Chromium runs on SwiftShader. That is a software
 * rasteriser, so absolute frame rates here are a floor, not a benchmark —
 * performance numbers are measured separately against a real GPU. What these
 * tests prove is correctness: the scene builds, animates, occludes, responds
 * and disposes.
 */
const GL_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  '--disable-lcd-text',
];

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5178',
    launchOptions: { args: GL_ARGS },
    trace: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: 'npx vite --port 5178 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:5178',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
