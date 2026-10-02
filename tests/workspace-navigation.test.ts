import { describe, expect, it } from 'vitest'
import { isWorkspaceRouteActive, workspaceNavigation } from '../components/workspace-navigation-model'

describe('memory business navigation', () => {
  it.each([
    ['/memories', 'memories'],
    ['/memories/11111111-1111-4111-8111-111111111111', 'memories'],
    ['/catalog', 'catalog'],
    ['/catalog/22222222-2222-4222-8222-222222222222', 'catalog'],
    ['/tokens', 'tokens'],
    ['/usage', 'usage'],
    ['/connect', 'connect'],
  ])('identifies the active section for %s', (pathname, id) => {
    expect(workspaceNavigation.filter(item => isWorkspaceRouteActive(item, pathname)).map(item => item.id)).toEqual([
      id,
    ])
  })
  it.each([
    '/memories-archive',
    '/catalogue',
    '/errors/version-conflict',
  ])('does not mark an unrelated route active: %s', (pathname) => {
    expect(workspaceNavigation.some(item => isWorkspaceRouteActive(item, pathname))).toBe(false)
  })
})
