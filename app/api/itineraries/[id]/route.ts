import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'
import { recordsInOrg } from '@/lib/org-refs'
import { buildFrozenFx, parseFrozenFx } from '@/lib/itinerary-fx'
import { getOrgRateCurrency } from '@/lib/org-rate-currency'
import { paymentRuleFrom } from '@/lib/payment-schedule'
import { buildBookingRow, populateSuppliersFromItinerary } from '@/lib/booking-creation'
import { templateInOrg } from '@/lib/tours/org-scope'
import { rowInOrg } from '@/lib/api/org-scope'
import { loadTripVatExtras } from '@/lib/vat'
import { checkAmountDeliverable } from '@/lib/pricing-guards'
import { insertBookingWithCode } from '@/lib/bookings/booking-code'
import { isItineraryStatus, ITINERARY_STATUSES } from '@/lib/itineraries/statuses'
import { loadTripDeleteFacts, removeTripFiles, tripDeleteBlockers, tripDeleteRefusal } from '@/lib/itineraries/trip-delete'

/**
 * May this trip become a booking? The same gate /api/bookings/from-quote runs
 * on a quote's price: a booking's deposit is a share of its total, so a trip
 * with no usable price (a ¥0 draft) would put a ¥0 deposit in front of the
 * client. Returns the refusal, or null.
 */
export function bookingPriceRefusal(itinerary: { total_cost?: unknown; currency?: unknown }): { error: string; violations: string[] } | null {
  const amount = itinerary.total_cost == null || itinerary.total_cost === '' ? null : Number(itinerary.total_cost)
  const check = checkAmountDeliverable(amount, { currency: (itinerary.currency as string | null) ?? null })
  if (check.ok) return null
  return {
    error: 'This trip has no usable price yet, so it cannot be booked. Price it (Pricing grid or the editor) first.',
    violations: check.violations,
  }
}

// Server-side admin client — bypasses RLS for reliable reads/writes
const supabase = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
// Keep alias for existing references in the file
const supabaseAdmin = supabase

