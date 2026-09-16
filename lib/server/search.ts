// Index matching CJK unigrams and bigrams explicitly; unicode61 alone does not
// segment continuous Chinese text. Latin identifiers remain searchable tokens.
export function terms(text: string): string[] {
  const normalized = text.normalize('NFKC').toLowerCase()
  const latin = normalized.match(/[a-z0-9_]+/g) ?? []
  const cjk: string[] = []
  for (const run of normalized.match(
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/gu,
  ) ?? []) {
    const chars = [...run]
    cjk.push(...chars)
    for (let i = 0; i < chars.length - 1; i++)
      cjk.push(chars.slice(i, i + 2).join(''))
  }
  return [...new Set([...latin, ...cjk])]
}
export function ftsQuery(text: string): string {
  return terms(text)
    .slice(0, 64)
    .map(term => `"${term}"`)
    .join(' OR ')
}
export function fuseRankings(lists: string[][]): string[] {
  const scores = new Map<string, number>()
  for (const list of lists) {
    for (const [rank, id] of [...new Set(list)].entries())
      scores.set(id, (scores.get(id) ?? 0) + 1 / (60 + rank + 1))
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
}
