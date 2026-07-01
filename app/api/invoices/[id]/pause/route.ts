import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params
    const supabase = createServerClient()
    const body = await request.json()

    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select('id, invoice_number, reminder_paused')
      .eq('id', id)
      .eq('org_id', orgId)
      .single()

    if (fetchError || !invoice) {
      return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 })
    }

    const newPausedStatus = body.paused !== undefined ? body.paused : !invoice.reminder_paused

    const { error: updateError } = await supabase
      .from('invoices')
      .update({ reminder_paused: newPausedStatus, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('org_id', orgId)

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
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
