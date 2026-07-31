import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', '../standalone', '../hero3d.js', '../assets', 'node_modules', 'test-results', 'playwright-report'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    // Render-loop files.
    //
    // react-hooks/immutability exists to keep React Compiler's assumptions
    // safe: values handed to a hook should not be mutated afterwards. A
    // useFrame callback is deliberately outside React's rendering model — it
    // runs on the animation frame and its entire job is to mutate three.js
    // objects (positions, quaternions, material uniforms) in place. Allocating
    // fresh objects per frame instead is exactly the per-frame allocation the
    // performance budget forbids, so the rule is switched off here only, and
    // only for the files that drive the loop.
    files: [
      'src/three/**/*.{ts,tsx}',
      'src/hero/PartnerOrbitScene.tsx',
      'src/hero/usePointerParallax.ts',
      'src/hero/useHeroScroll.ts',
      'src/hero/PartnerOrbitHero.tsx',
    ],
    rules: {
      'react-hooks/immutability': 'off',
    },
  },
);
