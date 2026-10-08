import type { Page } from '@playwright/test'

export const retainedStorage = {
  'ztd.home.v1': JSON.stringify({ mode: 'dark', palette: 'plum', locale: 'zh-CN' }),
  'showcase.clock.v1': JSON.stringify({ locale: 'zh-CN', palette: 'terracotta', clocks: ['retained'] }),
  'memory.draft.fixture': 'private draft retained',
  'memory.auth.fixture': 'private auth retained',
}

type StorageAccess = { operation: 'read' | 'write' | 'remove' | 'clear', key: string | null }
export type PreferenceProbe = {
  accesses: StorageAccess[]
  retained: () => Record<string, string | null>
}

function installPreferenceProbe(entries: Record<string, string>): void {
  const storage = localStorage
  const get: unknown = Reflect.get(Storage.prototype, 'getItem')
  const set: unknown = Reflect.get(Storage.prototype, 'setItem')
  const remove: unknown = Reflect.get(Storage.prototype, 'removeItem')
  const clear: unknown = Reflect.get(Storage.prototype, 'clear')
  if (typeof get !== 'function' || typeof set !== 'function'
    || typeof remove !== 'function' || typeof clear !== 'function') {
    throw new TypeError('Storage instrumentation requires the native methods.')
  }
  const read = (target: Storage, key: string): string | null => {
    const value: unknown = Reflect.apply(get, target, [key])
    if (value !== null && typeof value !== 'string') {
      throw new TypeError('Storage returned a value outside its native contract.')
    }
    return value
  }
  for (const [key, value] of Object.entries(entries)) {
    Reflect.apply(set, storage, [key, value])
  }
  const accesses: StorageAccess[] = []
  window.memoryPreferenceProbe = {
    accesses,
    retained: () => Object.fromEntries(Object.keys(entries).map(key => [
      key,
      read(storage, key),
    ])),
  }
  Storage.prototype.getItem = function (key) {
    if (this === storage) {
      accesses.push({ operation: 'read', key })
    }
    return read(this, key)
  }
  Storage.prototype.setItem = function (key, value) {
    if (this === storage) {
      accesses.push({ operation: 'write', key })
    }
    Reflect.apply(set, this, [key, value])
  }
  Storage.prototype.removeItem = function (key) {
    if (this === storage) {
      accesses.push({ operation: 'remove', key })
    }
    Reflect.apply(remove, this, [key])
  }
  Storage.prototype.clear = function () {
    if (this === storage) {
      accesses.push({ operation: 'clear', key: null })
    }
    Reflect.apply(clear, this, [])
  }
}

function installCookieProbe(): void {
  const cookieWrites: string[] = []
  window.memoryPreferenceCookieWrites = cookieWrites
  const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')
  if (descriptor?.get === undefined || descriptor.set === undefined) {
    throw new Error('Cookie instrumentation requires the native document descriptor.')
  }
  const readCookie = descriptor.get.bind(document)
  const writeCookie = descriptor.set.bind(document)
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => String(readCookie()),
    set: (value: string) => {
      cookieWrites.push(value)
      writeCookie(value)
    },
  })
}

export async function observePreferenceStorage(page: Page): Promise<void> {
  await page.addInitScript(installPreferenceProbe, retainedStorage)
  await page.addInitScript(installCookieProbe)
}
