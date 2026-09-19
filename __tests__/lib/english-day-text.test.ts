// The ground operations sheet exists to be the ENGLISH copy of the itinerary.
// Handed to Cairo in the office's Japanese it is just the itinerary again,
// with no job left to do — so English is made here rather than waited for.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const translateText = vi.fn()
vi.mock('@/lib/translation-utils', () => ({
  translateText: (...args: unknown[]) => translateText(...args),
}))

const { ensureEnglishDayVersions, needsEnglish, dayNeedsEnglish } = await import(
  '@/lib/itineraries/english-day-text'
)

const JA = {
  title: 'ナイルクルーズ',
  description: 'ホテルで朝食',
  city: 'カイロ',
  overnight: 'ルクソール',
}

/** A supabase double that records what it was asked to write. */
function fakeSupabase() {
  const writes: any[] = []
  return {
    writes,
    from(table: string) {
      return {
        upsert(rows: any[], options: unknown) {
          writes.push({ table, rows, options })
          return Promise.resolve({ error: null })
        },
      }
    },
  }
}

const day = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: JA.title,
  description: JA.description,
  city: JA.city,
  overnight_city: JA.overnight,
  ...extra,
})

beforeEach(() => {
  translateText.mockReset()
  translateText.mockImplementation((text: string) => Promise.resolve(`EN(${text})`))
})

describe('needsEnglish', () => {
  it('sees the office’s Japanese', () => {
    expect(needsEnglish(JA.title)).toBe(true)
    expect(needsEnglish('【00:00】')).toBe(true)
  })

  it('leaves text that is already English alone', () => {
    // Sending it to a translator spends a call to get it back — or worse,
    // gets back a "corrected" proper noun.
    expect(needsEnglish('Nile Cruise')).toBe(false)
    expect(needsEnglish('MS402 CAI/LXR')).toBe(false)
    expect(needsEnglish('')).toBe(false)
    expect(needsEnglish(null)).toBe(false)
  })

  it('judges a day by any of its fields', () => {
    expect(dayNeedsEnglish(day('d1'))).toBe(true)
    expect(
      dayNeedsEnglish({
        id: 'd1', title: 'Arrival', description: 'Meet and greet',
        city: 'Cairo', overnight_city: 'Cairo',
      })
    ).toBe(false)
  })
})

describe('ensureEnglishDayVersions', () => {
  it('translates a day that has no English version, and saves it', async () => {
    const db = fakeSupabase()
    const result = await ensureEnglishDayVersions(db as any, [day('d1')], [])

    expect(result.created).toBe(1)
    expect(result.failed).toBe(0)
    expect(result.versions[0]).toMatchObject({
      itinerary_day_id: 'd1',
      title: `EN(${JA.title})`,
      description: `EN(${JA.description})`,
    })
    // Saved, so the text is made once and can be corrected afterwards in the
    // itinerary's language tab.
    expect(db.writes).toHaveLength(1)
    expect(db.writes[0].table).toBe('itinerary_day_versions')
    expect(db.writes[0].rows[0].language).toBe('en')
  })

  it('does not re-translate a day that already has an English version', async () => {
    const db = fakeSupabase()
    const existing = [{
      itinerary_day_id: 'd1', title: 'Nile Cruise',
      description: 'Breakfast', city: 'Cairo', overnight_city: 'Luxor',
    }]
    const result = await ensureEnglishDayVersions(db as any, [day('d1')], existing)

    expect(translateText).not.toHaveBeenCalled()
    expect(result.created).toBe(0)
    expect(result.versions).toEqual(existing)
    expect(db.writes).toHaveLength(0)
  })

  it('leaves a day that is already English untouched', async () => {
    const db = fakeSupabase()
    const english = day('d1', {
      title: 'Arrival', description: 'Meet and greet', city: 'Cairo', overnight_city: 'Cairo',
    })
    const result = await ensureEnglishDayVersions(db as any, [english], [])

    expect(translateText).not.toHaveBeenCalled()
    expect(result.created).toBe(0)
    expect(db.writes).toHaveLength(0)
  })

  it('pays for a repeated line once', async () => {
    // A city repeats on every day of a stay and a title repeats across a
    // cruise. Translating each occurrence separately would also risk the same
    // sentence coming back worded differently on consecutive days of ONE sheet.
    const db = fakeSupabase()
    await ensureEnglishDayVersions(db as any, [day('d1'), day('d2'), day('d3')], [])

    const asked = translateText.mock.calls.map(c => c[0])
    expect(new Set(asked).size).toBe(asked.length)
    expect(new Set(asked)).toEqual(new Set([JA.title, JA.description, JA.city, JA.overnight]))
  })

  it('keeps the canonical line when the translator returns nothing', async () => {
    translateText.mockResolvedValue(null)
    const db = fakeSupabase()
    const result = await ensureEnglishDayVersions(db as any, [day('d1')], [])
    expect(result.versions[0].title).toBe(JA.title)
  })

  it('does not fail the document when a translation errors', async () => {
    // A sheet with one Japanese line is still a sheet the ground team can work
    // from. A 500 is not.
    translateText.mockRejectedValue(new Error('rate limited'))
    const db = fakeSupabase()
    const result = await ensureEnglishDayVersions(db as any, [day('d1')], [])

    expect(result.failed).toBeGreaterThan(0)
    expect(result.created).toBe(0)
    expect(db.writes).toHaveLength(0)
  })

  it('translates place names on every day, version or not', async () => {
    // itinerary_day_versions has no attractions column, so a day whose prose
    // was translated months ago still has its place names in Japanese.
    const db = fakeSupabase()
    const existing = [{
      itinerary_day_id: 'd1', title: 'Nile Cruise',
      description: 'Breakfast', city: 'Cairo', overnight_city: 'Luxor',
    }]
    const result = await ensureEnglishDayVersions(
      db as any,
      [day('d1', { attractions: ['カルナック神殿', 'Valley of the Kings'] })],
      existing
    )

    expect(result.attractions.get('d1')).toEqual([
      'EN(カルナック神殿)',
      'Valley of the Kings',
    ])
    // Place names are not prose — nothing was written to the versions table.
    expect(db.writes).toHaveLength(0)
  })
})
