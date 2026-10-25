import process from 'node:process'

/**
 * The preview and configured-session suites serve their built Worker on a local
 * port. Both the Playwright webServer and the specs that seed cookies or assert
 * origin-scoped URLs must agree, so the origins are defined once here and can be
 * moved off the default ports when another checkout already uses them.
 */
export const previewOrigin = `http://localhost:${process.env.MEMORY_E2E_PORT ?? '3100'}`
export const configuredOrigin = `http://localhost:${process.env.MEMORY_E2E_MOCK_PORT ?? '3101'}`
