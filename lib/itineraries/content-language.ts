// ============================================
// THE ITINERARY'S CONTENT LANGUAGES
// ============================================
// An itinerary is written once, in the language the office sells in, and then
// carried into the client's language. Two different things were treated as one
// on the detail page: the canonical itinerary_days rows (the SOURCE, whatever
// language they are in) and the itinerary_versions rows (one per language that
// was "created"). A trip converted from a quote has canonical English and no
// version rows at all, so the page said "English — not created" over English
// text, and put a full-page empty state above the money and operations, which
// language does not touch.
//
// This module is the language layer and nothing else: which language the
// source is, what state each target day is in, and the client-copy checks
// that only make sense per language. Services, rates, resources and status
// are language-neutral and never pass through here.
//
// Pure — used by the API routes and the page alike, so the staleness hash a
// server stamps is the one the page recomputes.

import type { Language } from '@/types/multilingual'
import { SUPPORTED_LANGUAGES } from '@/types/multilingual'

/** CJK, kana and full-width forms: the office's Japanese. */
const JAPANESE = /[　-〿぀-ゟ゠-ヿ一-鿿＀-￯]/g
/** Latin letters, for the other side of the count. */
const LATIN = /[A-Za-z]/g

/**
 * The language the canonical text is written in.
 *
 * Counted, not "any Japanese character": English day text routinely carries a
 * hotel's Japanese name or a 【】 bracket, and Japanese text carries flight
 * numbers and hotel names in Latin. A Japanese character carries a word's
 * worth of meaning where a Latin letter carries a fraction of one, so each
 * counts three times — enough that a Japanese paragraph with a few English
 * names stays Japanese, and an English one with a bracket stays English.
 *
 * Returns null when there is no text to judge.
 */
export function detectContentLanguage(texts: Array<string | null | undefined>): Language | null {
  let ja = 0
  let latin = 0
  for (const text of texts) {
    if (!text) continue
    ja += (text.match(JAPANESE) ?? []).length
    latin += (text.match(LATIN) ?? []).length
  }
  if (ja === 0 && latin === 0) return null
  return ja * 3 >= latin ? 'ja' : 'en'
}

/**
 * clients.preferred_language is free text (the WhatsApp parser writes
 * "English", the CRM form writes a code, people type 日本語). Only the
 * languages this app can produce content in are recognised; anything else is
 * "unknown", not a guess.
 */
export function normalizeClientLanguage(value: string | null | undefined): Language | null {
  const v = (value ?? '').trim().toLowerCase()
  if (!v) return null
  if (v === 'ja' || v === 'jp' || v.startsWith('japan') || v === '日本語' || v === '日本') return 'ja'
  if (v === 'en' || v.startsWith('english') || v === '英語') return 'en'
  return null
}

/** The languages content can be translated into, given the source. */
export function targetLanguages(source: Language): Language[] {
  return SUPPORTED_LANGUAGES.filter(l => l !== source)
}

// ---------------------------------------------------------------------------
// Day text and staleness
// ---------------------------------------------------------------------------

export interface DayText {
  title: string | null
  description: string | null
  city: string | null
  overnight_city: string | null
}

const DAY_FIELDS = ['title', 'description', 'city', 'overnight_city'] as const

/**
 * A version row laid over the canonical day, field by field — the same merge
 * the days API applies, so the text hashed here is the text the page shows.
 */
export function mergeDayText(canonical: DayText, version?: Partial<DayText> | null): DayText {
  const out = { ...canonical }
  if (!version) return out
  for (const field of DAY_FIELDS) {
    if (version[field]) out[field] = version[field] as string
  }
  return out
}

/**
 * Fingerprint of a day's source text, stamped on a translation when it is
 * made. When the source is edited afterwards the fingerprint no longer
 * matches and the translation is outdated. FNV-1a: tiny, identical in the
 * browser and on the server, and collisions only cost a missed "outdated".
 * Whitespace at the ends is not an edit.
 */
