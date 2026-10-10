// ============================================
// Service lines in another language — the ones that lack it
// ============================================
// Moved out of copy-translate so "Translate all" uses it too. Copy-translate
// runs once, when a language is first made; services added to the trip after
// that were never translated (day-translations deliberately did days only),
// so a Japanese quote PDF listed "Private transfer airport to hotel" in
// English between Japanese lines. Only services with no version in the target
// language are translated: an existing one may be a person's correction.

import type { Language } from '@/types/multilingual'
import { translateFields, SERVICE_TRANSLATION_FIELDS } from '@/lib/translation-utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/** Translate every service of the trip (or of the given days) that has no
 *  version in targetLanguage. Returns the rows created. */
export async function translateMissingServiceVersions(
  supabase: Db,
  itineraryId: string,
  sourceLanguage: Language,
  targetLanguage: Language,
  onlyDayIds?: string[]
) {
  const { data: days, error: daysError } = await supabase
    .from('itinerary_days')
    .select('id')
    .eq('itinerary_id', itineraryId)
    .order('day_number', { ascending: true })
  if (daysError || !days || days.length === 0) return []

  const dayIds = (days as Array<{ id: string }>).map(d => d.id).filter(id => !onlyDayIds || onlyDayIds.includes(id))
  if (dayIds.length === 0) return []
  const { data: services, error: servicesError } = await supabase
    .from('itinerary_services')
    .select('id, service_name, notes')
    .in('itinerary_day_id', dayIds)
  if (servicesError || !services || services.length === 0) return []

  // ONE query for both languages, not two SELECTs per service — services
  // outnumber days severalfold.
  const { data: versions } = await supabase
    .from('itinerary_service_versions')
    .select('*')
    .in('itinerary_service_id', (services as Array<{ id: string }>).map(s => s.id))
    .in('language', [targetLanguage, sourceLanguage])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = (versions ?? []) as any[]
  const existingTarget = new Set(all.filter(v => v.language === targetLanguage).map(v => v.itinerary_service_id))
  const sourceById = new Map(all.filter(v => v.language === sourceLanguage).map(v => [v.itinerary_service_id, v]))

  const rows = []
  // Sequential: an external model, and a whole trip in parallel is a
  // rate-limit incident.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const service of services as any[]) {
    if (existingTarget.has(service.id)) continue
    const sourceContent = sourceById.get(service.id) || service
    const translatedContent = await translateFields(sourceContent, SERVICE_TRANSLATION_FIELDS, sourceLanguage, targetLanguage)
    rows.push({
      itinerary_service_id: service.id,
      language: targetLanguage,
      service_name: translatedContent.service_name || sourceContent.service_name || null,
      notes: translatedContent.notes || sourceContent.notes || null,
    })
  }
  if (rows.length === 0) return []

  // One round trip; row by row only when the batch is refused (one conflict —
  // a version created concurrently — must not void the rest).
  const { data, error } = await supabase.from('itinerary_service_versions').insert(rows).select()
  if (!error) return data ?? []
  const created = []
  for (const row of rows) {
    const { data: one, error: rowError } = await supabase.from('itinerary_service_versions').insert(row).select().single()
    if (rowError) console.error('[service-translations] Row insert failed:', rowError)
    else created.push(one)
  }
  return created
}
