// ============================================
// The rates hub's own small rules
// ============================================
// Pure, so they can be tested without rendering the 1500-line page.

/**
 * The hub's "Export view" file: the rows the current tab shows (its filters
 * applied), every key any of them has as a column.
 *
 * The button used to write `String(v || '')` per cell — so a rate of 0 came
 * out blank (0 is falsy), a vehicles or periods list came out as
 * "[object Object]", and the header was the FIRST row's keys only. It is a
 * view of the screen, not the import sheet: the per-page Export (bulk CSV) is
 * the file that re-imports.
 */
export function hubViewCsv(rows: Record<string, unknown>[]): string {
  const headers: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row)) if (!seen.has(key)) { seen.add(key); headers.push(key) }
  }
  const cell = (v: unknown): string => {
    if (v === null || v === undefined) return ''
    if (Array.isArray(v)) {
      // A list of plain values reads as one; a list of records stays exact.
      return v.every(x => x === null || typeof x !== 'object') ? v.join('; ') : JSON.stringify(v)
    }
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
  }
  const quote = (s: string) => `"${s.replace(/"/g, '""')}"`
  const lines = [headers.map(quote).join(',')]
  for (const row of rows) lines.push(headers.map(h => quote(cell(row[h]))).join(','))
  return lines.join('\n')
}

/** The hub tabs a menu anchor opens: the menu links its four rate groups to
 *  /rates#accommodation, #transport, #services and #costs. */
export const HUB_ANCHOR_TABS = {
  accommodation: 'accommodation',
  transport: 'transportation',
  services: 'guides',
  costs: 'tipping',
} as const

export type HubAnchor = keyof typeof HUB_ANCHOR_TABS

/** The tab for a location hash ('#transport' → 'transportation'), or null. */
export function tabForHash(hash: string | null | undefined): (typeof HUB_ANCHOR_TABS)[HubAnchor] | null {
  const key = String(hash ?? '').replace(/^#/, '').trim().toLowerCase()
  return (HUB_ANCHOR_TABS as Record<string, (typeof HUB_ANCHOR_TABS)[HubAnchor]>)[key] ?? null
}
