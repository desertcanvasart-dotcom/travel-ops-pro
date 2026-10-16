// ============================================
// The template's English version row follows the template
// ============================================
// Copy & Translate (/api/tours/[code]/versions/copy-translate) translates
// FROM the stored tour_template_versions row when there is one, and the 'en'
// row used to be written once, when the template was created. Rename a
// template or rewrite its description in Tour Manager and the Japanese came
// out translated from the original text. Every write of the template's
// translatable text (PUT, bulk import, duplicate) now mirrors it into the 'en'
// row, built from the SAVED template row so it is never partial.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

type TemplateRow = {
  id: string
  template_name: string
  short_description?: string | null
  long_description?: string | null
  highlights?: string[] | null
  main_attractions?: string[] | null
  best_for?: string[] | null
  inclusions?: string[] | null
  exclusions?: string[] | null
  itinerary?: unknown
}

/** The 'en' tour_template_versions row for a saved template. */
export function englishVersionOf(t: TemplateRow) {
  return {
    template_id: t.id,
    language: 'en',
    template_name: t.template_name,
    short_description: t.short_description ?? null,
    long_description: t.long_description ?? null,
    highlights: t.highlights ?? [],
    main_attractions: t.main_attractions ?? [],
    best_for: t.best_for ?? [],
    inclusions: t.inclusions ?? [],
    exclusions: t.exclusions ?? [],
    itinerary: t.itinerary ?? null,
    updated_at: new Date().toISOString(),
  }
}

/** Upsert the 'en' row on (template_id, language). Returns the write's error. */
export async function syncEnglishVersion(db: Db, t: TemplateRow): Promise<{ message?: string } | null> {
  const { error } = await db
    .from('tour_template_versions')
    .upsert(englishVersionOf(t), { onConflict: 'template_id,language' })
  return error ?? null
}
