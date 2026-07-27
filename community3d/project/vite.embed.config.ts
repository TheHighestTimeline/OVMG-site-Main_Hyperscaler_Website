import { defineConfig } from 'vite';
// Embed bundle: imperative window.City3D API used by the OVMG site (no React needed).
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist-embed', target: 'es2019', chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: 'src/embed.ts',
      output: { entryFileNames: 'city3d.js', chunkFileNames: 'chunk-[hash].js', assetFileNames: 'asset-[hash][extname]' },
    },
  },
});
