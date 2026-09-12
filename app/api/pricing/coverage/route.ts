// ============================================
// GET /api/pricing/coverage
// Rate-coverage report: runs the strict day-based engine across the active
// tour templates × tiers and lists every rate-data hole, so gaps are found
// before a customer hits them.
//
// Query params:
//   templateId    optional — scope to one template (else all active, capped)
//   tier          optional — a single tier, or 'all' (default 'standard')
//   isEurPassport optional — 'false' to use non-EUR rates (default true)
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { calculateDayBasedPricing, type ServiceTier } from '@/lib/auto-pricing-service'
import { computeCoverage } from '@/lib/pricing-coverage'
import { tierLadderForCurrentOrg } from '@/lib/vocabulary-server'

// Service-role client, matching ours' other tour-template routes; the /api/*
// middleware gate handles authentication. Pricing/templates are single-org here.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MAX_TEMPLATES = 25 // bound the work for a single diagnostic request

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const templateId = searchParams.get('templateId')
    const tierParam = searchParams.get('tier')
    const isEurPassport = searchParams.get('isEurPassport') !== 'false'

    // 'all' = every tier on the agency's ladder (Settings → Vocabulary)
    const ALL_TIERS: ServiceTier[] = await tierLadderForCurrentOrg()
    const tiers: ServiceTier[] =
      tierParam === 'all'
        ? ALL_TIERS
        : tierParam && ALL_TIERS.includes(tierParam as ServiceTier)
          ? [tierParam as ServiceTier]
          : ['standard']

    let query = supabaseAdmin
      .from('tour_templates')
      .select('id, template_name')
      .eq('is_active', true)
      .order('template_name', { ascending: true })

    if (templateId) query = query.eq('id', templateId)

    const { data: templatesData, error } = await query
    if (error) {
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    const all = (templatesData || []).map((t: any) => ({ id: t.id, name: t.template_name }))
    const truncated = all.length > MAX_TEMPLATES
    const templates = all.slice(0, MAX_TEMPLATES)

    const report = await computeCoverage({
      templates,
      tiers,
      isEurPassport,
      calc: (args) => calculateDayBasedPricing(args),
    })

    return NextResponse.json({
      success: true,
      tiers,
      isEurPassport,
      truncated,
      ...report,
    })
  } catch (e: any) {
    console.error('Pricing coverage error:', e)
    return NextResponse.json(
      { success: false, error: clientMessage(e, 'Coverage report failed') },
      { status: 500 }
    )
  }
}
