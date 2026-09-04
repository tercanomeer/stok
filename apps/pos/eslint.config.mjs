import react from '@stokk/config/eslint/react';

export default [
  { ignores: ['dist/**', 'dist-electron/**', 'release/**'] },
  ...react,
  {
    // İki grup da devDependency olmak ZORUNDA:
    //  - electron: electron-builder onu runtime olarak kendisi paketliyor,
    //    dependencies'e alınırsa installer'a ikinci kez giriyor.
    //  - renderer bağımlılıkları (react, lucide-react, @stokk/ui): Vite bunları
    //    `dist/` içine bundle ediyor; dependencies'te kalırlarsa electron-builder
    //    node_modules'ü de pakete koyup kuruluma ~8400 gereksiz dosya ekliyor.
    files: ['electron/**/*.ts', 'src/**/*.{ts,tsx}', '*.config.mts'],
    rules: {
      'import-x/no-extraneous-dependencies': ['error', { devDependencies: true }],
    },
  },
];
