import { describe, expect, it } from 'vitest'
import { applyMemoryLocale, createMemoryI18n, translatedMessages } from '../lib/i18n/instance'
import { en, zh } from '../lib/i18n/messages'

describe('memory translation instances', () => {
  it('uses the request locale and preserves every typed dictionary entry', () => {
    const english = createMemoryI18n('en')
    const chinese = createMemoryI18n('zh-CN')
    expect(translatedMessages(english, 'en')).toEqual(en)
    expect(translatedMessages(chinese, 'zh-CN')).toEqual(zh)
    expect(english.language).toBe('en')
    expect(chinese.language).toBe('zh-CN')
  })

  it('keeps request instances isolated and translates against the root locale', () => {
    const english = createMemoryI18n('en')
    const chinese = createMemoryI18n('zh-CN')
    applyMemoryLocale(english, 'zh-CN')
    expect(english.language).toBe('zh-CN')
    expect(chinese.language).toBe('zh-CN')
    applyMemoryLocale(chinese, 'en')
    expect(chinese.language).toBe('en')
    expect(english.language).toBe('zh-CN')
    expect(translatedMessages(english, 'en').repositoryLabel).toBe(en.repositoryLabel)
  })
})
