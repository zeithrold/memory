/** Access logout remains an account action owned by Memory. */
export function accessLogoutUrl(teamDomain: string, returnTo: string): string {
  return `${teamDomain.replace(/\/+$/, '')}/cdn-cgi/access/logout?returnTo=${encodeURIComponent(returnTo)}`
}
