import { escapeHtml } from '@/lib/html-escape'
import { REMINDABLE_INVOICE_STATUSES } from '@/lib/invoices/reminder-schedule'
import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cron/auth'
import { businessIdentity, htmlIdentity, orgIdentity, type OrgIdentity } from '@/lib/org-identity'
import { jobRunHeaders, withJobRun } from '@/lib/support/job-runs'
import { createServerClient } from '@/lib/supabase-server'
import { clientMessage } from '@/lib/api-errors'
import { sendEmailInternal } from '@/lib/email-send'
import { formatMoney } from '@/lib/currency-totals'
import { businessToday } from '@/lib/today'
import { daysUntilDue, reminderStage, firstReminderDate, addDaysISO } from '@/lib/invoices/reminder-schedule'

// Verify cron secret for security

// Email sending function - reused from main route
async function sendReminderEmail(params: {
  to: string
  subject: string
  html: string
  orgId: string
}): Promise<{ success: boolean; error?: string }> {
  // From the invoice's own organization's mailbox (lib/email-send).
  const result = await sendEmailInternal({
    to: params.to,
    subject: params.subject,
    html: params.html,
    orgId: params.orgId,
  })
  return { success: result.success, error: result.error }
}

function generateReminderEmail(invoice: any, reminderType: string, identity: OrgIdentity = businessIdentity()): { subject: string; html: string } {
  // The operator's own name, never a literal — this goes to their customer.
  const brand = htmlIdentity(identity)
  // formatMoney knows each currency's symbol and decimals (¥110,000, not JPY110000.00).
  const balanceDue = formatMoney(Number(invoice.balance_due), invoice.currency)
  const dueDate = new Date(invoice.due_date).toLocaleDateString('en-GB', { 
    day: 'numeric', month: 'long', year: 'numeric' 
  })
  // Whole calendar days: due today is 0, not "0 days overdue" (see reminder-schedule).
  const daysOverdue = -daysUntilDue(invoice.due_date, businessToday())

  let subject: string
  let urgencyMessage: string
  let urgencyColor: string

  if (daysOverdue <= -7) {
    subject = `Upcoming Payment Due: Invoice ${invoice.invoice_number}`
    urgencyMessage = `Your invoice is due in ${Math.abs(daysOverdue)} days.`
    urgencyColor = '#3b82f6'
  } else if (daysOverdue <= 0) {
    subject = `Payment Due: Invoice ${invoice.invoice_number}`
    urgencyMessage = daysOverdue === 0 ? 'Your invoice payment is due today.' : `Your invoice is due in ${Math.abs(daysOverdue)} days.`
    urgencyColor = '#f59e0b'
  } else if (daysOverdue <= 14) {
    subject = `Payment Overdue: Invoice ${invoice.invoice_number}`
    urgencyMessage = `Your payment is ${daysOverdue} days overdue.`
    urgencyColor = '#ef4444'
  } else {
    subject = `Urgent: Invoice ${invoice.invoice_number} - ${daysOverdue} Days Overdue`
    urgencyMessage = `Your payment is ${daysOverdue} days overdue. Please arrange immediate payment.`
    urgencyColor = '#dc2626'
  }

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f3f4f6;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
<tr><td style="background:#647C47;padding:30px;text-align:center;">
<h1 style="margin:0;color:#fff;font-size:24px;">${brand.name}</h1>
</td></tr>
<tr><td style="background:${urgencyColor};padding:15px 40px;">
<p style="margin:0;color:#fff;text-align:center;font-size:14px;">${urgencyMessage}</p>
</td></tr>
<tr><td style="padding:40px;">
<p style="color:#374151;font-size:16px;">Dear ${escapeHtml(invoice.client_name)},</p>
<table width="100%" style="background:#f9fafb;border-radius:8px;margin:20px 0;">
<tr><td style="padding:20px;">
<p style="margin:5px 0;"><strong>Invoice:</strong> ${escapeHtml(invoice.invoice_number)}</p>
<p style="margin:5px 0;"><strong>Due Date:</strong> ${dueDate}</p>
<p style="margin:15px 0 0;font-size:18px;"><strong>Balance Due: <span style="color:#ef4444;">${balanceDue}</span></strong></p>
</td></tr>
</table>
<p style="color:#374151;">Please arrange payment at your earliest convenience.</p>
<p style="color:#374151;margin-top:30px;">Best regards,${brand.name ? `<br><strong>${brand.name}</strong>` : ''}</p>
</td></tr>
<tr><td style="background:#f9fafb;padding:20px;text-align:center;border-top:1px solid #e5e7eb;">
<p style="margin:0;color:#9ca3af;font-size:12px;">${brand.name ? `Automated reminder from ${brand.name}` : 'Automated reminder'}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  return { subject, html }
}

// Each organisation's batch is capped on its own: one shared cap let the
// company with the most (or longest-waiting) due invoices use every slot, so
// the other company's customers were never reminded on a busy day.
const REMINDERS_PER_ORG = 50

type OrgOutcome = { org_id: string; due: number; sent: number; failed: number; skipped: number; error?: string }

