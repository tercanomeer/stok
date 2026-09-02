import node from '@stokk/config/eslint/node';

export default [
  { ignores: ['src/generated/**'] },
  ...node,
  {
    // prisma/ ve scripts/ altındakiler geliştirme ve dağıtım script'leri, ürün kodu değil;
    // devDependency kullanmaları normal.
    files: ['prisma/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      'import-x/no-extraneous-dependencies': ['error', { devDependencies: true }],
    },
  },
];
