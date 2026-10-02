import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createApi } from '../components/api-client'
import RouteError from '../components/route-error'
import { WorkspaceContext } from '../components/workspace-context'
import { messages } from '../lib/i18n/messages'

describe('workspace route recovery translations', () => {
  it.each([
    [
      'en',
      'This page could not be loaded.',
      'Try again',
    ],
    [
      'zh-CN',
      '无法加载此页面。',
      '重试',
    ],
  ] as const)('renders %s recovery copy from the workspace locale', (locale, description, retry) => {
    const t = messages(locale)
    const value = { locale, t, authState: 'unconfigured' as const, api: createApi('unconfigured', t) }
    const html = renderToStaticMarkup(createElement(WorkspaceContext, { value }, createElement(RouteError, {
      error: new Error('Synthetic rendering failure'),
      reset: () => {},
    })))
    expect(html).toContain(description)
    expect(html).toContain(retry)
    expect(html).toContain('role="alert"')
  })
})
