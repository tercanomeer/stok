import react from '@stokk/config/eslint/react';

export default [
  { ignores: ['dist/**', 'dist-electron/**', 'release/**'] },
  ...react,
  {
    // electron paketi devDependency olmak zorunda: electron-builder onu runtime olarak
    // kendisi paketliyor, dependencies'e alınırsa installer'a ikinci kez giriyor.
    files: ['electron/**/*.ts', '*.config.mts'],
    rules: {
      'import-x/no-extraneous-dependencies': ['error', { devDependencies: true }],
    },
  },
];
