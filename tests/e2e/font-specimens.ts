import type { CDPSession, Page } from '@playwright/test'
import { z } from 'zod'

const nodeSchema = z.object({ nodeId: z.number() })
const fontsSchema = z.object({ fonts: z.array(z.object({
  familyName: z.string(),
  isCustomFont: z.boolean(),
  glyphCount: z.number(),
})) })

export async function renderedFonts(
  session: CDPSession,
  selector: string,
): Promise<z.infer<typeof fontsSchema>['fonts']> {
  const document: unknown = await session.send('DOM.getDocument')
  const { root } = z.object({ root: nodeSchema }).parse(document)
  const node: unknown = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector })
  const { nodeId } = nodeSchema.parse(node)
  const result: unknown = await session.send('CSS.getPlatformFontsForNode', { nodeId })
  return fontsSchema.parse(result).fonts
}

// Synthetic test-only content uses the real built Memory stylesheet and provider.
// It adds no production route, font proxy, font binary or application preference.
const textSamples = [
  { id: 'font-en', lang: 'en', text: 'English typography ABC xyz 0123456789 Café' },
  { id: 'font-zh', lang: 'zh-CN', text: '中文简体汉字，外观与语言。' },
  { id: 'font-ja', lang: 'ja', text: '日本語 ひらがな カタカナ' },
  { id: 'font-ko', lang: 'ko', text: '한국어 한글 글꼴' },
  { id: 'font-bold', lang: 'zh-CN', text: 'English 中文 日本語 한국어 600' },
  { id: 'font-mixed', lang: 'en', text: 'Noto emoji 😀 with English 0123' },
]
const emojiSamples = [
  { id: 'face', label: 'Smiling face', text: '😀' },
  { id: 'heart', label: 'Heart', text: '❤️' },
  { id: 'technologist', label: 'Woman technologist', text: '👩🏽‍💻' },
  { id: 'family', label: 'Family', text: '👨‍👩‍👧‍👦' },
  { id: 'rainbow', label: 'Rainbow flag', text: '🏳️‍🌈' },
  { id: 'flag', label: 'Japanese flag', text: '🇯🇵' },
]
export async function addFontSpecimens(page: Page): Promise<void> {
  await page.getByRole('main').evaluate((main, samples) => {
    const section = document.createElement('section')
    section.id = 'font-specimens'
    section.setAttribute('aria-label', 'Noto typography verification')
    for (const { id, lang, text } of samples.textSamples) {
      const node = document.createElement('p')
      node.id = id
      node.lang = lang
      const content = id === 'font-bold' ? document.createElement('strong') : node
      if (id === 'font-bold') {
        content.style.fontWeight = '600'
      }
      content.textContent = text
      if (content !== node) {
        node.appendChild(content)
      }
      section.appendChild(node)
    }
    for (const { id, label, text } of samples.emojiSamples) {
      const node = document.createElement('span')
      node.id = `emoji-${id}`
      node.className = 'ztd-emoji'
      node.setAttribute('role', 'img')
      node.setAttribute('aria-label', label)
      node.textContent = text
      section.appendChild(node)
    }
    main.appendChild(section)
  }, { textSamples, emojiSamples })
  await page.evaluate(async () => await document.fonts.ready)
}

export async function renderedWeight(page: Page): Promise<{
  weight: string
  synthesis: string
  faces: { family: string, weight: string }[]
  widths: number[]
}> {
  return await page.locator('#font-bold strong').evaluate((node) => {
    const canvas = document.createElement('canvas').getContext('2d')
    if (canvas === null) {
      throw new Error('Canvas metrics unavailable')
    }
    const widths = [400, 600].map((weight) => {
      canvas.font = `${weight} 24px "Noto Sans"`
      return canvas.measureText('English Noto weight').width
    })
    const faces = Array.from(document.fonts).filter(face => face.weight === '600' && face.status === 'loaded')
    return {
      weight: getComputedStyle(node).fontWeight,
      synthesis: getComputedStyle(node).fontSynthesis,
      faces: faces.map(face => ({ family: face.family, weight: face.weight })),
      widths,
    }
  })
}
