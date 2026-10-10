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
const { dayTextHash } = await import('@/lib/itineraries/content-language')

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

describe('English that no longer matches the Japanese (round 13)', () => {
  /** Records upserts and conditional updates. */
  function recorder() {
    const upserts: any[] = []
    const updates: any[] = []
    return {
      upserts, updates,
      from() {
        return {
          upsert(rows: any[]) { upserts.push(...rows); return Promise.resolve({ error: null }) },
          update(values: any) {
            const where: Record<string, unknown> = {}
            const q: any = { eq(c: string, v: unknown) { where[c] = v; return q }, then(r: (v: unknown) => void) { updates.push({ values, where }); r({ error: null }) } }
            return q
          },
        }
      },
    }
  }

  it('a machine row made from older Japanese is translated again and fingerprinted', async () => {
    const db = recorder()
    const today = day('d3', { title: 'アスワン観光' })
    const old = { itinerary_day_id: 'd3', title: 'Luxor sightseeing', description: null, city: null, overnight_city: null, status: 'machine', source_hash: 'deadbeef' }
    const out = await ensureEnglishDayVersions(db as any, [today], [old])
    expect(out.versions.find((v: any) => v.itinerary_day_id === 'd3')!.title).toBe('EN(アスワン観光)')
    expect(db.updates).toHaveLength(1)
    expect(db.updates[0].where).toMatchObject({ itinerary_day_id: 'd3', language: 'en', status: 'machine' })
    expect(db.updates[0].values.source_hash).toBe(dayTextHash(today))
  })

  it('a machine row made by an older sheet with no fingerprint is made again once', async () => {
    const db = recorder()
    const old = { itinerary_day_id: 'd1', title: 'Nile cruise', description: null, city: null, overnight_city: null, status: 'machine', source_hash: null }
    await ensureEnglishDayVersions(db as any, [day('d1')], [old])
    expect(db.updates).toHaveLength(1)
  })

  it('reviewed and current rows are left alone', async () => {
    const db = recorder()
    const d = day('d2')
    const reviewed = { itinerary_day_id: 'd2', title: 'Edited by Cairo', description: null, city: null, overnight_city: null, status: 'reviewed', source_hash: 'stale' }
    await ensureEnglishDayVersions(db as any, [d], [reviewed])
    const current = { itinerary_day_id: 'd2', title: 'x', description: null, city: null, overnight_city: null, status: 'machine', source_hash: dayTextHash(d) }
    await ensureEnglishDayVersions(db as any, [d], [current])
    expect(db.updates).toHaveLength(0)
    expect(translateText).not.toHaveBeenCalled()
  })

  it('new rows carry the fingerprint of the Japanese they came from, own-language edits included', async () => {
    const db = recorder()
    const d = day('d4')
    await ensureEnglishDayVersions(db as any, [d], [], [{ itinerary_day_id: 'd4', title: '修正済みタイトル' }])
    expect(db.upserts[0].source_hash).toBe(dayTextHash({ ...d, title: '修正済みタイトル' }))
    expect(db.upserts[0].title).toBe('EN(修正済みタイトル)')
  })
})

describe('an English trip is never back-translated', () => {
  it('a Japanese translation over English source text is not translated back into English', async () => {
    const writes: any[] = []
    const db = { from() { return { upsert(rows: any[]) { writes.push(...rows); return Promise.resolve({ error: null }) }, update() { const q: any = { eq: () => q, then: (r: any) => r({ error: null }) }; return q } } } }
    const english = { id: 'e1', title: 'Arrive in Cairo', description: 'Meet at the airport', city: 'Cairo', overnight_city: 'Cairo' }
    const out = await ensureEnglishDayVersions(db as any, [english], [], [{ itinerary_day_id: 'e1', title: 'カイロ到着', description: '空港でお出迎え' }])
    expect(writes).toHaveLength(0)
    expect(translateText).not.toHaveBeenCalled()
    expect(out.created).toBe(0)
  })
})
