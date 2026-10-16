import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { guardAiRate } from '@/lib/rate-limit/ai-limit'
import { findDefaultVariation, isWithdrawn } from '@/lib/tours/default-variation'
import {
  translateFields,
  TOUR_TEMPLATE_TRANSLATION_FIELDS,
  TOUR_VARIATION_TRANSLATION_FIELDS
} from '@/lib/translation-utils'
import { getServerLocale, lookupServerMessage } from '@/lib/i18n/server-messages'
import type { Language } from '@/types/multilingual'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Resolve code to its target. A programme without variations is still a valid
// translation target — the imported A.T.S catalogue is variation-less and its
// content lives at the template level (see ../route.ts resolveTarget).
// Within the caller's company only, and the same variation the tour page
// opens on (lib/tours/default-variation): active only, the company's default
// tier first. A withdrawn variation or tour is not translated.
const VARIATION_COLS = 'id, variation_code, variation_name, template_id, inclusions, exclusions, optional_extras, tier'
async function resolveTarget(code: string, orgId: string) {
  const { data: varByCode } = await supabase
    .from('tour_variations')
    .select(`${VARIATION_COLS}, is_active, tour_templates (is_active)`)
    .eq('org_id', orgId)
    .eq('variation_code', code)
    .maybeSingle()

  if (varByCode) {
    if (isWithdrawn(varByCode) || isWithdrawn((varByCode as any).tour_templates)) return 'withdrawn' as const
    return { template_id: varByCode.template_id as string, variation: varByCode }
  }

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code)
  const { data: template } = await supabase
    .from('tour_templates')
    .select('id, is_active')
    .eq('org_id', orgId)
    .eq(isUUID ? 'id' : 'template_code', code)
    .maybeSingle()

  if (!template) return null
  if (isWithdrawn(template)) return 'withdrawn' as const

  const variation = await findDefaultVariation<any>(supabase, orgId, template.id, VARIATION_COLS)
  return { template_id: template.id as string, variation: variation ?? null }
}

/** A failed version insert is the whole job failing — it used to be logged
 *  and the route answered success, so the page said "Translation completed"
 *  with no version saved. */
export function versionInsertFailed(error: { message?: string } | null | undefined): NextResponse | null {
  if (!error) return null
  return NextResponse.json(
    { success: false, error: `Could not save the translated version: ${error.message || 'unknown error'}` },
    { status: 500 }
  )
}

