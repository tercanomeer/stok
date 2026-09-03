import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importX from 'eslint-plugin-import-x';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Tüm Stokk paketlerinin ortak ESLint kuralları.
 * CLAUDE.md "Değişmez kurallar" bölümündeki TypeScript maddeleri burada zorlanır.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-electron/**',
      '**/build/**',
      '**/out/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/generated/**',
      '**/*.config.js',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,

  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: process.cwd(),
      },
    },

    rules: {
      // --- CLAUDE.md: `any` yasak, mecbursan unknown + type guard ---
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',

      // --- CLAUDE.md: interface > type ---
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],

      // --- CLAUDE.md: public API'lerde return type explicit ---
      '@typescript-eslint/explicit-module-boundary-types': 'error',

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      // --- CLAUDE.md: import sırası external → @stokk/* → relative ---
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
          pathGroups: [{ pattern: '@stokk/**', group: 'internal', position: 'before' }],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      // Paket sınırı emniyet ağı: package.json'da deklare edilmemiş import yasak.
      // includeTypes olmadan `import type` kontrolden muaf kalıyor — paylaşılan
      // tiplerin (@stokk/types) çoğu import'u tip-only olduğu için bu şart.
      'import-x/no-extraneous-dependencies': [
        'error',
        {
          includeTypes: true,
          devDependencies: [
            '**/*.spec.ts',
            '**/*.spec.tsx',
            '**/*.test.ts',
            '**/*.test.tsx',
            '**/*.config.*',
            '**/*.setup.ts',
            '**/test/**',
          ],
        },
      ],
      // Paket sınırını relative yolla aşmak (../../packages/ui/src/index) hem
      // exports haritasını hem pnpm izolasyonunu bypass ediyor.
      'import-x/no-relative-packages': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/packages/*/src/**', '**/apps/*/src/**'],
              message:
                "Paket sınırını relative yolla aşma. Paket adıyla import et (@stokk/...) ve package.json dependencies'e ekle.",
            },
          ],
        },
      ],
      'import-x/no-cycle': ['error', { maxDepth: 4 }],
      'import-x/no-default-export': 'error',

      // --- Genel ---
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-restricted-syntax': [
        'error',
        {
          // Para hesabında float yasak — CLAUDE.md
          selector: "NewExpression[callee.name='Number']",
          message: 'Para hesabında Number kullanma; Decimal veya string kullan.',
        },
      ],
    },
  },

  // eslint.config.mjs ve benzeri düz JS dosyaları TS programına dahil değil;
  // type-aware kurallar burada kapatılır (lint-staged repo kökünden çalışırken
  // projectService bu dosyaları bulamıyor).
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
  },

  // Config ve test dosyalarında default export ve devDependency serbest
  {
    files: [
      '**/*.config.{ts,mts,js,mjs}',
      '**/*.spec.{ts,tsx}',
      '**/*.test.{ts,tsx}',
      '**/*.setup.ts',
      '**/test/**',
    ],
    rules: {
      'import-x/no-default-export': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },

  prettier,
);