export function dayTextHash(day: DayText): string {
  const input = JSON.stringify(DAY_FIELDS.map(f => (day[f] ?? '').trim()))
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * - missing:    no text in this language
 * - machine:    AI-translated, nobody has read it
 * - reviewed:   saved by a person
 * - outdated:   the source changed after this was translated
 * - translated: made before translations were tracked; provenance unknown
 */
export type DayTranslationStatus = 'missing' | 'machine' | 'reviewed' | 'outdated' | 'translated'

export interface DayVersionRow extends Partial<DayText> {
  status?: string | null
  source_hash?: string | null
}

export function dayTranslationStatus(source: DayText, target: DayVersionRow | null | undefined): DayTranslationStatus {
  if (!target || !(target.title || target.description)) return 'missing'
  if (target.source_hash && target.source_hash !== dayTextHash(source)) return 'outdated'
  if (target.status === 'machine') return 'machine'
  if (target.status === 'reviewed') return 'reviewed'
  return 'translated'
}

export type LanguageStatus = 'source' | 'missing' | 'outdated' | 'machine' | 'reviewed' | 'partial'

export interface LanguageSummary {
  language: Language
  status: LanguageStatus
  counts: Record<DayTranslationStatus, number>
  total: number
}

/**
 * One language's state across the trip, worst first: a single outdated day
 * makes the language outdated, because that is the day a client would read
 * wrong. "partial" is some days present, some missing.
 */
export function summarizeLanguage(language: Language, statuses: DayTranslationStatus[]): LanguageSummary {
  const counts: Record<DayTranslationStatus, number> = { missing: 0, machine: 0, reviewed: 0, outdated: 0, translated: 0 }
  for (const s of statuses) counts[s]++
  const total = statuses.length
  let status: LanguageStatus
  if (total === 0 || counts.missing === total) status = 'missing'
  else if (counts.outdated > 0) status = 'outdated'
  else if (counts.missing > 0) status = 'partial'
  else if (counts.machine > 0) status = 'machine'
  else status = 'reviewed'
  return { language, status, counts, total }
}

// ---------------------------------------------------------------------------
// Client-copy checks
// ---------------------------------------------------------------------------

export interface Placeholder {
  match: string
  kind: 'time' | 'xx' | 'tbd' | 'bracket'
}

const PLACEHOLDER_RULES: Array<{ kind: Placeholder['kind']; re: RegExp }> = [
  // A 00:00 time in the Japanese brackets the programmes use: a time nobody
  // filled in. Real times (【09:30】) are left alone.
  { kind: 'time', re: /[【\[]\s*0{1,2}[:：]0{2}\s*[】\]]/g },
  // "flight XX", "EgyptAir XX" — a number nobody filled in.
  { kind: 'xx', re: /\bX{2,}\b/g },
  { kind: 'tbd', re: /\bTB[DAC]\b|未定/g },
  // An empty or ellipsis bracket: "[...]", "[ ]", "【…】".
  { kind: 'bracket', re: /[\[【]\s*(?:\.{2,}|…|)\s*[\]】]/g },
]

/** Template residue that must not reach a client document. */
export function findPlaceholders(text: string | null | undefined): Placeholder[] {
  if (!text) return []
  const found: Placeholder[] = []
  for (const { kind, re } of PLACEHOLDER_RULES) {
    for (const m of text.matchAll(re)) found.push({ match: m[0], kind })
  }
  return found
}

const TIPS = /\b(tip|tips|tipping|gratuit(y|ies))\b|チップ|心付け/i

/**
 * Tips included in one list and excluded in the other.
 *
 * Driver and porter tips "included" beside guide gratuities "excluded" can be
 * deliberate — but it is the line a client disputes at the end of a trip, so
 * it is shown to the person writing the lists rather than left to the client.
 */
export function tipsConflict(inclusions: string[] | null | undefined, exclusions: string[] | null | undefined): { included: string[]; excluded: string[] } | null {
  const included = (inclusions ?? []).filter(item => TIPS.test(item))
  const excluded = (exclusions ?? []).filter(item => TIPS.test(item))
  return included.length > 0 && excluded.length > 0 ? { included, excluded } : null
}

/**
 * "NMS803-CR-ABS — 8 days: Nile Cruise…" → the code and the title apart.
 *
 * Programme codes are pasted into trip names because that is how the office
 * finds them, but the trip name is client copy and is translated. Shown apart,
 * the title reads as a title and the code as the internal reference it is.
 * Only a leading run of capitals and digits with at least one hyphen followed
 * by a dash or colon counts — "Cairo — 3 days" is a title.
 */
export function splitTourCode(tripName: string | null | undefined): { code: string | null; title: string } {
  const name = (tripName ?? '').trim()
  const m = name.match(/^([A-Z0-9]+(?:-[A-Z0-9]+)+)\s*[—–:|-]\s*(.+)$/)
  if (!m || !/\d/.test(m[1])) return { code: null, title: name }
  return { code: m[1], title: m[2].trim() }
}