// POST - Copy and translate tour content to target language
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    // Writes catalogue content (admin/manager, as RLS has it for the version
    // tables — this service-role client bypasses RLS) and spends AI calls, so
    // it shares the per-user AI budget.
    const denied = await requireRole(['admin', 'manager'])
    if (denied) return denied
    const limited = await guardAiRate()
    if (limited) return limited
    const { code } = await params
    const body = await request.json()
    const { targetLanguage } = body

    // Validate target language
    if (!targetLanguage || !['en', 'ja'].includes(targetLanguage)) {
      return NextResponse.json(
        { success: false, error: 'Invalid target language. Must be "en" or "ja"' },
        { status: 400 }
      )
    }

    const target = await resolveTarget(code, orgId)
    if (target === 'withdrawn') {
      return NextResponse.json(
        { success: false, withdrawn: true, error: 'This tour is no longer offered' },
        { status: 410 }
      )
    }
    if (!target) {
      return NextResponse.json(
        { success: false, error: 'Tour not found' },
        { status: 404 }
      )
    }
    const variation = target.variation

    const sourceLanguage: Language = targetLanguage === 'en' ? 'ja' : 'en'
    const results: {
      variationVersion?: unknown
      templateVersion?: unknown
    } = {}

    // ===== VARIATION VERSION ===== (only when the programme has one)
    if (variation) {
    // Check if target variation version already exists
    const { data: existingVarVersion } = await supabase
      .from('tour_variation_versions')
      .select('id')
      .eq('variation_id', variation.id)
      .eq('language', targetLanguage)
      .single()

    if (!existingVarVersion) {
      // Try to get source version first
      const { data: sourceVarVersion } = await supabase
        .from('tour_variation_versions')
        .select('*')
        .eq('variation_id', variation.id)
        .eq('language', sourceLanguage)
        .single()

      // Use source version or main variation content
      const varSourceContent = sourceVarVersion || {
        variation_name: variation.variation_name,
        inclusions: variation.inclusions,
        exclusions: variation.exclusions,
        optional_extras: variation.optional_extras
      }

      // Translate variation content
      const translatedVarContent = await translateFields(
        varSourceContent,
        TOUR_VARIATION_TRANSLATION_FIELDS,
        sourceLanguage,
        targetLanguage as Language
      )

      // Create variation version
      const { data: newVarVersion, error: varError } = await supabase
        .from('tour_variation_versions')
        .insert({
          variation_id: variation.id,
          language: targetLanguage,
          variation_name: translatedVarContent.variation_name || varSourceContent.variation_name || 'Untitled Variation',
          inclusions: translatedVarContent.inclusions || varSourceContent.inclusions || [],
          exclusions: translatedVarContent.exclusions || varSourceContent.exclusions || [],
          optional_extras: translatedVarContent.optional_extras || varSourceContent.optional_extras || []
        })
        .select()
        .single()

      if (varError) console.error('Error creating variation version:', varError)
      const failed = versionInsertFailed(varError)
      if (failed) return failed
      results.variationVersion = newVarVersion
    }

    }

    // ===== TEMPLATE VERSION =====
    // Check if target template version already exists
    const { data: existingTmpVersion } = await supabase
      .from('tour_template_versions')
      .select('id')
      .eq('template_id', target.template_id)
      .eq('language', targetLanguage)
      .single()

    if (!existingTmpVersion) {
      // Get the template
      const { data: template } = await supabase
        .from('tour_templates')
        .select('template_name, short_description, long_description, highlights, main_attractions, best_for, inclusions, exclusions')
        .eq('org_id', orgId)
        .eq('id', target.template_id)
        .single()

      // Try to get source version first
      const { data: sourceTmpVersion } = await supabase
        .from('tour_template_versions')
        .select('*')
        .eq('template_id', target.template_id)
        .eq('language', sourceLanguage)
        .single()

      // Use source version or main template content
      const tmpSourceContent = sourceTmpVersion || template

      if (tmpSourceContent) {
        // Translate template content
        const translatedTmpContent = await translateFields(
          tmpSourceContent,
          TOUR_TEMPLATE_TRANSLATION_FIELDS,
          sourceLanguage,
          targetLanguage as Language
        )

        // Create template version
        const { data: newTmpVersion, error: tmpError } = await supabase
          .from('tour_template_versions')
          .insert({
            template_id: target.template_id,
            language: targetLanguage,
            template_name: translatedTmpContent.template_name || tmpSourceContent.template_name || 'Untitled Tour',
            short_description: translatedTmpContent.short_description || tmpSourceContent.short_description || null,
            long_description: translatedTmpContent.long_description || tmpSourceContent.long_description || null,
            highlights: translatedTmpContent.highlights || tmpSourceContent.highlights || [],
            main_attractions: translatedTmpContent.main_attractions || tmpSourceContent.main_attractions || [],
            best_for: translatedTmpContent.best_for || tmpSourceContent.best_for || [],
            inclusions: translatedTmpContent.inclusions || tmpSourceContent.inclusions || [],
            exclusions: translatedTmpContent.exclusions || tmpSourceContent.exclusions || []
          })
          .select()
          .single()

        if (tmpError) console.error('Error creating template version:', tmpError)
        const failed = versionInsertFailed(tmpError)
        if (failed) return failed
        results.templateVersion = newTmpVersion
      }
    }

    // The Daily Itinerary is not translated: there is no versions table for
    // it, and nothing stored or showed the translated days — one paid AI call
    // per day, thrown away (the page shows the days in the base language).

    return NextResponse.json({
      success: true,
      data: results,
      translated: true,
      sourceLanguage,
      targetLanguage
    })
  } catch (error: any) {
    console.error('Error in tour copy-translate:', error)
    // Localized translation-failure surface (same pattern + keys as the
    // itineraries copy-translate route). translateText throws on systemic
    // failure, so this no longer silently produces an untranslated version.
    const locale = await getServerLocale()
    return NextResponse.json(
      {
        success: false,
        error: lookupServerMessage(locale, 'translate.errors.versionFailed', { reason: error?.message || 'Unknown error' })
      },
      { status: 500 }
    )
  }
}
