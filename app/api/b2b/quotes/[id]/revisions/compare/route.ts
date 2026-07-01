// ============================================
// GET /api/b2b/quotes/[id]/revisions/compare?from=1&to=2
// Field-level diff between two revisions of a quote.
// ============================================

import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Fields compared for ours' tour_quotes (B2B) revisions.
const FIELDS: Array<{ key: string; label: string }> = [
  { key: 'status', label: 'Status' },
  { key: 'trip_name', label: 'Trip Name' },
  { key: 'client_name', label: 'Client Name' },
  { key: 'travel_date', label: 'Travel Date' },
  { key: 'num_adults', label: 'Adults' },
  { key: 'num_children', label: 'Children' },
  { key: 'total_cost', label: 'Total Cost' },
  { key: 'margin_percent', label: 'Margin %' },
  { key: 'margin_amount', label: 'Margin Amount' },
  { key: 'selling_price', label: 'Selling Price' },
  { key: 'price_per_person', label: 'Price Per Person' },
  { key: 'currency', label: 'Currency' },
  { key: 'tour_leader_included', label: 'Tour Leader Included' },
  { key: 'tour_leader_cost', label: 'Tour Leader Cost' },
  { key: 'single_supplement', label: 'Single Supplement' },
  { key: 'is_eur_passport', label: 'EUR Passport' },
  { key: 'season', label: 'Season' },
  { key: 'valid_until', label: 'Valid Until' },
  { key: 'services_snapshot', label: 'Services' },
  { key: 'notes', label: 'Notes' },
]

function calculateDifferences(oldData: any, newData: any) {
  const out: Array<{ field: string; label: string; old_value: any; new_value: any; changed: boolean }> = []
  for (const f of FIELDS) {
    const oldValue = oldData?.[f.key]
    const newValue = newData?.[f.key]
    const changed = JSON.stringify(oldValue) !== JSON.stringify(newValue)
    if (changed) out.push({ field: f.key, label: f.label, old_value: oldValue, new_value: newValue, changed })
  }
  return out
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const fromVersion = parseInt(searchParams.get('from') || '0', 10)
    const toVersion = parseInt(searchParams.get('to') || '0', 10)

    if (fromVersion < 1 || toVersion < 1) {
      return NextResponse.json(
        { success: false, error: 'Both from and to version numbers are required and must be >= 1' },
        { status: 400 }
      )
    }

    const { data: revisions, error } = await supabaseAdmin
      .from('quote_revisions')
      .select('version_number, quote_data, changed_at, changed_by')
      .eq('quote_type', 'b2b')
      .eq('quote_id', id)
      .in('version_number', [fromVersion, toVersion])
      .order('version_number', { ascending: true })

    if (error) {
      return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }
    if (!revisions || revisions.length !== 2) {
      return NextResponse.json({ success: false, error: 'One or both revisions not found' }, { status: 404 })
    }

    const [oldRev, newRev] = revisions
    const differences = calculateDifferences(oldRev.quote_data, newRev.quote_data)

    return NextResponse.json({
      success: true,
      comparison: {
        from_version: fromVersion,
        to_version: toVersion,
        from_data: oldRev,
        to_data: newRev,
        differences,
        total_changes: differences.length,
      },
    })
  } catch (error: any) {
    console.error('Quote revision compare error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
