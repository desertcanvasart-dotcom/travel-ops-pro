// ============================================
// TOUR PRICE RECALCULATION API
// File: app/api/tours/recalculate-prices/route.ts
//
// Recalculates and caches "starting from" prices for all tours.
// Can be called manually or via a cron job.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { getTemplatePriceRange } from '@/lib/auto-pricing-service'
import { requireRole } from '@/lib/auth/current-org'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ============================================
// WHO MAY RUN THIS
// ============================================
// This route is on the middleware self-auth allowlist, so middleware performs NO
// session check on it — whatever guard exists has to be here. What was here did
// not guard anything:
//
//   if (cronSecret && secret !== cronSecret) {
//     const authHeader = request.headers.get('authorization')
//     if (!authHeader) return 401
//   }
//
// The header was tested for EXISTENCE, so `Authorization: x` with a wrong
// ?secret= passed; and with CRON_SECRET unset the whole block was skipped and
// the endpoint was simply public. Either way an anonymous caller could rewrite
// the cached "from" price on every tour in the catalogue, repeatedly, each run
// walking the entire pricing engine.
//
// Two ways in now, and nothing else:
//   1. the scheduler, proving it holds CRON_SECRET (constant-time compare);
//   2. a signed-in manager or above, the same audience as the rate tables.
// With no CRON_SECRET configured the machine path is simply CLOSED rather than
// open to everyone — an unset secret must never be the thing that unlocks it.

function presentedSecret(request: NextRequest): string | null {
  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (bearer) return bearer
  return new URL(request.url).searchParams.get('secret')
}

function secretMatches(presented: string | null): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected || !presented) return false
  const a = Buffer.from(presented)
  const b = Buffer.from(expected)
  // timingSafeEqual throws on a length mismatch, which would itself leak length.
  return a.length === b.length && timingSafeEqual(a, b)
}

/** null = allowed; a NextResponse = the refusal to return. */
async function authorize(request: NextRequest): Promise<NextResponse | null> {
  if (secretMatches(presentedSecret(request))) return null
  return requireRole(['admin', 'manager'])
}

export async function POST(request: NextRequest) {
  try {
    const denied = await authorize(request)
    if (denied) return denied

    // Parse request body for optional template ID
    let templateId: string | null = null
    try {
      const body = await request.json()
      templateId = body.templateId || null
    } catch {
      // No body provided, recalculate all
    }

    console.log('🔄 Starting price recalculation...')
    const startTime = Date.now()

    // Fetch templates to recalculate
    let query = supabaseAdmin
      .from('tour_templates')
      .select('id, template_name, duration_days, uses_day_builder, pricing_mode')
      .eq('is_active', true)

    if (templateId) {
      query = query.eq('id', templateId)
    }

    const { data: templates, error } = await query

    if (error) {
      console.error('Error fetching templates:', error)
      return NextResponse.json(
        { success: false, error: clientMessage(error, 'Internal server error') },
        { status: 500 }
      )
    }

    if (!templates || templates.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No templates to recalculate',
        updated: 0
      })
    }

    console.log(`📋 Found ${templates.length} templates to process`)

    const results: { id: string; name: string; price: number | null; tier: string | null; error?: string }[] = []

    // Process templates sequentially to avoid overwhelming the database
    for (const template of templates) {
      try {
        let startingPrice: number | null = null
        let startingTier: string | null = null

        // Only calculate auto-pricing for templates that use it
        if (template.uses_day_builder || template.pricing_mode === 'auto') {
          const priceRange = await getTemplatePriceRange(template.id)
          if (priceRange) {
            startingPrice = Math.round(priceRange.minPrice)
            startingTier = priceRange.tier
          }
        }

        // Fallback: check variation_pricing table
        if (startingPrice === null) {
          const { data: variations } = await supabaseAdmin
            .from('tour_variations')
            .select('id')
            .eq('template_id', template.id)
            .eq('is_active', true)

          if (variations && variations.length > 0) {
            const { data: pricing } = await supabaseAdmin
              .from('variation_pricing')
              .select('selling_price_per_person, tour_variations!inner(tier)')
              .in('variation_id', variations.map(v => v.id))
              .order('selling_price_per_person', { ascending: true })
              .limit(1)

            if (pricing && pricing.length > 0) {
              startingPrice = Math.round(pricing[0].selling_price_per_person)
              startingTier = (pricing[0] as any).tour_variations?.tier || 'standard'
            }
          }
        }

        // No final estimate fallback — deliberately. A duration×150 guess in a
        // sales catalogue reads as a real price; a template the engine cannot
        // price caches NULL and its card shows no price until it can.

        // Update the template with cached price
        const { error: updateError } = await supabaseAdmin
          .from('tour_templates')
          .update({
            cached_starting_price: startingPrice,
            cached_starting_tier: startingTier,
            cached_price_updated_at: new Date().toISOString()
          })
          .eq('id', template.id)

        if (updateError) {
          console.error(`❌ Error updating ${template.template_name}:`, updateError)
          results.push({
            id: template.id,
            name: template.template_name,
            price: null,
            tier: null,
            error: clientMessage(updateError, 'Internal server error')
          })
        } else {
          console.log(`✅ Updated ${template.template_name}: €${startingPrice} (${startingTier})`)
          results.push({
            id: template.id,
            name: template.template_name,
            price: startingPrice,
            tier: startingTier
          })
        }
      } catch (err: any) {
        console.error(`❌ Error processing ${template.template_name}:`, err)
        results.push({
          id: template.id,
          name: template.template_name,
          price: null,
          tier: null,
          error: clientMessage(err, 'Internal server error')
        })
      }
    }

    const duration = Date.now() - startTime
    const successCount = results.filter(r => !r.error).length
    const errorCount = results.filter(r => r.error).length

    console.log(`🏁 Price recalculation complete in ${duration}ms`)
    console.log(`   ✅ Success: ${successCount} | ❌ Errors: ${errorCount}`)

    return NextResponse.json({
      success: true,
      message: `Recalculated prices for ${successCount} templates`,
      duration_ms: duration,
      updated: successCount,
      errors: errorCount,
      results
    })

  } catch (error: any) {
    console.error('❌ Recalculation error:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Failed to recalculate prices') },
      { status: 500 }
    )
  }
}

// GET endpoint to check recalculation status.
// Gated too: it used to be wide open and returned the id and name of every
// active tour template, which is the operator's product catalogue.
export async function GET(request: NextRequest) {
  try {
    const denied = await authorize(request)
    if (denied) return denied

    // Check how many templates need price updates
    const { data: templates, error } = await supabaseAdmin
      .from('tour_templates')
      .select('id, template_name, cached_starting_price, cached_price_updated_at')
      .eq('is_active', true)

    if (error) {
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    const withPrice = templates?.filter(t => t.cached_starting_price !== null) || []
    const withoutPrice = templates?.filter(t => t.cached_starting_price === null) || []

    // Check for stale prices (older than 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const stalePrice = templates?.filter(t =>
      t.cached_price_updated_at && t.cached_price_updated_at < oneDayAgo
    ) || []

    return NextResponse.json({
      success: true,
      data: {
        total_templates: templates?.length || 0,
        with_cached_price: withPrice.length,
        without_cached_price: withoutPrice.length,
        stale_prices: stalePrice.length,
        templates_needing_update: withoutPrice.map(t => ({
          id: t.id,
          name: t.template_name
        }))
      }
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}
