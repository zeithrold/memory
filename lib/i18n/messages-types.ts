import type { Locale } from '../../components/ui/ztd-me/types'
import { en } from './messages-en'
import { zh } from './messages-zh'

export type { Locale }
export type MessageKey = keyof typeof en
export type Messages = Record<MessageKey, string>

export function messages(locale: Locale): Messages {
  return locale === 'zh-CN' ? zh : en
}
