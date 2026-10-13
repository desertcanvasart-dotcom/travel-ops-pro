// ============================================
// Tour Manager's form → the request bodies it sends
// ============================================
// Pure, so the page's save and variation-create bodies are pinned without a
// browser (__tests__/lib/tour-template-form.test.ts).

/**
 * The template fields the Add / Edit form SHOWS an input for. Only these are
 * sent. The form used to send its whole state, and five fields it has no
 * input for were filled with constants when a template was opened
 * (age_suitability 'all_ages', pickup_required true, meals_included [],
 * default_transportation_service 'day_tour', transportation_city 'Cairo') —
 * so editing only the name of a template imported with "Meals Included =
 * Lunch; Pickup Required = false" reset both. PUT writes only what it is
 * given, so a field left out keeps its stored value.
 */
export const TEMPLATE_FORM_FIELDS = [
  'template_name', 'theme_key', 'tour_type', 'duration_days', 'duration_nights',
  'cities_covered', 'website_url', 'short_description', 'is_featured', 'is_active',
  'pricing_mode', 'highlights', 'main_attractions', 'itinerary', 'inclusions',
  'exclusions', 'best_for', 'physical_level',
] as const

/** The POST / PUT body: the form's own fields, plus the code when one is
 *  typed. A blank code is left to the server — it generates one on create
 *  (retrying a clash) and keeps the stored one on edit. */
export function templateSaveBody(form: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  for (const k of TEMPLATE_FORM_FIELDS) if (form[k] !== undefined) body[k] = form[k]
  const code = typeof form.template_code === 'string' ? form.template_code.trim() : ''
  if (code) body.template_code = code
  return body
}

export interface TierDefaults {
  min_pax: number
  max_pax: number
  group_type: 'private' | 'shared'
  vehicle_type: string
  accommodation_standard: string
  meal_quality: string
}

/**
 * One POST /api/tours/variations row per chosen tier. A tier the agency added
 * in Settings › Vocabulary has no preset: `configFor` answers undefined and
 * the `fallback` defaults stand in, and its name is the vocabulary's label.
 * (Reading `.label` off the missing preset threw — the Add Variations button
 * stuck on "Creating…", and the create form reported "Failed to save
 * template" AFTER the template was made, so a second click made a twin.)
 */
export function variationPayloads(opts: {
  templateId: string
  templateName: string
  tiers: Iterable<string>
  groupTypes: Record<string, 'private' | 'shared' | undefined>
  configFor: (tier: string) => { defaults: TierDefaults } | undefined
  fallback: TierDefaults
  labelFor: (tier: string) => string
}) {
  return Array.from(opts.tiers).map(tier => {
    const d = opts.configFor(tier)?.defaults ?? opts.fallback
    return {
      template_id: opts.templateId,
      variation_name: `${opts.templateName} - ${opts.labelFor(tier) || tier}`,
      tier,
      group_type: opts.groupTypes[tier] ?? d.group_type,
      min_pax: d.min_pax,
      max_pax: d.max_pax,
      vehicle_type: d.vehicle_type,
      accommodation_standard: d.accommodation_standard,
      meal_quality: d.meal_quality,
    }
  })
}
