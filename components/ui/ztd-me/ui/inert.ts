'use client'

export function inertBackground(node: HTMLDivElement | null): (() => void) | undefined {
  if (node === null) {
    return undefined
  }
  const owned = new Set<HTMLElement>()
  const body = node.ownerDocument.body
  function synchronize(): void {
    for (const item of owned) {
      if (item.dataset.ariaHidden !== 'true') {
        item.inert = false
        owned.delete(item)
      }
    }
    for (const item of body.querySelectorAll<HTMLElement>('[data-aria-hidden="true"]')) {
      if (!item.inert && !item.contains(node)) {
        item.inert = true
        owned.add(item)
      }
    }
  }
  const observer = new MutationObserver(synchronize)
  observer.observe(body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-aria-hidden'] })
  synchronize()
  return () => {
    observer.disconnect()
    for (const item of owned) {
      item.inert = false
    }
  }
}
