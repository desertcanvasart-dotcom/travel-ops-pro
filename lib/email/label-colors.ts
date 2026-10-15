// Folder colours. Gmail accepts only colours from its own label palette
// (users.labels: color.backgroundColor / textColor); these eight are from it.
export const LABEL_COLORS: Array<{ name: string; backgroundColor: string; textColor: string }> = [
  { name: 'Red', backgroundColor: '#fb4c2f', textColor: '#ffffff' },
  { name: 'Orange', backgroundColor: '#ffad47', textColor: '#ffffff' },
  { name: 'Yellow', backgroundColor: '#fad165', textColor: '#000000' },
  { name: 'Green', backgroundColor: '#16a766', textColor: '#ffffff' },
  { name: 'Teal', backgroundColor: '#43d692', textColor: '#ffffff' },
  { name: 'Blue', backgroundColor: '#4a86e8', textColor: '#ffffff' },
  { name: 'Purple', backgroundColor: '#a479e2', textColor: '#ffffff' },
  { name: 'Pink', backgroundColor: '#f691b3', textColor: '#ffffff' },
  { name: 'Grey', backgroundColor: '#999999', textColor: '#ffffff' },
]

/** One of the palette's pairs, or null ("no colour"); anything else is refused. */
export function paletteColor(bg: unknown, text: unknown): { backgroundColor: string; textColor: string } | null | undefined {
  if (bg === null || bg === '' || bg === undefined) return null
  const hit = LABEL_COLORS.find(c => c.backgroundColor === String(bg).toLowerCase() && (text === undefined || c.textColor === String(text).toLowerCase()))
  return hit ? { backgroundColor: hit.backgroundColor, textColor: hit.textColor } : undefined
}
