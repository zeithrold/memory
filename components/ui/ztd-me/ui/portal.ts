'use client'

import { use } from 'react'
import { PreferenceContext } from '../context.js'

export function usePortalContainer(): HTMLElement | undefined {
  return use(PreferenceContext)?.portalContainer ?? undefined
}
export function useStyleNonce(): string | undefined {
  return use(PreferenceContext)?.styleNonce
}
