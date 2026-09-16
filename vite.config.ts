import process from 'node:process'
import { cloudflare } from '@cloudflare/vite-plugin'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import vinext from 'vinext'
import { defineConfig } from 'vite'

// Source maps are uploaded only where an auth token exists (CI); local and fork
// builds skip the plugin entirely.
const authToken = process.env.SENTRY_AUTH_TOKEN
const release = process.env.SENTRY_RELEASE ?? ''

export default defineConfig({
  define: {
    // The Worker reports this release, and the upload below uses the same value.
    'process.env.SENTRY_RELEASE': JSON.stringify(release),
  },
  plugins: [
    {
      name: 'preserve-rsc-client-exports',
      enforce: 'post',
      // Apply after vinext's client treeshake defaults. This pinned toolchain
      // otherwise emits empty client-boundary chunks in production.
      configEnvironment(name) {
        if (name === 'client' || name === 'ssr')
          return { build: { rolldownOptions: { treeshake: false } } }
      },
    },
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: 'rsc',
        childEnvironments: ['ssr'],
      },
    }),
    ...(authToken === undefined
      ? []
      : [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken,
            release: { name: release === '' ? undefined : release },
            telemetry: false,
            sourcemaps: {
              // Client maps would otherwise be served to every visitor. Server
              // maps stay for Cloudflare's own `upload_source_maps`.
              filesToDeleteAfterUpload: ['./dist/client/**/*.map'],
            },
          }),
        ]),
  ],
  build: { sourcemap: authToken === undefined ? false : 'hidden' },
})
