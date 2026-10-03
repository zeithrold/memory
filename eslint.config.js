import config from '@ztd-me/eslint'

export default config({
  react: { framework: 'vinext' },
  test: true,
  typescript: { tsconfigPath: 'tsconfig.json' },
  ignores: [
    'dist/**',
    '.wrangler/**',
    '.vinext/**',
    'pnpm-lock.yaml',
    'next-env.d.ts',
  ],
  rules: {
    'no-console': [
      'error',
      { allow: ['warn', 'error'] },
    ],
  },
}, {
  files: ['**/*.ts', '**/*.tsx'],
  // Virtual examples retain Markdown/React/syntax checks, without app type services.
  ignores: ['**/*.md/**'],
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
})
