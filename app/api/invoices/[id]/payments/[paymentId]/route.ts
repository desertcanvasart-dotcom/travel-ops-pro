import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { roundToCurrency } from '@/lib/currency-totals'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id, paymentId } = await params

    // invoice_payments is a child without org_id — verify the parent invoice
    // belongs to this org before touching anything keyed off invoice_id.
    const { data: parent } = await supabaseAdmin
      .from('invoices')
      .select('id')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!parent) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Verify payment belongs to this invoice
    const { data: payment, error: fetchError } = await supabaseAdmin
      .from('invoice_payments')
      .select('*')
      .eq('id', paymentId)
      .eq('invoice_id', id)
      .single()

    if (fetchError || !payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    // Has this payment already been posted to QuickBooks/Xero? Deleting it here
    // does not delete it there, so the ledger would keep a receipt that no
    // longer exists in Autoura — and nothing said so. Looked up BEFORE the
    // delete so the trail is not lost with the row.
    const { data: syncedRows, error: syncLookupError } = await supabaseAdmin
      .from('accounting_sync_log')
      .select('id, provider')
      .eq('org_id', orgId)
      .eq('entity_type', 'invoice_payment')
      .eq('entity_id', paymentId)
      .eq('sync_status', 'synced')
    if (syncLookupError) console.error('Payment delete: could not read accounting sync log', syncLookupError)

    // Delete the payment
    const { error } = await supabaseAdmin
      .from('invoice_payments')
      .delete()
      .eq('id', paymentId)

    if (error) {
      console.error('Error deleting payment:', error)
      return NextResponse.json({ error: 'Failed to delete payment' }, { status: 500 })
    }

    // The payment stays deleted — Autoura is right that it is gone — but the
    // posted copy is flagged for a human to reverse. 'failed' because the
    // sync_status CHECK allows nothing like 'orphaned'; retry_count is maxed so
    // retrySyncErrors never re-runs it (the payment no longer exists, and a
    // retry would overwrite this message with "not found").
    const providerName = (p: string) => (p === 'quickbooks' ? 'QuickBooks' : p === 'xero' ? 'Xero' : p)
    const flagged: string[] = []
    for (const row of syncedRows ?? []) {
      const provider = providerName(String(row.provider))
      const { error: flagError } = await supabaseAdmin
        .from('accounting_sync_log')
        .update({
          sync_status: 'failed',
          last_error: `Deleted in Autoura — reverse this payment in ${provider}`,
          retry_count: 5,
          next_retry_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('org_id', orgId)
      if (flagError) console.error('Payment delete: could not flag accounting sync log', flagError)
      flagged.push(provider)
    }
    const warning = flagged.length
      ? `This payment was already posted to ${flagged.join(' and ')}. It has been deleted here but NOT there — reverse it in ${flagged.join(' and ')}.`
      : undefined

    // Manually update invoice since trigger might not fire on delete
    const { data: payments } = await supabaseAdmin
      .from('invoice_payments')
      .select('amount')
      .eq('invoice_id', id)

    const { data: invoice } = await supabaseAdmin
      .from('invoices')
      .select('total_amount, status, currency, paid_at')
      .eq('id', id)
      .eq('org_id', orgId)
      .single()

    if (invoice) {
      // Summed in the invoice's currency decimals, as the insert trigger does
      // in numeric: 28.40 + 35.80 + 35.80 in floats left €0.00000000000001
      // due, 'partial', and a reminder for "€0.00".
      const totalPaid = roundToCurrency((payments || []).reduce((sum, p) => sum + Number(p.amount), 0), invoice.currency)
      const balanceDue = roundToCurrency(Number(invoice.total_amount) - totalPaid, invoice.currency)
      // Only payment-derived statuses should change here. Never clobber a
      // 'draft' / 'cancelled' / 'overdue' invoice back to 'sent', and never
      // move a draft or cancelled one to 'partial' (a remindable status).
      let status = invoice.status
      if (invoice.status === 'draft' || invoice.status === 'cancelled') {
        status = invoice.status
      } else if (totalPaid > 0 && totalPaid >= Number(invoice.total_amount)) {
        status = 'paid'
      } else if (totalPaid > 0) {
        status = 'partial'
      } else if (invoice.status === 'paid' || invoice.status === 'partial') {
        status = 'sent'
      }

      await supabaseAdmin
        .from('invoices')
        .update({
          amount_paid: totalPaid,
          balance_due: balanceDue,
          status: status,
          paid_at: status === 'paid' ? (invoice.paid_at || new Date().toISOString()) : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('org_id', orgId)
    }

    return NextResponse.json(warning ? { success: true, warning } : { success: true })
  } catch (error) {
    console.error('Error in payment DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
