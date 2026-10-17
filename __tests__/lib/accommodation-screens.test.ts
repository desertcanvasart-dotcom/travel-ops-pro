// Rates › Accommodation audit, the screen half (source reads: these pages
// are large client components with no render harness in this repo).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const src = (p: string) => readFileSync(p, 'utf8')

describe('Sleeping Trains: Show All loads switched-off rates (finding 17)', () => {
  it('fetches every row and filters active on the client', () => {
    const page = src('app/rates/sleeping-train/sleeping-train-rates-content.tsx')
    const fetchRates = page.slice(page.indexOf('const fetchRates = async'), page.indexOf('useEffect(() => {'))
    expect(fetchRates).not.toContain('active_only')
    expect(page).toContain('const matchesActive = showInactive || rate.is_active')
  })
})

describe('bulk delete says what was refused (finding 5)', () => {
  it.each([
    'app/rates/hotels/hotels-content.tsx',
    'app/rates/cruises/page.tsx',
    'app/rates/sleeping-train/sleeping-train-rates-content.tsx',
    'app/rates/hotel-services/page.tsx',
  ])('%s', file => {
    const page = src(file)
    expect(page).toMatch(/const \[ok, failed, reasons\] = await bulkDeleteByIds/)
    expect(page).toContain("tCommon('bulkDeletePartial'")
  })
})

describe('the cruise periods editor has no Suite box (finding 15)', () => {
  it('no pricing path reads it, so the form does not ask for it', () => {
    const editor = src('components/rates/RateSeasonsEditor.tsx')
    const cruise = editor.slice(editor.indexOf('  cruise: ['), editor.indexOf('  flight: ['))
    expect(cruise).not.toContain('suite_eur')
  })
})

describe('a hotel with no tier says so (finding 8)', () => {
  it('the badge no longer reads a missing tier as Standard', () => {
    const page = src('app/rates/hotels/hotels-content.tsx')
    expect(page).not.toContain("const key = tier || 'standard'")
    expect(page).toContain("t('tiers.none')")
  })
})