// GET - Used by VIEW page
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params

    const { data, error } = await supabase
      .from('itineraries')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .single()

    if (error) throw error

    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Itinerary not found' },
        { status: 404 }
      )
    }

    // Fetch language versions
    const { data: versions, error: versionsError } = await supabase
      .from('itinerary_versions')
      .select('*')
      .eq('itinerary_id', id)

    // Build versions object keyed by language
    const versionsMap: Record<string, any> = {}
    if (!versionsError && versions) {
      versions.forEach((v: { language: string; [key: string]: any }) => {
        versionsMap[v.language] = v
      })
    }

    const availableLanguages = Object.keys(versionsMap)

    // The language the client reads, so the page can say when the trip is
    // not written in it. Free text on the client record; the page normalises
    // it (lib/itineraries/content-language.ts). A missing client is no answer.
    let clientPreferredLanguage: string | null = null
    if (data.client_id) {
      const { data: client } = await supabase
        .from('clients')
        .select('preferred_language')
        .eq('id', data.client_id)
        .eq('org_id', orgId)
        .maybeSingle()
      clientPreferredLanguage = client?.preferred_language ?? null
    }

    // The client price of the trip's extras lines, which its VAT leaves out
    // (lib/vat.ts) — for the contract, which states VAT without the lines.
    const vatExcluded = data.vat_applied === true ? (await loadTripVatExtras(supabase, id)).vat_excluded : 0

    return NextResponse.json({
      success: true,
      data: {
        ...data,
        available_languages: availableLanguages,
        versions: versionsMap,
        client_preferred_language: clientPreferredLanguage,
        ...(vatExcluded > 0 ? { vat_excluded: vatExcluded } : {}),
      }
    })
  } catch (error) {
    console.error('Error fetching itinerary:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch itinerary',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// PUT - Used by EDIT page AND ResourceAssignment
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params
    const body = await request.json()

    // Prepare update data - include ALL fields that might be sent
    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    // Basic itinerary fields
    if (body.client_name !== undefined) updateData.client_name = body.client_name
    if (body.client_email !== undefined) updateData.client_email = body.client_email
    if (body.client_phone !== undefined) updateData.client_phone = body.client_phone
    if (body.trip_name !== undefined) updateData.trip_name = body.trip_name
    // The programme this trip follows, so its 日程表 can be generated from the
    // record. Null clears the link.
    // The company's own programme only (tour_templates.org_id, 20261207).
    if (body.template_id !== undefined) {
      if (body.template_id && !(await templateInOrg(supabase, orgId, body.template_id))) {
        return NextResponse.json({ error: 'Programme not found' }, { status: 404 })
      }
      updateData.template_id = body.template_id || null
    }
    if (body.start_date !== undefined) updateData.start_date = body.start_date
    if (body.end_date !== undefined) updateData.end_date = body.end_date
    if (body.num_adults !== undefined) updateData.num_adults = body.num_adults
    if (body.num_children !== undefined) updateData.num_children = body.num_children
    if (body.total_cost !== undefined) updateData.total_cost = body.total_cost
    // One of the statuses every screen and rule knows — any string was stored.
    if (body.status !== undefined) {
      if (!isItineraryStatus(body.status)) {
        return NextResponse.json(
          { success: false, error: `Unknown status. Use one of: ${ITINERARY_STATUSES.join(', ')}` },
          { status: 400 }
        )
      }
      updateData.status = body.status
    }
    // Why a trip was cancelled (the itinerary page's Cancel trip dialog).
    if (body.cancellation_reason !== undefined) updateData.cancellation_reason = body.cancellation_reason || null
    if (body.notes !== undefined) updateData.notes = body.notes

    // Resource fields. The guide is one of this company's suppliers
    // (suppliers.org_id, 20261205).
    if (body.assigned_guide_id !== undefined) {
      if (body.assigned_guide_id && !(await recordsInOrg(supabase, orgId, { supplier_id: body.assigned_guide_id }))) {
        return NextResponse.json({ error: 'Guide not found' }, { status: 404 })
      }
      updateData.assigned_guide_id = body.assigned_guide_id
    }
    // The vehicle is one of this company's (vehicles.org_id).
    if (body.assigned_vehicle_id !== undefined) {
      if (body.assigned_vehicle_id && (typeof body.assigned_vehicle_id !== 'string' ||
          !(await rowInOrg(supabase, 'vehicles', body.assigned_vehicle_id, orgId)))) {
        return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })
      }
      updateData.assigned_vehicle_id = body.assigned_vehicle_id || null
    }
    if (body.guide_notes !== undefined) updateData.guide_notes = body.guide_notes
    if (body.vehicle_notes !== undefined) updateData.vehicle_notes = body.vehicle_notes
    if (body.pickup_location !== undefined) updateData.pickup_location = body.pickup_location
    if (body.pickup_time !== undefined) updateData.pickup_time = body.pickup_time

    // Inclusions and exclusions
    if (body.inclusions !== undefined) updateData.inclusions = body.inclusions
    if (body.exclusions !== undefined) updateData.exclusions = body.exclusions

    // Get current itinerary status before update (for booking auto-creation
    // and the FX freeze below)
    let previousStatus: string | null = null
    if (body.status === 'confirmed') {
      const { data: currentItinerary } = await supabase
        .from('itineraries')
        .select('*')
        .eq('id', id)
        .eq('org_id', orgId)
        .single()
      previousStatus = currentItinerary?.status || null
      if (!currentItinerary) {
        return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
      }

      // Confirming books the trip (below), so it runs the booking's price
      // gate first: a ¥0 or unpriced draft set to Confirmed from the list made
      // a ¥0 booking with a ¥0 deposit. Nothing is written on a refusal.
      if (previousStatus !== 'confirmed') {
        const { data: booked } = await supabaseAdmin
          .from('bookings')
          .select('id')
          .eq('itinerary_id', id)
          .limit(1)
          .maybeSingle()
        const refusal = booked ? null : bookingPriceRefusal({
          total_cost: body.total_cost !== undefined ? body.total_cost : currentItinerary.total_cost,
          currency: currentItinerary.currency,
        })
        if (refusal) {
          return NextResponse.json({ success: false, code: 'unpriced', ...refusal }, { status: 422 })
        }
      }

      // ── FX freezes at approval ──
      // While a quotation is being prepared it converts at the current rate;
      // confirming freezes the rates in force onto the file, so its cost and
      // margin stop moving with the market. Frozen ONCE — a file that already
      // carries a snapshot keeps it (re-pricing is the explicit, logged path,
      // POST /api/itineraries/[id]/reprice-fx). The column-presence check
      // keeps this deploy-safe before migration 20260827_itinerary_fx_freeze
      // is applied. A freeze failure never blocks the confirmation itself.
      if (
        previousStatus !== 'confirmed' &&
        currentItinerary && 'fx_frozen' in currentItinerary &&
        !parseFrozenFx(currentItinerary.fx_frozen)
      ) {
        try {
          const rateCurrency = await getOrgRateCurrency(supabaseAdmin, orgId)
          updateData.fx_frozen = await buildFrozenFx(rateCurrency, await getCurrentUserId(), 'confirm')
        } catch (err) {
          console.warn('[itinerary] FX freeze at confirm failed (confirmation proceeds unfrozen):', err instanceof Error ? err.message : String(err))
        }
      }
    }

    const { data, error } = await supabase
      .from('itineraries')
      .update(updateData)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single()

    if (error) throw error

    // A cancelled trip's DRAFT supplier vouchers are cancelled with it (no
    // supplier has seen them), so they stop showing as work to send. Vouchers
    // already sent stay as they are: the supplier holds them, and marking them
    // cancelled here would hide that someone still has to tell the supplier.
    if (body.status === 'cancelled' && data) {
      const { error: voucherError } = await supabaseAdmin
        .from('supplier_documents')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('itinerary_id', id)
        .eq('org_id', orgId)
        .eq('status', 'draft')
      if (voucherError) console.warn('[itinerary] cancelling draft vouchers failed:', voucherError.message)
    }

    // Auto-create booking when status changes to "confirmed". A failure is
    // reported in the response (booking_error): it used to be only logged,
    // and the trip stood confirmed with no booking and nobody told.
    let bookingErrorMessage: string | null = null
    if (body.status === 'confirmed' && previousStatus !== 'confirmed' && data) {
      try {
        // Check if booking already exists (use admin client to bypass RLS)
        const { data: existingBooking } = await supabaseAdmin
          .from('bookings')
          .select('id')
          .eq('itinerary_id', id)
          .limit(1)
          .maybeSingle()

        if (!existingBooking) {
          // The SAME row builder as POST /api/bookings, with the operator's
          // payment rule. This block used to hand-roll the row — deposit 30%,
          // balance = total − deposit, no deposit percent, no due dates — so
          // every booking born from a status change carried a schedule the
          // office does not work to, and the Create Booking button, arriving
          // seconds later, answered "already exists" (2026-09-02, BKG-2026-
          // 0001..0004). Two entry points, one row shape.
          const { data: orgTerms } = await supabaseAdmin
            .from('organizations')
            .select('deposit_percent, deposit_due_days, balance_due_days_before_departure')
            .eq('id', orgId)
            .maybeSingle()
          const paymentRule = paymentRuleFrom(orgTerms)
          // Numbered per company; a code that is taken draws another.
          const { data: newBooking, error: bookingError, bookingCode } = await insertBookingWithCode<{ id: string }>(
            supabaseAdmin,
            orgId,
            code => buildBookingRow({
              orgId,
              bookingCode: code,
              itinerary: data,
              depositPercent: paymentRule.deposit_percent,
              partnerName: null,
              paymentRule,
            })
          )

          if (bookingError) {
            console.error('⚠️ Failed to create booking:', bookingError)
            bookingErrorMessage = 'The trip is confirmed, but its booking could not be created. Use Create booking on the itinerary page.'
          } else {
            console.log('✅ Auto-created booking for confirmed itinerary:', id, 'Code:', bookingCode)
            // Supplier manifest, shared with the bookings routes.
            if (newBooking) {
              const suppliers = await populateSuppliersFromItinerary(supabaseAdmin, newBooking.id, id)
              if (suppliers.error) console.error('Booking created but supplier manifest failed:', suppliers.error)
            }
          }
        }
      } catch (bookingError) {
        console.error('⚠️ Failed to auto-create booking:', bookingError)
        // Don't fail the itinerary update if booking creation fails — say so.
        bookingErrorMessage = 'The trip is confirmed, but its booking could not be created. Use Create booking on the itinerary page.'
      }
    }

    return NextResponse.json({
      success: true,
      data,
      ...(bookingErrorMessage ? { booking_error: bookingErrorMessage } : {}),
    })
  } catch (error) {
    console.error('Error updating itinerary:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update itinerary',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// DELETE - Delete an itinerary and all related data
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params

    console.log('🗑️ Deleting itinerary:', id)

    // Verify the itinerary belongs to this org before touching child rows
    const { data: itinerary } = await supabase
      .from('itineraries')
      .select('id, status')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!itinerary) {
      return NextResponse.json(
        { success: false, error: 'Itinerary not found' },
        { status: 404 }
      )
    }

    // A trip with a booking, money, invoices or sent paperwork is cancelled,
    // never deleted: the cascade below would take all of it with the trip.
    const facts = await loadTripDeleteFacts(supabase, id, orgId, itinerary.status ?? null)
    const blockers = tripDeleteBlockers(facts)
    if (blockers.length > 0) {
      return NextResponse.json({ success: false, code: 'trip_in_use', error: tripDeleteRefusal(blockers), reasons: blockers }, { status: 409 })
    }

    // The PDFs stored for this trip go first; if they cannot be removed the
    // trip is kept, so nothing with a customer's name is orphaned in storage.
    const { data: docs } = await supabase
      .from('supplier_documents')
      .select('document_number')
      .eq('itinerary_id', id)
      .eq('org_id', orgId)
    const filesError = await removeTripFiles(
      supabase,
      id,
      ((docs ?? []) as Array<{ document_number: string | null }>).map(d => d.document_number).filter((n): n is string => !!n)
    )
    if (filesError) {
      console.error('Error removing the trip\'s stored documents:', filesError)
      return NextResponse.json({
        success: false,
        error: 'Could not remove the documents stored for this trip, so it was kept. Please try again.',
      }, { status: 500 })
    }

    // Only the parent: its days, services, translations, resources, share
    // links and draft documents follow by ON DELETE CASCADE, in the same
    // statement — no half-deleted trip if it fails.
    const { error } = await supabase
      .from('itineraries')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId)

    if (error) {
      console.error('❌ Error deleting itinerary:', error)
      
      // Check for foreign key constraint
      if (error.code === '23503') {
        return NextResponse.json({
          success: false,
          error: 'Cannot delete itinerary. It has linked records (invoices, payments, etc.). Please remove those first.'
        }, { status: 409 })
      }
      
      throw error
    }

    console.log('✅ Itinerary deleted successfully')

    return NextResponse.json({
      success: true,
      message: 'Itinerary deleted successfully'
    })

  } catch (error: any) {
    console.error('❌ Error in DELETE:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to delete itinerary',
        message: error.message
      },
      { status: 500 }
    )
  }
}
