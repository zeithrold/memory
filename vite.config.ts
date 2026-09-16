import { cloudflare } from '@cloudflare/vite-plugin'
import vinext from 'vinext'
import { defineConfig } from 'vite'

export default defineConfig({
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
  ],
})
