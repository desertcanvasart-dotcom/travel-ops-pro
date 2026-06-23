import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data, error } = await supabaseAdmin
      .from('expenses')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching expense:', error)
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in expense GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // M14: explicit whitelist + validation. Previously this spread the entire
    // body, so callers could set arbitrary status values, write garbage
    // amounts, overwrite immutable fields, or send unknown keys that 500'd
    // the request on hitting unknown columns.
    const ALLOWED_FIELDS = [
      'itinerary_id', 'supplier_id', 'category', 'description', 'amount',
      'currency', 'expense_date', 'supplier_name', 'supplier_type',
      'receipt_url', 'receipt_filename', 'status', 'payment_method',
      'payment_date', 'payment_reference', 'notes',
    ] as const
    const ALLOWED_STATUSES = ['pending', 'approved', 'paid', 'rejected', 'cancelled'] as const

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }
    for (const field of ALLOWED_FIELDS) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    if (updateData.amount !== undefined) {
      const amt = Number(updateData.amount)
      if (!Number.isFinite(amt) || amt < 0) {
        return NextResponse.json(
          { error: 'amount must be a non-negative number' },
          { status: 400 }
        )
      }
      updateData.amount = amt
    }
    if (updateData.status !== undefined && !ALLOWED_STATUSES.includes(updateData.status)) {
      return NextResponse.json(
        { error: `status must be one of: ${ALLOWED_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('expenses')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating expense:', error)
      return NextResponse.json({ error: 'Failed to update expense' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in expense PUT:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { error } = await supabaseAdmin
      .from('expenses')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting expense:', error)
      return NextResponse.json({ error: 'Failed to delete expense' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in expense DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}