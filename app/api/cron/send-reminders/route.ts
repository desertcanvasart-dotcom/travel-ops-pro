import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cron/auth'
import { businessIdentity } from '@/lib/org-identity'
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
}): Promise<{ success: boolean; error?: string }> {
  const result = await sendEmailInternal({
    to: params.to,
    subject: params.subject,
    html: params.html,
  })
  return { success: result.success, error: result.error }
}

function generateReminderEmail(invoice: any, reminderType: string): { subject: string; html: string } {
  // The operator's own name, never a literal — this goes to their customer.
  const brand = businessIdentity()
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
<p style="color:#374151;font-size:16px;">Dear ${invoice.client_name},</p>
<table width="100%" style="background:#f9fafb;border-radius:8px;margin:20px 0;">
<tr><td style="padding:20px;">
<p style="margin:5px 0;"><strong>Invoice:</strong> ${invoice.invoice_number}</p>
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

async function getHandler(request: NextRequest) {
  // Fails closed: see lib/cron/auth.
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createServerClient()
    const today = businessToday()

    console.log('🔔 Starting automated reminder processing...')

    // Get invoices due for reminders today
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('*')
      .not('status', 'in', '("paid","cancelled")')
      .gt('balance_due', 0)
      .eq('reminder_paused', false)
      .lte('next_reminder_date', today)
      .not('client_email', 'is', null)
      .limit(50) // Process max 50 per run

    if (error) throw error

    if (!invoices || invoices.length === 0) {
      console.log('✅ No reminders to send today')
      return NextResponse.json({
        success: true,
        message: 'No reminders to send',
        processed: 0
      })
    }

    console.log(`📧 Processing ${invoices.length} reminders...`)

    let sent = 0
    let failed = 0
    let skipped = 0

    for (const invoice of invoices) {
      const reminderType = reminderStage(daysUntilDue(invoice.due_date, today))
      if (!reminderType) {
        // Too early for any reminder: look at it again 7 days before it falls due.
        await supabase
          .from('invoices')
          .update({ next_reminder_date: firstReminderDate(invoice.due_date) })
          .eq('id', invoice.id)
        skipped++
        continue
      }

      const { subject, html } = generateReminderEmail(invoice, reminderType)

      const result = await sendReminderEmail({
        to: invoice.client_email,
        subject,
        html
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

        await supabase
          .from('invoice_reminders')
          .insert({
            invoice_id: invoice.id,
            reminder_type: reminderType,
            recipient_email: invoice.client_email,
            subject,
            status: 'sent'
          })

        sent++
        console.log(`✅ Sent reminder for ${invoice.invoice_number}`)
      } else {
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

        failed++
        console.log(`❌ Failed to send reminder for ${invoice.invoice_number}: ${result.error}`)
      }
    }

    console.log(`🔔 Reminder processing complete: ${sent} sent, ${failed} failed, ${skipped} not yet due`)

    return NextResponse.json({
      success: true,
      message: `Processed ${invoices.length} reminders`,
      sent,
      failed,
      skipped,
      timestamp: new Date().toISOString()
    }, {
      // Every send failing (a lapsed mailbox) is a failed run, not an "ok" one.
      headers: jobRunHeaders(failed > 0 && sent === 0 ? 'failed' : 'ok', `${sent} sent, ${failed} failed, ${skipped} not yet due`),
    })

  } catch (error: any) {
    console.error('❌ Cron error:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}

// Recorded in job_runs so the support bundle can answer "has this job ever run
// here?". Wrapping the ROUTE covers both the in-process scheduler (which calls
// this handler directly) and any external caller. Fail-open: if the recording
// cannot happen, the job still runs — see lib/support/job-runs.ts.
export const GET = withJobRun('send-reminders', () => createServerClient(), getHandler)
