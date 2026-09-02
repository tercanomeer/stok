import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

import base from './base.js';

/** React tüketicileri: @stokk/ui, apps/web, apps/pos renderer. */
export default [
  ...base,
  reactHooks.configs.flat['recommended-latest'],
  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      // React component dosyalarında default export gerekli (Next.js page/layout).
      'import-x/no-default-export': 'off',
    },
  },
];
