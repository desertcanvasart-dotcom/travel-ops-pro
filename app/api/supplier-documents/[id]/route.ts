import { createClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createClient()
  const { id } = await params

  try {
    const { data, error } = await supabase
      .from('supplier_documents')
      .select(`
        *,
        itinerary:itineraries(id, itinerary_code, trip_name, client_name)
      `)
      .eq('id', id)
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
  const supabase = createClient()
  const { id } = await params

  try {
    const body = await request.json()
    console.log('Updating document:', id)

    // Whitelist of allowed columns on supplier_documents table
    // Only these fields will be sent to Supabase — everything else
    // (joined relations, computed fields, non-column data) is ignored
    const ALLOWED_FIELDS = [
      'itinerary_id', 'supplier_id', 'document_type', 'document_number',
      'supplier_name', 'supplier_contact_name', 'supplier_contact_email',
      'supplier_contact_phone', 'supplier_address', 'supplier_whatsapp',
      'client_name', 'client_nationality', 'num_adults', 'num_children',
      'services', 'selected_attractions', 'selected_routes', 'selected_meals',
      'city', 'service_date', 'check_in', 'check_out',
      'pickup_time', 'pickup_location', 'dropoff_location',
      'currency', 'total_cost', 'payment_terms',
      'special_requests', 'internal_notes',
      'status', 'sent_at', 'confirmed_at', 'completed_at',
      'sent_via',
    ]

    // Only include fields that are actual table columns
    const updateData: Record<string, any> = {}
    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        updateData[field] = body[field]
      }
    }

    // Auto-set timestamps based on status changes
    if (updateData.status === 'sent' && !updateData.sent_at) {
      updateData.sent_at = new Date().toISOString()
    }
    if (updateData.status === 'confirmed' && !updateData.confirmed_at) {
      updateData.confirmed_at = new Date().toISOString()
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
      .select()
      .single()

    if (error) {
      console.error('Error updating document:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    console.log('Document updated successfully:', data)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in PUT:', error)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createClient()
  const { id } = await params

  try {
    const { error } = await supabase
      .from('supplier_documents')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting document:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
