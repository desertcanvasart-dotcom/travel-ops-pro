import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createActorAdminClient } from '@/lib/supabase-actor'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { rowInOrg, notFoundInOrg } from '@/lib/api/org-scope'
import { validateRatePayload } from '@/lib/rate-validation'
import { knownAirlineCode } from '@/lib/airline-codes'
import { flightPeriodsPatch } from '@/lib/rates/flight-write'
import { validateAndResolveSupplierFields } from '@/lib/suppliers/validate-supplier-fields'
import { OWN_SUPPLIER_EMBED, ownSupplierOnRow } from '@/lib/rates/own-supplier-embed'
import { rateDeleteBlocked } from '@/lib/rates/rate-delete-guard'

// ============================================
// FLIGHT RATES API - Single Record
// File: app/api/rates/flights/[id]/route.ts
// ============================================

// Service-role client that names the signed-in user to the audit trigger (rate_audit_log.changed_by)
const supabaseAdmin = createActorAdminClient()

// GET - Single flight rate by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params
    if (!(await rowInOrg(supabaseAdmin, 'flight_rates', id, orgId))) return notFoundInOrg('Rate')

    const { data, error } = await supabaseAdmin
      .from('flight_rates')
      .select(`*, ${OWN_SUPPLIER_EMBED}`)
      .eq('org_id', orgId)
      .eq('id', id)
      .single()

    if (error) {
      console.error('GET flight_rates/[id] error:', error)
      return NextResponse.json({ success: false, error: 'Flight rate not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: ownSupplierOnRow(data, orgId) })
  } catch (error: any) {
    console.error('GET flight_rates/[id] catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// PUT - Update single flight rate
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params
    if (!(await rowInOrg(supabaseAdmin, 'flight_rates', id, orgId))) return notFoundInOrg('Rate')
    const body = await request.json()

    // Remove id from body to avoid conflicts
    // ...and org_id: a rate stays in its company.
    const { id: _, ...updates } = body
    delete updates.org_id

    // The edit is held to what the create is held to — the form saves edits
    // HERE, and this route stored whatever it was sent.
    const rateCheck = validateRatePayload(updates)
    if (!rateCheck.ok) {
      return NextResponse.json({ error: 'Invalid rate values', violations: rateCheck.errors }, { status: 400 })
    }

    // A supplier in the patch must be this company's ('__none__' = none):
    // the raw spread stored any id, another company's included.
    if ('supplier_id' in updates || 'supplier_name' in updates) {
      const supplierCheck = await validateAndResolveSupplierFields(updates, supabaseAdmin, orgId)
      if (!supplierCheck.ok) {
        return NextResponse.json({ success: false, error: supplierCheck.error }, { status: supplierCheck.status })
      }
      updates.supplier_id = supplierCheck.supplier_id
      updates.supplier_name = supplierCheck.supplier_name
    }

    // The periods: sanitized, held to the period limit, and the FIRST one
    // mirrored onto the base columns every date-less reader takes (the grid's
    // option price, the CSV export). Stored raw here, an edited first fare
    // left base_rate_eur, tax_eur and guide_rate on the old values
    // (lib/rates/flight-write). Applied after the numeric parsing below.
    let periodPatch: Record<string, unknown> = {}
    if ('seasons' in updates) {
      const periods = flightPeriodsPatch(updates.seasons)
      if (!periods.ok) return NextResponse.json({ success: false, error: periods.error }, { status: 400 })
      periodPatch = periods.patch
      delete updates.seasons
    }

    // The carrier code follows the airline, as on create: the one the form
    // sends (an air carrier's IATA code), else the one known for the name.
    if (updates.airline && !updates.airline_code) updates.airline_code = knownAirlineCode(updates.airline)

    // Regenerate route_name if route fields changed
    if (updates.route_from || updates.route_to) {
      const { data: current } = await supabaseAdmin
        .from('flight_rates')
        .select('*')
        .eq('org_id', orgId)
        .eq('id', id)
        .single()

      if (current) {
        const merged = { ...current, ...updates }
        updates.route_name = updates.route_name || `${merged.route_from} to ${merged.route_to}`
      }
    }

    // Parse numeric fields
    if (updates.base_rate_eur !== undefined) {
      updates.base_rate_eur = parseFloat(updates.base_rate_eur) || 0
    }
    // Throughout-guide fare: blank clears back to NULL = pays the customer rate.
    if (updates.guide_rate !== undefined) {
      updates.guide_rate = updates.guide_rate === '' || updates.guide_rate === null ? null : parseFloat(updates.guide_rate)
    }
    if (updates.base_rate_non_eur !== undefined) {
      updates.base_rate_non_eur = parseFloat(updates.base_rate_non_eur) || 0
    }
    if (updates.tax_eur !== undefined) {
      updates.tax_eur = parseFloat(updates.tax_eur) || 0
    }
    if (updates.tax_non_eur !== undefined) {
      updates.tax_non_eur = parseFloat(updates.tax_non_eur) || 0
    }
    if (updates.duration_minutes !== undefined) {
      updates.duration_minutes = updates.duration_minutes ? parseInt(updates.duration_minutes) : null
    }
    if (updates.baggage_kg !== undefined) {
      updates.baggage_kg = updates.baggage_kg ? parseInt(updates.baggage_kg) : null
    }
    if (updates.carry_on_kg !== undefined) {
      updates.carry_on_kg = updates.carry_on_kg ? parseInt(updates.carry_on_kg) : null
    }
    Object.assign(updates, periodPatch)

    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('flight_rates')
      .update(updates)
      .eq('org_id', orgId)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      console.error('PUT flight_rates/[id] error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('PUT flight_rates/[id] catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// DELETE - Delete single flight rate
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params
    if (!(await rowInOrg(supabaseAdmin, 'flight_rates', id, orgId))) return notFoundInOrg('Rate')

    // In use → refused with what uses it (lib/rates/rate-delete-guard).
    const blocked = await rateDeleteBlocked(supabaseAdmin, orgId, id)
    if (blocked) return NextResponse.json({ success: false, error: blocked }, { status: 409 })

    const { error } = await supabaseAdmin
      .from('flight_rates')
      .delete()
      .eq('org_id', orgId)
      .eq('id', id)

    if (error) {
      console.error('DELETE flight_rates/[id] error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE flight_rates/[id] catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}