import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * Embed build: a single ES module dropped into hero3d/hero3d.js that the
 * existing static site loads with <script type="module">. Public assets
 * (textures, partner logos) are copied alongside it and resolved at runtime
 * relative to import.meta.url, so the bundle works from /hero3d/ on the site
 * and from the standalone page without rewriting paths.
 */
export default defineConfig({
  plugins: [react()],
  // '@module' -> public assets resolve against import.meta.url, so the bundle
  // finds /hero3d/textures/... no matter which page on the site loads it.
  //
  // NODE_ENV must be set explicitly: library mode does not substitute it, and
  // without it React's development build ships to production — larger and
  // measurably slower.
  define: {
    __HERO_ASSET_BASE__: JSON.stringify('@module'),
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: '..',
    emptyOutDir: false,
    target: 'es2020',
    sourcemap: false,
    cssCodeSplit: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/embed.ts'),
      formats: ['es'],
      fileName: () => 'hero3d.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        inlineDynamicImports: true,
      },
    },
  },
});
