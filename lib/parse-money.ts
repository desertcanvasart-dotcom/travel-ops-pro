// ============================================
// A money amount read off a document
// ============================================
// The supplier-invoice reader gets totals back as the model saw them:
// "€1,234.50", "1.234,50 EUR", "1 234,50". Stripping everything but digits,
// '.' and '-' read the European "1.234,50" as 1.2345 (AUDIT L2). The decimal
// separator is the last of '.' / ',' when both appear; a lone ',' is decimal
// only when one or two digits follow it ("12,5", "12,50" — "1,234" is a
// thousand); repeated separators of one kind are thousands.

export function parseMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null

  const negative = /^\s*\(.*\)\s*$/.test(value) || /-/.test(value)
  let digits = value.replace(/[^0-9.,]/g, '')
  if (!/[0-9]/.test(digits)) return null

  const lastDot = digits.lastIndexOf('.')
  const lastComma = digits.lastIndexOf(',')
  let decimal: '.' | ',' | null = null
  if (lastDot >= 0 && lastComma >= 0) {
    decimal = lastDot > lastComma ? '.' : ','
  } else if (lastComma >= 0) {
    const commas = digits.split(',').length - 1
    if (commas === 1 && /,\d{1,2}$/.test(digits)) decimal = ','
  } else if (lastDot >= 0) {
    const dots = digits.split('.').length - 1
    if (dots === 1) decimal = '.'
  }

  if (decimal) {
    const thousands = decimal === '.' ? ',' : '.'
    digits = digits.split(thousands).join('')
    const at = digits.lastIndexOf(decimal)
    digits = digits.slice(0, at).replace(/[.,]/g, '') + '.' + digits.slice(at + 1)
  } else {
    digits = digits.replace(/[.,]/g, '')
  }

  const n = Number(digits)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}
