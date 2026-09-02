import globals from 'globals';

import base from './base.js';

/**
 * NestJS: decorator'lı sınıflarda base kuralların birkaçı yanlış alarm veriyor.
 * DI ve decorator metadata'sı derleyici tarafından üretiliyor.
 */
export default [
  ...base,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // Controller/Module dosyalarında sınıf decorator'ları parametre tiplerini
      // runtime'a taşıyor; explicit return type zorunluluğu burada gürültü yapıyor.
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      // Nest exception filter / interceptor imzaları unknown döndürebiliyor.
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];
