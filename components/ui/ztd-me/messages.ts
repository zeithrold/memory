import type { Locale, Mode, Palette } from './types.js'

interface ShellMessages {
  appearance: string
  mode: string
  palette: string
  language: string
  skip: string
  modes: Record<Mode, string>
  palettes: Record<Palette, string>
}
const en: ShellMessages = {
  appearance: 'Appearance',
  mode: 'Mode',
  palette: 'Palette',
  language: 'Language',
  skip: 'Skip to content',
  modes: { system: 'System', light: 'Light', dark: 'Dark' },
  palettes: {
    neutral: 'Neutral',
    terracotta: 'Terracotta',
    moss: 'Moss',
    ocean: 'Ocean',
    plum: 'Plum',
    graphite: 'Graphite',
  },
}
const zh: ShellMessages = {
  appearance: '外观',
  mode: '模式',
  palette: '配色',
  language: '语言',
  skip: '跳到内容',
  modes: { system: '跟随系统', light: '浅色', dark: '深色' },
  palettes: {
    neutral: '中性',
    terracotta: '暖陶',
    moss: '苔绿',
    ocean: '海蓝',
    plum: '莓紫',
    graphite: '石墨',
  },
}
export function shellMessages(locale: Locale): ShellMessages {
  return locale === 'zh-CN' ? zh : en
}
