import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/app/supabase'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createClient()
    const body = await request.json()

    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select('id, invoice_number, reminder_paused')
      .eq('id', id)
      .single()

    if (fetchError || !invoice) {
      return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 })
    }

    const newPausedStatus = body.paused !== undefined ? body.paused : !invoice.reminder_paused

    const { error: updateError } = await supabase
      .from('invoices')
      .update({ reminder_paused: newPausedStatus, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (updateError) throw updateError

    return NextResponse.json({
      success: true,
      invoice_id: id,
      invoice_number: invoice.invoice_number,
      reminder_paused: newPausedStatus,
      message: newPausedStatus ? 'Reminders paused' : 'Reminders resumed'
    })
  } catch (error: any) {
    console.error('Error toggling pause:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
