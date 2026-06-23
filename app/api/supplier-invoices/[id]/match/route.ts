import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST - Link expenses to supplier invoice
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { expenseIds } = await request.json()

    if (!expenseIds || !Array.isArray(expenseIds) || expenseIds.length === 0) {
      return NextResponse.json(
        { error: 'expenseIds array is required' },
        { status: 400 }
      )
    }

    // Fetch the supplier invoice
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('supplier_invoices')
      .select('amount')
      .eq('id', id)
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: 'Supplier invoice not found' }, { status: 404 })
    }

    // Fetch selected expenses
    const { data: expenses, error: expError } = await supabaseAdmin
      .from('expenses')
      .select('id, amount')
      .in('id', expenseIds)

    if (expError || !expenses) {
      return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 })
    }

    // Insert junction records
    const links = expenses.map(exp => ({
      supplier_invoice_id: id,
      expense_id: exp.id,
      matched_amount: exp.amount,
    }))

    const { error: insertError } = await supabaseAdmin
      .from('supplier_invoice_expenses')
      .upsert(links, { onConflict: 'supplier_invoice_id,expense_id' })

    if (insertError) {
      console.error('Error linking expenses:', insertError)
      return NextResponse.json({ error: 'Failed to link expenses' }, { status: 500 })
    }

    // Recalculate totals
    const { data: allMatches } = await supabaseAdmin
      .from('supplier_invoice_expenses')
      .select('matched_amount')
      .eq('supplier_invoice_id', id)

    const matchedAmount = (allMatches || []).reduce((sum, m) => sum + Number(m.matched_amount || 0), 0)
    const invoiceAmount = Number(invoice.amount)
    const discrepancy = invoiceAmount - matchedAmount
    const tolerance = 0.01

    let matchStatus: string
    if (Math.abs(discrepancy) <= tolerance) {
      matchStatus = 'matched'
    } else if (matchedAmount > 0 && matchedAmount < invoiceAmount) {
      matchStatus = 'partial'
    } else {
      matchStatus = 'discrepancy'
    }

    // Update supplier invoice. M28: 'partial' must NOT promote the invoice
    // to status='matched' — partials still need follow-up before approve/pay.
    // Only an exact match should flip the high-level status.
    const newStatus = matchStatus === 'matched' ? 'matched' : 'received'
    await supabaseAdmin
      .from('supplier_invoices')
      .update({
        matched_amount: matchedAmount,
        discrepancy_amount: discrepancy,
        match_status: matchStatus,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    return NextResponse.json({
      success: true,
      matched_amount: matchedAmount,
      discrepancy_amount: discrepancy,
      match_status: matchStatus,
    })
  } catch (error) {
    console.error('Error in match POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Unlink an expense from supplier invoice
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { expenseId } = await request.json()

    if (!expenseId) {
      return NextResponse.json({ error: 'expenseId is required' }, { status: 400 })
    }

    await supabaseAdmin
      .from('supplier_invoice_expenses')
      .delete()
      .eq('supplier_invoice_id', id)
      .eq('expense_id', expenseId)

    // Recalculate
    const { data: invoice } = await supabaseAdmin
      .from('supplier_invoices')
      .select('amount')
      .eq('id', id)
      .single()

    const { data: allMatches } = await supabaseAdmin
      .from('supplier_invoice_expenses')
      .select('matched_amount')
      .eq('supplier_invoice_id', id)

    const matchedAmount = (allMatches || []).reduce((sum, m) => sum + Number(m.matched_amount || 0), 0)
    const invoiceAmount = Number(invoice?.amount || 0)
    const discrepancy = invoiceAmount - matchedAmount

    const matchStatus = matchedAmount === 0
      ? 'unmatched'
      : Math.abs(discrepancy) <= 0.01
        ? 'matched'
        : matchedAmount < invoiceAmount
          ? 'partial'
          : 'discrepancy'

    const status = matchedAmount === 0 ? 'received' : 'matched'

    await supabaseAdmin
      .from('supplier_invoices')
      .update({
        matched_amount: matchedAmount,
        discrepancy_amount: discrepancy,
        match_status: matchStatus,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    return NextResponse.json({ success: true, match_status: matchStatus })
  } catch (error) {
    console.error('Error in match DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
