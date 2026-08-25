import { NextRequest, NextResponse } from 'next/server'
import { quoteInOrg, quoteNotFound } from '@/lib/b2b/quote-scope'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { createClient } from '@supabase/supabase-js'
import { translateFields, QUOTE_TRANSLATION_FIELDS } from '@/lib/translation-utils'
import type { Language } from '@/types/multilingual'
import { getServerLocale, lookupServerMessage } from '@/lib/i18n/server-messages'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST - Copy existing version and translate to target language
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    // TENANT BOUNDARY — see lib/b2b/quote-scope.ts. The quote is addressed by an
    // id from the URL on a service-role client; without this, one organisation
    // reaches another's quote.
    if (!(await quoteInOrg(supabaseAdmin, id, orgId))) return quoteNotFound()
    const body = await request.json()
    const { targetLanguage } = body

    // Validate target language
    if (!targetLanguage || !['en', 'ja'].includes(targetLanguage)) {
      return NextResponse.json(
        { success: false, error: 'Invalid target language. Must be "en" or "ja"' },
        { status: 400 }
      )
    }

    // Check if target version already exists
    const { data: existing } = await supabaseAdmin
      .from('quote_versions')
      .select('id')
      .eq('quote_id', id)
      .eq('language', targetLanguage)
      .single()

    if (existing) {
      return NextResponse.json(
        { success: false, error: `${targetLanguage.toUpperCase()} version already exists` },
        { status: 409 }
      )
    }

    // Find source version (the other language)
    const sourceLanguage: Language = targetLanguage === 'en' ? 'ja' : 'en'

    const { data: sourceVersion, error: sourceError } = await supabaseAdmin
      .from('quote_versions')
      .select('*')
      .eq('quote_id', id)
      .eq('language', sourceLanguage)
      .single()

    if (sourceError || !sourceVersion) {
      // If no version exists, try to get content from main quote
      const { data: quote } = await supabaseAdmin
        .from('tour_quotes')
        .select('quote_number, notes')
        .eq('id', id)
        .single()

      if (!quote) {
        return NextResponse.json(
          { success: false, error: 'No source content found to translate' },
          { status: 404 }
        )
      }

      // Use quote as source - create a minimal source object
      const sourceContent = {
        title: `Quote ${quote.quote_number}`,
        notes: quote.notes || null,
        terms_conditions: null,
        special_requests: null
      }

      const translatedContent = await translateFields(
        sourceContent,
        QUOTE_TRANSLATION_FIELDS,
        'en' as Language, // Assume original content is English
        targetLanguage as Language
      )

      const { data: newVersion, error: createError } = await supabaseAdmin
        .from('quote_versions')
        .insert({
          quote_id: id,
          language: targetLanguage,
          title: translatedContent.title || sourceContent.title,
          notes: translatedContent.notes || null,
          terms_conditions: translatedContent.terms_conditions || null,
          special_requests: translatedContent.special_requests || null
        })
        .select()
        .single()

      if (createError) throw createError

      return NextResponse.json({
        success: true,
        data: newVersion,
        translated: true,
        sourceLanguage: 'en',
        targetLanguage
      })
    }

    // Translate the source version content
    const translatedContent = await translateFields(
      sourceVersion,
      QUOTE_TRANSLATION_FIELDS,
      sourceLanguage,
      targetLanguage as Language
    )

    // Create the new version with translated content
    const { data: newVersion, error: createError } = await supabaseAdmin
      .from('quote_versions')
      .insert({
        quote_id: id,
        language: targetLanguage,
        title: translatedContent.title || sourceVersion.title,
        notes: translatedContent.notes || null,
        terms_conditions: translatedContent.terms_conditions || null,
        special_requests: translatedContent.special_requests || null
      })
      .select()
      .single()

    if (createError) throw createError

    return NextResponse.json({
      success: true,
      data: newVersion,
      translated: true,
      sourceLanguage,
      targetLanguage
    })
  } catch (error: any) {
    console.error('Error in copy-translate:', error)
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
