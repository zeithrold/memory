import { en } from './messages-en'
import { zh } from './messages-zh'

export type Messages = { [K in keyof typeof en]: string }

export type Locale = 'en' | 'zh-CN'

export function messages(locale: Locale): Messages {
  return locale === 'zh-CN' ? zh : en
}
