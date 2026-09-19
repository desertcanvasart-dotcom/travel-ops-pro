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
  existing: DayEnglishVersion[]
): Promise<EnglishDays> {
  const have = new Set(existing.map(v => v.itinerary_day_id))
  const missing = days.filter(day => !have.has(day.id) && dayNeedsEnglish(day))
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

  // Saved so the text is made once and can be corrected afterwards in the
  // itinerary's language tab. A row another request inserted first is not an
  // error — the sheet renders what it translated either way.
  const { error: insertError } = await supabase
    .from('itinerary_day_versions')
    .upsert(
      rows.map(row => ({ ...row, language: 'en' })),
      { onConflict: 'itinerary_day_id,language', ignoreDuplicates: true }
    )
  if (insertError) {
    console.error('[ops-sheet] English day text could not be saved:', insertError)
  }

  return { versions: [...existing, ...rows], attractions, created: rows.length, failed }
}
