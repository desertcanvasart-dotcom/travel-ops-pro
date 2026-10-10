// ============================================
// THE GROUND SHEET'S ENGLISH — made, not hoped for
// ============================================
// The office writes an itinerary in the language it sells in. For the Tokyo
// desk that is Japanese, and the canonical itinerary_days rows are Japanese
// with it. That is correct for the customer's 日程表.
//
// The ground operations sheet is a different document with a different reader:
// the team in Cairo executing the tour. Nobody there reads Japanese, and a
// Japanese operations sheet is just the itinerary again — it has no job left to
// do. Its ONE distinct role is to be the English copy of the final itinerary,
// so English is not an option this document offers, it is the document.
//
// Translations live in itinerary_day_versions, one row per day per language —
// the same table the itinerary's language tab fills with Copy & Translate.
// This makes the English rows when they are missing rather than waiting for
// someone to remember, and saves them, so the text is made once, is editable
// afterwards in that tab, and every later sheet is a plain read.
//
// What it will NOT do is fail the document. A translation that errors falls
// back to the canonical line for that day and is not saved: a sheet with one
// Japanese line is still a sheet the ground team can work from, and a 500 is
// not.

import { translateText } from '@/lib/translation-utils'
import { dayTextHash, mergeDayText, type DayText } from '@/lib/itineraries/content-language'

/** Fields of a day that carry prose the ground team reads. */
const TRANSLATABLE = ['title', 'description', 'city', 'overnight_city'] as const

export interface CanonicalDay {
  id: string
  title: string | null
  description: string | null
  city: string | null
  overnight_city: string | null
  /** Place names the sheet prints under the day's instructions. */
  attractions?: string[] | null
}

export interface EnglishDays {
  /** English prose per day, stored in itinerary_day_versions. */
  versions: DayEnglishVersion[]
  /** English place names per day id — translated per render, see below. */
  attractions: Map<string, string[]>
  created: number
  failed: number
}

export interface DayEnglishVersion {
  itinerary_day_id: string
  title: string | null
  description: string | null
  city: string | null
  overnight_city: string | null
  /** 'machine' | 'reviewed' | null (made before translations were tracked). */
  status?: string | null
  /** dayTextHash of the source the row was translated from. */
  source_hash?: string | null
}

/**
 * Does a stored English row no longer say what the day says?
 *
 * Only machine text is ever replaced: a 'reviewed' row is a person's work, and
 * a row with no status predates tracking — neither is overwritten. A machine
 * row with no fingerprint was made by this sheet before it stamped one, so its
 * source is unknown; it is made again once, fingerprinted. That is the case
 * that printed "Luxor" to the ground team for a day the office had changed to
 * Aswan.
 */
export function englishIsStale(row: DayEnglishVersion, sourceHash: string): boolean {
  if (row.status !== 'machine') return false
  return !row.source_hash || row.source_hash !== sourceHash
}

/**
 * Text that still has to be translated.
 *
 * CJK, kana and full-width punctuation are the office's Japanese. Text without
 * them is already the Latin the sheet wants — a hotel name, a flight number, a
 * city — and sending it to a translator would spend a call to get it back, or
 * worse, get back a "corrected" version of a proper noun.
 */
export function needsEnglish(text: string | null | undefined): boolean {
  if (!text) return false
  return /[　-〿぀-ゟ゠-ヿ一-鿿＀-￯]/.test(text)
}

/** True when any of this day's text is not already English. */
export function dayNeedsEnglish(day: CanonicalDay): boolean {
  return TRANSLATABLE.some(field => needsEnglish(day[field]))
}

/**
 * Run tasks with a ceiling on how many are in flight.
 *
 * Not sequential — a 12-day trip translated one field at a time is a minute of
 * a person waiting for a PDF. Not unbounded either: the whole trip at once is
 * a rate-limit incident, which is why the copy-translate route runs its bulk
 * job in series. Four is the middle that keeps a normal 8-day sheet inside a
 * few seconds.
 */
