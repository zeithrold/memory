import type { ClassNameValue } from 'tailwind-merge'
import { extendTailwindMerge } from 'tailwind-merge'

const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        { text: [
          'body',
          'control',
          'help',
          'heading',
          'reading',
          'editable',
        ] },
      ],
      'font-family': [
        { font: ['emoji'] },
      ],
      'shadow': [
        { shadow: ['menu'] },
      ],
    },
  },
})
export function cn(...classLists: ClassNameValue[]): string {
  return merge(...classLists)
}
