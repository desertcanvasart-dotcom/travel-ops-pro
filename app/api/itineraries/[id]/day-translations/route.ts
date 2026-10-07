import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { translateFields, ITINERARY_DAY_TRANSLATION_FIELDS } from '@/lib/translation-utils'
import {
  dayTextHash,
  dayTranslationStatus,
  detectContentLanguage,
  mergeDayText,
  targetLanguages,
  type DayText,
} from '@/lib/itineraries/content-language'
import type { Language } from '@/types/multilingual'
import { SUPPORTED_LANGUAGES } from '@/types/multilingual'

// ============================================
// One itinerary's day text, side by side, per language
// ============================================
// GET   the source text of every day and its translation in each target
//       language, with that translation's status (content-language.ts).
// POST  translate days into one language — the given days, or every day that
//       is missing or outdated. Rows are stamped 'machine' with the source's
//       fingerprint, so a later edit to the source marks them outdated.
// PUT   a person's text for one day in one language. Stamped 'reviewed' with
//       the CURRENT source fingerprint: saving is the review.
//
// Services are not here. They are shared across languages and edited on the
// itinerary editor; only their names are translated (copy-translate).

const supabase = createServerClient()

const DAY_COLUMNS = 'id, day_number, date, title, description, city, overnight_city'
const VERSION_COLUMNS = 'itinerary_day_id, language, title, description, city, overnight_city, status, source_hash, translated_at'

interface DayRow extends DayText {
  id: string
  day_number: number
  date: string
}

interface VersionRow extends DayText {
  itinerary_day_id: string
  language: Language
  status: string | null
  source_hash: string | null
  translated_at: string | null
}

const isLanguage = (v: unknown): v is Language => SUPPORTED_LANGUAGES.includes(v as Language)

/**
 * Everything the three methods share: the trip's days, every version row, the
 * source language and each day's source text (canonical with any
 * source-language version laid over it, as the days API shows it).
 */
