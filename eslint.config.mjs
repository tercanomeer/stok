import base from '@stokk/config/eslint/base';

export default [
  {
    ignores: ['apps/**', 'packages/**'],
  },
  ...base,
  {
    // e2e/ tamamen test kodudur: Playwright kökteki devDependency'dir, yardımcı
    // dosyalar (sürücü, vekil, API tohumlama) da spec'ler gibi ona erişebilir.
    files: ['e2e/**/*.ts'],
    rules: {
      'import-x/no-extraneous-dependencies': ['error', { devDependencies: true }],
      'import-x/no-default-export': 'off',
    },
  },
];
