import globals from 'globals';

import base from './base.js';

/** Sunucu tarafı paketler: api, db. Tarayıcı global'leri yok. */
export default [
  ...base,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
