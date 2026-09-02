import node from '@stokk/config/eslint/node';

export default [
  { ignores: ['src/generated/**'] },
  ...node,
  {
    // prisma/ altındakiler geliştirme ve dağıtım script'leri, ürün kodu değil;
    // devDependency kullanmaları normal.
    files: ['prisma/**/*.ts'],
    rules: {
      'import-x/no-extraneous-dependencies': ['error', { devDependencies: true }],
    },
  },
];
