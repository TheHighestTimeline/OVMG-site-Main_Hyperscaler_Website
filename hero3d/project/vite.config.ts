import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Development server + standalone static build.
 * Output lands in ../standalone/ and is served as its own page
 * (also used as the iframe / Framer embed target).
 */
export default defineConfig({
  base: './',
  plugins: [react()],
  // '' -> public assets resolve against the document base URL, which is correct
  // both for the dev server and for the standalone page.
  define: { __HERO_ASSET_BASE__: JSON.stringify('') },
  build: {
    outDir: '../standalone',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 1400,
  },
  server: {
    port: 5178,
    strictPort: true,
    host: '127.0.0.1',
  },
  preview: {
    port: 4178,
    strictPort: true,
    host: '127.0.0.1',
  },
});
