/**
 * Set on `<html>` once the shell has hydrated. The server never renders it, so
 * browser tests can wait for this instead of retrying an interaction until it
 * appears to work, and SSR-only assertions can prove the boundary.
 */
export const FRONTEND_READY_ATTRIBUTE = 'data-frontend-ready'
