// Flat ESLint config for City3D. Scope: src/**/*.{ts,tsx} only.
// Uses @eslint/js recommended + typescript-eslint recommended, with a minimal
// set of rules relaxed to match the existing code style (comma-operator
// expression lines in coreScene, pragmatic `any` in export/browser glue).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-embed/**',
      'node_modules/**',
      'public/**',
      'tests/**',
      '*.config.ts',
      '*.config.js',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        addEventListener: 'readonly',
        removeEventListener: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Blob: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        ResizeObserver: 'readonly',
        matchMedia: 'readonly',
        HTMLElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        HTMLAnchorElement: 'readonly',
      },
    },
    rules: {
      // Existing code intentionally uses comma-operator statement lines
      // (e.g. coreScene) — do not fight that style.
      'no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      // Browser/export glue uses pragmatic `any` in a few places.
      '@typescript-eslint/no-explicit-any': 'off',
      // Allow intentionally-unused leading args / underscore convention.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // coreScene.ts is frozen production code (window.City3D embed API) that we
    // must not edit; it keeps one intentionally-retained local for future
    // dimming logic. Relax the rule for this file only rather than touching it.
    files: ['src/three/coreScene.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
);
