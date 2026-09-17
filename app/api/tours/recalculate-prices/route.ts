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
import { installOrgId, refreshStartingPrices } from '@/lib/tours/starting-price'
import { getCurrentOrgId, requireRole } from '@/lib/auth/current-org'

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

    // Optional: one template, e.g. { templateId }.
    let templateId: string | null = null
    try {
      const body = await request.json()
      templateId = body.templateId || null
    } catch {
      // No body: every active template.
    }

    const startTime = Date.now()
    // The org: the signed-in user's, else (the scheduler) the install's one.
    const orgId = (await getCurrentOrgId()) ?? (await installOrgId(supabaseAdmin))
    // Same basis and rule everywhere — lib/tours/starting-price.
    const results = await refreshStartingPrices(supabaseAdmin, orgId, templateId ? [templateId] : undefined)
    const errorCount = results.filter(x => x.error).length

    return NextResponse.json({
      success: true,
      message: `Recalculated prices for ${results.length - errorCount} templates`,
      duration_ms: Date.now() - startTime,
      updated: results.length - errorCount,
      errors: errorCount,
      results: results.map(x => ({
        id: x.id,
        name: x.name,
        price: x.result?.price ?? null,
        tier: x.result?.tier ?? null,
        complete: x.result?.complete ?? null,
        gaps: x.result?.gaps ?? null,
        ...(x.error ? { error: clientMessage(new Error(x.error), 'Internal server error') } : {}),
      })),
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