async function load(id: string, orgId: string) {
  const { data: itinerary } = await supabase
    .from('itineraries')
    .select('id, trip_name')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!itinerary) return null

  const { data: days, error: daysError } = await supabase
    .from('itinerary_days')
    .select(DAY_COLUMNS)
    .eq('itinerary_id', id)
    .order('day_number', { ascending: true })
  if (daysError) throw daysError
  const dayRows = (days ?? []) as DayRow[]

  const { data: versions, error: versionsError } = dayRows.length > 0
    ? await supabase
        .from('itinerary_day_versions')
        .select(VERSION_COLUMNS)
        .in('itinerary_day_id', dayRows.map(d => d.id))
    : { data: [], error: null }
  if (versionsError) throw versionsError
  const versionRows = (versions ?? []) as VersionRow[]

  // The canonical rows decide the source language — that is the text everyone
  // edits. The trip name counts too, for a trip with no day text yet.
  const sourceLanguage: Language =
    detectContentLanguage([itinerary.trip_name, ...dayRows.flatMap(d => [d.title, d.description])]) ?? 'en'

  const versionOf = (dayId: string, lang: Language) =>
    versionRows.find(v => v.itinerary_day_id === dayId && v.language === lang) ?? null

  const sourceText = new Map<string, DayText>()
  for (const day of dayRows) sourceText.set(day.id, mergeDayText(day, versionOf(day.id, sourceLanguage)))

  return { dayRows, versionOf, sourceLanguage, sourceText }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params

    const loaded = await load(id, orgId)
    if (!loaded) return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
    const { dayRows, versionOf, sourceLanguage, sourceText } = loaded
    const targets = targetLanguages(sourceLanguage)

    return NextResponse.json({
      success: true,
      data: {
        source_language: sourceLanguage,
        target_languages: targets,
        days: dayRows.map(day => {
          const source = sourceText.get(day.id)!
          return {
            id: day.id,
            day_number: day.day_number,
            date: day.date,
            source,
            translations: Object.fromEntries(targets.map(lang => {
              const row = versionOf(day.id, lang)
              return [lang, {
                text: row ? { title: row.title, description: row.description, city: row.city, overnight_city: row.overnight_city } : null,
                status: dayTranslationStatus(source, row),
                translated_at: row?.translated_at ?? null,
              }]
            })),
          }
        }),
      },
    })
  } catch (error) {
    console.error('[day-translations] GET failed:', error)
    return NextResponse.json({ success: false, error: 'Failed to load day translations' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const language = body?.language
    const dayIds: string[] | undefined = Array.isArray(body?.day_ids) ? body.day_ids : undefined

    if (!isLanguage(language)) {
      return NextResponse.json({ success: false, error: 'Invalid language' }, { status: 400 })
    }

    const loaded = await load(id, orgId)
    if (!loaded) return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
    const { dayRows, versionOf, sourceLanguage, sourceText } = loaded
    if (language === sourceLanguage) {
      return NextResponse.json({ success: false, error: 'That is the source language' }, { status: 400 })
    }

    // Named days are translated whatever their state — the person asked for
    // that day. Without names, only the days that need it: a reviewed day is
    // a person's work and "translate all" must not overwrite it.
    const chosen = dayIds
      ? dayRows.filter(d => dayIds.includes(d.id))
      : dayRows.filter(d => {
          const status = dayTranslationStatus(sourceText.get(d.id)!, versionOf(d.id, language))
          return status === 'missing' || status === 'outdated'
        })

    // Sequential: an external model, and a whole trip in parallel is a
    // rate-limit incident (same reason as copy-translate).
    const now = new Date().toISOString()
    const rows = []
    for (const day of chosen) {
      const source = sourceText.get(day.id)!
      const translated = await translateFields(source as unknown as Record<string, unknown>, ITINERARY_DAY_TRANSLATION_FIELDS, sourceLanguage, language)
      rows.push({
        itinerary_day_id: day.id,
        language,
        title: (translated.title as string) || source.title,
        description: (translated.description as string) || source.description,
        city: (translated.city as string) || source.city,
        overnight_city: (translated.overnight_city as string) || source.overnight_city,
        status: 'machine',
        source_hash: dayTextHash(source),
        translated_at: now,
        updated_at: now,
      })
    }

    if (rows.length > 0) {
      const { error } = await supabase
        .from('itinerary_day_versions')
        .upsert(rows, { onConflict: 'itinerary_day_id,language' })
      if (error) throw error
    }

    return NextResponse.json({ success: true, data: { translated: rows.length } })
  } catch (error) {
    console.error('[day-translations] POST failed:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Translation failed' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const { language, day_id } = body ?? {}

    if (!isLanguage(language) || typeof day_id !== 'string') {
      return NextResponse.json({ success: false, error: 'language and day_id are required' }, { status: 400 })
    }

    const loaded = await load(id, orgId)
    if (!loaded) return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
    const { dayRows, versionOf, sourceLanguage, sourceText } = loaded
    if (language === sourceLanguage) {
      // The source is the itinerary itself, edited on the itinerary editor.
      return NextResponse.json({ success: false, error: 'That is the source language' }, { status: 400 })
    }
    const day = dayRows.find(d => d.id === day_id)
    if (!day) return NextResponse.json({ success: false, error: 'Day not found' }, { status: 404 })

    const existing = versionOf(day.id, language)
    const pick = (field: keyof DayText) =>
      typeof body[field] === 'string' ? (body[field].trim() || null) : (existing?.[field] ?? null)
    const now = new Date().toISOString()
    const row = {
      itinerary_day_id: day.id,
      language,
      title: pick('title'),
      description: pick('description'),
      city: pick('city'),
      overnight_city: pick('overnight_city'),
      status: 'reviewed',
      source_hash: dayTextHash(sourceText.get(day.id)!),
      translated_at: now,
      updated_at: now,
    }

    const { error } = await supabase
      .from('itinerary_day_versions')
      .upsert(row, { onConflict: 'itinerary_day_id,language' })
    if (error) throw error

    return NextResponse.json({ success: true, data: row })
  } catch (error) {
    console.error('[day-translations] PUT failed:', error)
    return NextResponse.json({ success: false, error: 'Failed to save the day' }, { status: 500 })
  }
}
