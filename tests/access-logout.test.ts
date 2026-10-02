import { describe, expect, it } from 'vitest'
import { accessLogoutUrl } from '../lib/access-logout'

describe('memory Access logout', () => {
  it.each([
    'https://team.cloudflareaccess.com',
    'https://team.cloudflareaccess.com/',
    'https://team.cloudflareaccess.com///',
  ])('keeps the Access endpoint and encoded return origin for %s', (teamDomain) => {
    const destination = new URL(accessLogoutUrl(teamDomain, 'https://memory.ztd.me'))
    expect(destination.origin).toBe('https://team.cloudflareaccess.com')
    expect(destination.pathname).toBe('/cdn-cgi/access/logout')
    expect(destination.searchParams.get('returnTo')).toBe('https://memory.ztd.me')
  })
  it('preserves the existing server-safe fallback', () => {
    expect(new URL(accessLogoutUrl('https://team.cloudflareaccess.com', '/')).searchParams.get('returnTo')).toBe('/')
  })
})