async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++
      if (index >= items.length) return
      results[index] = await task(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

/**
 * English for every day that lacks it.
 *
 * Returns the English versions to render — the ones already stored, plus the
 * ones just made. Days whose canonical text is already English are left alone:
 * there is nothing to translate and nothing to store, and the caller's merge
 * shows the canonical row through.
 */
export async function ensureEnglishDayVersions(
  supabase: {
    from: (table: string) => any
  },
  days: CanonicalDay[],
  existing: DayEnglishVersion[],
  /** The trip's own-language version rows (e.g. 'ja'), laid over the
   *  canonical day — the source text the itinerary page fingerprints. */
  sourceVersions: Array<Partial<DayText> & { itinerary_day_id: string }> = []
): Promise<EnglishDays> {
  // The day's text as the itinerary page shows it in its own language, and its
  // fingerprint — the same pair the language tab uses, so a row made here
  // reads "outdated" there when the office edits the day afterwards.
  const sourceOf = new Map<string, CanonicalDay>()
  const hashOf = new Map<string, string>()
  for (const day of days) {
    const merged = { ...day, ...mergeDayText(day, sourceVersions.find(v => v.itinerary_day_id === day.id)) }
    sourceOf.set(day.id, merged)
    hashOf.set(day.id, dayTextHash(merged))
  }
  const rowOf = new Map(existing.map(v => [v.itinerary_day_id, v]))
  const missing = days
    .map(day => sourceOf.get(day.id)!)
    .filter(day => {
      const row = rowOf.get(day.id)
      if (!row) return dayNeedsEnglish(day)
      return dayNeedsEnglish(day) && englishIsStale(row, hashOf.get(day.id)!)
    })
  // Attractions are checked on EVERY day, not only the ones missing a version:
  // itinerary_day_versions has no attractions column, so a day whose prose was
  // translated months ago still has its place names in the canonical language.
  const withAttractions = days.filter(day =>
    (day.attractions ?? []).some(name => needsEnglish(name))
  )

  if (missing.length === 0 && withAttractions.length === 0) {
    return { versions: existing, attractions: new Map(), created: 0, failed: 0 }
  }

  // One call per DISTINCT string. Cities repeat on every day of a stay and
  // titles repeat across a cruise; translating each occurrence separately
  // would pay for the same sentence a dozen times and — worse — could come
  // back worded differently on consecutive days of one sheet.
  const memo = new Map<string, Promise<string | null>>()
  const toEnglish = (text: string) => {
    let pending = memo.get(text)
    if (!pending) {
      pending = translateText(text, 'ja', 'en')
      memo.set(text, pending)
    }
    return pending
  }

  let failed = 0

  // Place names, which have nowhere to be stored. itinerary_day_versions
  // carries prose only, so these are translated per render — they are a handful
  // of short strings, and the memo above means a name repeated across a week
  // of days costs one call.
  const attractions = new Map<string, string[]>()
  await mapWithLimit(withAttractions, 4, async day => {
    try {
      const names = await Promise.all(
        (day.attractions ?? []).map(async name =>
          needsEnglish(name) ? ((await toEnglish(name)) || name) : name
        )
      )
      attractions.set(day.id, names)
    } catch (error) {
      console.error(`[ops-sheet] English place names for day ${day.id} unavailable:`, error)
      failed++
    }
  })

  const translated = await mapWithLimit(missing, 4, async day => {
    try {
      const row: DayEnglishVersion = {
        itinerary_day_id: day.id,
        title: day.title,
        description: day.description,
        city: day.city,
        overnight_city: day.overnight_city,
      }
      for (const field of TRANSLATABLE) {
        const source = day[field]
        if (!needsEnglish(source)) continue
        // A translator that returns nothing has not translated anything; the
        // canonical line stays rather than the day going blank.
        row[field] = (await toEnglish(source as string)) || source
      }
      return row
    } catch (error) {
      // One day's translation failing is not the document failing.
      console.error(`[ops-sheet] English for day ${day.id} unavailable:`, error)
      failed++
      return null
    }
  })

  const rows = translated.filter((row): row is DayEnglishVersion => row !== null)
  if (rows.length === 0) {
    return { versions: existing, attractions, created: 0, failed }
  }
  const madeFor = new Set(rows.map(r => r.itinerary_day_id))

  // Saved so the text is made once and can be corrected afterwards in the
  // itinerary's language tab. A row another request inserted first is not an
  // error — the sheet renders what it translated either way.
  // Machine text, so the itinerary page reports it unreviewed, fingerprinted
  // with the same source text the page hashes. A stale machine row is
  // replaced; a row a person reviewed meanwhile is not (the update is
  // conditional on the row still being machine text).
  const now = new Date().toISOString()
  const fresh = rows.filter(row => !rowOf.has(row.itinerary_day_id))
  const stale = rows.filter(row => rowOf.has(row.itinerary_day_id))
  const { error: insertError } = fresh.length === 0 ? { error: null } : await supabase
    .from('itinerary_day_versions')
    .upsert(
      fresh.map(row => ({ ...row, language: 'en', status: 'machine', source_hash: hashOf.get(row.itinerary_day_id), translated_at: now })),
      { onConflict: 'itinerary_day_id,language', ignoreDuplicates: true }
    )
  for (const row of stale) {
    const { error } = await supabase
      .from('itinerary_day_versions')
      .update({
        title: row.title, description: row.description, city: row.city, overnight_city: row.overnight_city,
        source_hash: hashOf.get(row.itinerary_day_id), translated_at: now, updated_at: now,
      })
      .eq('itinerary_day_id', row.itinerary_day_id)
      .eq('language', 'en')
      .eq('status', 'machine')
    if (error) console.error('[ops-sheet] English day text could not be refreshed:', error)
  }
  if (insertError) {
    console.error('[ops-sheet] English day text could not be saved:', insertError)
  }

  return {
    versions: [...existing.filter(v => !madeFor.has(v.itinerary_day_id)), ...rows],
    attractions,
    created: rows.length,
    failed,
  }
}
