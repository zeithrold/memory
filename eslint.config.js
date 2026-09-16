import antfu from '@antfu/eslint-config'

export default antfu({
  react: true,
  typescript: { tsconfigPath: 'tsconfig.json' },
  ignores: ['dist/**', '.wrangler/**', '.vinext/**', 'pnpm-lock.yaml', 'next-env.d.ts'],
  rules: {
    'no-console': ['error', { allow: ['warn', 'error'] }],
  },
}, {
  files: ['**/*.ts', '**/*.tsx'],
  rules: {
    'ts/no-explicit-any': 'error',
    'ts/no-floating-promises': 'error',
    'ts/no-misused-promises': 'error',
    'ts/no-unsafe-assignment': 'error',
    'ts/no-unsafe-argument': 'error',
    'ts/no-unsafe-call': 'error',
    'ts/no-unsafe-member-access': 'error',
    'ts/no-unsafe-return': 'error',
  },
}, {
  files: ['app/**/*.tsx'],
  rules: { 'react-refresh/only-export-components': ['error', { allowExportNames: ['metadata', 'dynamic', 'generateMetadata', 'generateStaticParams'] }] },
}, {
  files: ['components/ui/*.tsx'],
  rules: { 'react-refresh/only-export-components': ['error', { allowExportNames: ['buttonVariants', 'badgeVariants'] }] },
})
