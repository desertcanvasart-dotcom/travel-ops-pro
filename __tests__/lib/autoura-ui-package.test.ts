// The itinerary page's shared pieces live in @autoura/ui (a git dependency,
// tests in its own repo). This pins what THIS app relies on: that the package
// resolves here — under Vitest's Node ESM loader, which is stricter than the
// bundler — and that the server routes and the page read the same rules, so a
// fingerprint the API stamps is the one the page recomputes.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dayTextHash, dayTranslationStatus, detectContentLanguage } from '@autoura/ui/lib'

describe('@autoura/ui', () => {
  it('resolves, and its rules run', () => {
    const day = { title: 'Cairo', description: 'Pyramids of Giza', city: 'Cairo', overnight_city: 'Cairo' }
    expect(detectContentLanguage([day.title, day.description])).toBe('en')
    expect(dayTranslationStatus(day, { title: 'カイロ', status: 'machine', source_hash: dayTextHash(day) })).toBe('machine')
  })

  it('the routes that stamp translations and the page that reads them use the package, not a copy', () => {
    for (const file of [
      'app/api/itineraries/[id]/day-translations/route.ts',
      'app/api/itineraries/[id]/versions/copy-translate/route.ts',
      'app/itineraries/[id]/page.tsx',
    ]) {
      expect(readFileSync(file, 'utf8'), file).toMatch(/from '@autoura\/ui(\/lib)?'/)
    }
  })
})
