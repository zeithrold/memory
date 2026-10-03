import type { Locale } from './types.js'

function supportedLanguage(tag: string): Locale | null {
  const language = tag.trim().toLowerCase()
  if (language === 'en' || language.startsWith('en-')) {
    return 'en'
  }
  if (language === 'zh' || language === 'zh-cn' || language === 'zh-hans' || language.startsWith('zh-hans-')) {
    return 'zh-CN'
  }
  return null
}
function languageCandidate(part: string, order: number): { locale: Locale | null, quality: number, order: number } {
  const [tag = '', ...parameters] = part.split(';')
  const qualityText = parameters.find(parameter => parameter.trim().startsWith('q='))?.trim().slice(2)
  const quality = qualityText === undefined ? 1 : Number(qualityText)
  return { locale: supportedLanguage(tag), quality, order }
}
export function negotiateLocale(acceptLanguage = ''): Locale {
  const candidates = acceptLanguage.split(',').map(languageCandidate).filter(candidate => (
    candidate.locale !== null && Number.isFinite(candidate.quality) && candidate.quality > 0 && candidate.quality <= 1
  ))
  candidates.sort((a, b) => b.quality === a.quality ? a.order - b.order : b.quality - a.quality)
  return candidates[0]?.locale ?? 'en'
}