async function getHandler(request: NextRequest) {
  // Fails closed: see lib/cron/auth.
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createServerClient()
    const today = businessToday()

    console.log('🔔 Starting automated reminder processing...')

    // One organisation at a time (invoices.org_id): each batch is that
    // organisation's invoices, signed with its identity (Settings) and sent
    // from its own mailbox (lib/email-send) — never mixed with another's.
    const { data: orgs, error: orgsError } = await supabase.from('organizations').select('id')
    if (orgsError) throw orgsError

    const outcomes: OrgOutcome[] = []
    for (const { id: orgId } of (orgs ?? []) as Array<{ id: string }>) {
      outcomes.push(await processOrganisation(supabase, orgId, today))
    }

    const sent = outcomes.reduce((n, o) => n + o.sent, 0)
    const failed = outcomes.reduce((n, o) => n + o.failed, 0)
    const skipped = outcomes.reduce((n, o) => n + o.skipped, 0)
    const processed = outcomes.reduce((n, o) => n + o.due, 0)
    const orgErrors = outcomes.filter(o => o.error).length

    if (processed === 0 && orgErrors === 0) {
      console.log('✅ No reminders to send today')
      return NextResponse.json({
        success: true,
        message: 'No reminders to send',
        processed: 0
      })
    }

    console.log(`🔔 Reminder processing complete: ${sent} sent, ${failed} failed, ${skipped} not yet due`)

    return NextResponse.json({
      success: true,
      message: `Processed ${processed} reminders`,
      sent,
      failed,
      skipped,
      organizations: outcomes,
      timestamp: new Date().toISOString()
    }, {
      // Every send failing (a lapsed mailbox), or an organisation's batch not
      // loading at all, is a failed run, not an "ok" one.
      headers: jobRunHeaders(
        (failed > 0 && sent === 0) || orgErrors > 0 ? 'failed' : 'ok',
        `${sent} sent, ${failed} failed, ${skipped} not yet due${orgErrors ? `, ${orgErrors} organisation(s) not loaded` : ''}`
      ),
    })

  } catch (error: any) {
    console.error('❌ Cron error:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}

/** One organisation's due reminders, up to REMINDERS_PER_ORG. */
async function processOrganisation(
  supabase: ReturnType<typeof createServerClient>,
  orgId: string,
  today: string
): Promise<OrgOutcome> {
  const outcome: OrgOutcome = { org_id: orgId, due: 0, sent: 0, failed: 0, skipped: 0 }

  // This organisation's invoices due for reminders today
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('org_id', orgId)
    .in('status', [...REMINDABLE_INVOICE_STATUSES])
    .not('due_date', 'is', null)
    .gt('balance_due', 0)
    .eq('reminder_paused', false)
    .lte('next_reminder_date', today)
    .not('client_email', 'is', null)
    // Longest-waiting first. With no order, the same rows came back every
    // run — and a failed send left its row due — so invoices of an
    // organization with no mailbox connected starved every other one.
    .order('next_reminder_date', { ascending: true })
    .order('id', { ascending: true })
    .limit(REMINDERS_PER_ORG)

  if (error) {
    // One organisation's batch failing does not stop the others'.
    console.error(`❌ Reminders for organisation ${orgId} not loaded:`, error.message)
    return { ...outcome, error: clientMessage(error, 'Could not load invoices') }
  }
  if (!invoices || invoices.length === 0) return outcome

  outcome.due = invoices.length
  console.log(`📧 Processing ${invoices.length} reminders for organisation ${orgId}...`)

  // Signed by this organization (Settings), read once.
  let identity: OrgIdentity | null = null

  for (const invoice of invoices) {
    const reminderType = reminderStage(daysUntilDue(invoice.due_date, today))
    if (!reminderType) {
      // Too early for any reminder: look at it again 7 days before it falls due.
      await supabase
        .from('invoices')
        .update({ next_reminder_date: firstReminderDate(invoice.due_date) })
        .eq('id', invoice.id)
        .eq('org_id', orgId)
      outcome.skipped++
      continue
    }

    if (!identity) identity = await orgIdentity(orgId)
    const { subject, html } = generateReminderEmail(invoice, reminderType, identity)

    const result = await sendReminderEmail({
      to: invoice.client_email,
      subject,
      html,
      orgId,
    })

    if (result.success) {
      await supabase
        .from('invoices')
        .update({
          last_reminder_sent: new Date().toISOString(),
          reminder_count: (invoice.reminder_count || 0) + 1,
          next_reminder_date: addDaysISO(today, 7)
        })
        .eq('id', invoice.id)
        .eq('org_id', orgId)

      await supabase
        .from('invoice_reminders')
        .insert({
          invoice_id: invoice.id,
          reminder_type: reminderType,
          recipient_email: invoice.client_email,
          subject,
          status: 'sent'
        })

      outcome.sent++
      console.log(`✅ Sent reminder for ${invoice.invoice_number}`)
    } else {
      // Retried tomorrow, behind everything that has waited longer.
      await supabase
        .from('invoices')
        .update({ next_reminder_date: addDaysISO(today, 1) })
        .eq('id', invoice.id)
        .eq('org_id', orgId)

      await supabase
        .from('invoice_reminders')
        .insert({
          invoice_id: invoice.id,
          reminder_type: reminderType,
          recipient_email: invoice.client_email,
          subject,
          status: 'failed',
          error_message: result.error
        })

      outcome.failed++
      console.log(`❌ Failed to send reminder for ${invoice.invoice_number}: ${result.error}`)
    }
  }

  return outcome
}

// Recorded in job_runs so the support bundle can answer "has this job ever run
// here?". Wrapping the ROUTE covers both the in-process scheduler (which calls
// this handler directly) and any external caller. Fail-open: if the recording
// cannot happen, the job still runs — see lib/support/job-runs.ts.
export const GET = withJobRun('send-reminders', () => createServerClient(), getHandler)
