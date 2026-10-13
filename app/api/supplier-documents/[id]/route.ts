import { createServerClient } from '@/lib/supabase-server'
import { clientMessage } from '@/lib/api-errors'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'
import { NextRequest, NextResponse } from 'next/server'
import { recordsInOrg } from '@/lib/org-refs'
import {
  SUPPLIER_DOCUMENT_UPDATE_FIELDS, deleteBlockReason, isSupplierDocumentStatus, pickFields,
} from '@/lib/documents/supplier-document-fields'
import { convertVoucherMoney, planCurrencyChange } from '@/lib/documents/voucher-currency'
import { voucherPickFx } from '@/lib/documents/voucher-pick-price'
import { fetchRunExchangeRates } from '@/lib/rates/fx-source'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createServerClient()
  const { id } = await params

  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { data, error } = await supabase
      .from('supplier_documents')
      .select(`
        *,
        itinerary:itineraries(id, itinerary_code, trip_name, client_name, currency, fx_frozen)
      `)
      .eq('id', id)
      .eq('org_id', orgId)
      .single()

    if (error) {
      console.error('Error fetching document:', error)
      return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createServerClient()
  const { id } = await params

  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const body = await request.json()
    console.log('Updating document:', id)

    // Only real columns (lib/documents/supplier-document-fields): joined
    // relations, computed fields and anything else in the body are ignored.
    const updateData: Record<string, any> = pickFields(body, SUPPLIER_DOCUMENT_UPDATE_FIELDS)

    // A status no screen knows would show as "Draft" everywhere.
    if ('status' in updateData && !isSupplierDocumentStatus(updateData.status)) {
      return NextResponse.json({ success: false, error: 'Unknown status' }, { status: 400 })
    }

    // A supplier must be this company's (suppliers.org_id, 20261205).
    if (updateData.supplier_id === '') updateData.supplier_id = null
    if (!(await recordsInOrg(supabase, orgId, { supplier_id: updateData.supplier_id }))) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })
    }

    // A new currency converts the amounts; it never just relabels them
    // (lib/documents/voucher-currency). The body's amounts are in
    // `amounts_currency` (absent: the stored currency).
    let converted: { from: string; to: string; fx: number } | null = null
    if ('currency' in updateData || body?.amounts_currency != null) {
      const { data: stored, error: storedError } = await supabase
        .from('supplier_documents')
        .select('currency, total_cost, services, selected_routes, selected_meals, selected_guides, selected_attractions, itinerary:itineraries(fx_frozen)')
        .eq('id', id)
        .eq('org_id', orgId)
        .maybeSingle()
      if (storedError) {
        console.error('Error reading document:', storedError)
        return NextResponse.json({ success: false, error: clientMessage(storedError, 'Internal server error') }, { status: 500 })
      }
      if (!stored) return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 })
      const { itinerary, ...storedRow } = stored as Record<string, any>
      const plan = planCurrencyChange(storedRow, updateData, body?.amounts_currency)
      if (plan.kind === 'refuse') {
        return NextResponse.json({ success: false, error: plan.error }, { status: plan.status })
      }
      if (plan.kind === 'convert') {
        // The trip's frozen rate, else today's — as a picked rate is converted.
        const fx = voucherPickFx(plan.from, plan.to, itinerary?.fx_frozen, await fetchRunExchangeRates())
        if (fx == null) {
          return NextResponse.json({
            success: false,
            error: `No exchange rate from ${plan.from} to ${plan.to} is known, so the amounts cannot be converted. The currency was not changed.`,
          }, { status: 422 })
        }
        Object.assign(updateData, convertVoucherMoney({ ...storedRow, ...updateData }, fx, plan.to))
        converted = { ...plan, fx }
      }
    }

    // Auto-set timestamps based on status changes
    if (updateData.status === 'sent' && !updateData.sent_at) {
      updateData.sent_at = new Date().toISOString()
    }
    if (updateData.status === 'confirmed' && !updateData.confirmed_at) {
      updateData.confirmed_at = new Date().toISOString()
      // Who confirmed it, stamped with the first confirmation only.
      updateData.confirmed_by = await getCurrentUserId()
    }
    if (updateData.status === 'completed' && !updateData.completed_at) {
      updateData.completed_at = new Date().toISOString()
    }

    // Set updated_at
    updateData.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('supplier_documents')
      .update(updateData)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single()

    // .single() on no row: not this org's document (or none at all).
    if (error?.code === 'PGRST116') {
      return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 })
    }
    // Numbers are unique within the company (20261216).
    if (error?.code === '23505') {
      return NextResponse.json({ success: false, error: 'Another of your documents already has this number' }, { status: 409 })
    }
    if (error) {
      console.error('Error updating document:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    console.log('Document updated successfully:', data)
    return NextResponse.json({ success: true, data, converted })
  } catch (error) {
    console.error('Error in PUT:', error)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createServerClient()
  const { id } = await params

  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    // A document the supplier holds is cancelled, not deleted.
    const { data: existing, error: readError } = await supabase
      .from('supplier_documents')
      .select('id, status, sent_at')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (readError) {
      console.error('Error reading document:', readError)
      return NextResponse.json({ success: false, error: clientMessage(readError, 'Internal server error') }, { status: 500 })
    }
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 })
    }
    const blocked = deleteBlockReason(existing)
    if (blocked) {
      return NextResponse.json({ success: false, error: blocked }, { status: 409 })
    }

    const { data, error } = await supabase
      .from('supplier_documents')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId)
      .select('id')

    if (!error && (data ?? []).length === 0) {
      return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 })
    }
    if (error) {
      console.error('Error deleting document:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
