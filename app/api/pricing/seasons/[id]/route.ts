import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { isHexColour, parseUpliftPercent } from '@/lib/pricing/season-admin'

// PATCH — rename, re-price, recolour, activate/deactivate one season.
// DELETE — remove it and its windows (ON DELETE CASCADE). Nothing references a
// season historically: a quote stores the money it was charged, not a link, so
// deleting a season never rewrites a past price.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params
    const body = await request.json()
    const update: Record<string, unknown> = {}

    if ('name' in body) {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name) return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 })
      update.name = name
    }
    if ('uplift_percent' in body) {
      const uplift = parseUpliftPercent(body.uplift_percent)
      if (uplift === null) {
        return NextResponse.json({ success: false, error: 'Premium must be between 0 and 200' }, { status: 400 })
      }
      update.uplift_percent = uplift
    }
    if ('colour' in body && isHexColour(body.colour)) {
      update.colour = body.colour
    }
    if ('display_order' in body && Number.isFinite(Number(body.display_order))) {
      update.display_order = Number(body.display_order)
    }
    if ('is_active' in body) update.is_active = !!body.is_active

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 })
    }
    update.updated_at = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('pricing_seasons')
      .update(update)
      .eq('id', id)
      .eq('org_id', orgId)
      .select('id, name, uplift_percent, colour, display_order, is_active')
      .maybeSingle()

    if (error) {
      if ((error as any).code === '23505') {
        return NextResponse.json({ success: false, error: 'A season with that name already exists' }, { status: 400 })
      }
      console.error('Error updating pricing season:', error)
      return NextResponse.json({ success: false, error: 'Failed to update season' }, { status: 500 })
    }
    // No row means it belongs to another org, or never existed. Same answer for
    // both, so this cannot be used to discover somebody else's seasons.
    if (!data) return NextResponse.json({ success: false, error: 'Season not found' }, { status: 404 })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in season PATCH:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params
    const { data, error } = await supabaseAdmin
      .from('pricing_seasons')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId)
      .select('id')
      .maybeSingle()

    if (error) {
      console.error('Error deleting pricing season:', error)
      return NextResponse.json({ success: false, error: 'Failed to delete season' }, { status: 500 })
    }
    if (!data) return NextResponse.json({ success: false, error: 'Season not found' }, { status: 404 })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in season DELETE:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
