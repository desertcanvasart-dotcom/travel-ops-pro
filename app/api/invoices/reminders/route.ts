import { REMINDABLE_INVOICE_STATUSES } from '@/lib/invoices/reminder-schedule'
import { NextRequest, NextResponse } from 'next/server'
import { orgIdentity } from '@/lib/org-identity'
import { clientMessage } from '@/lib/api-errors'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'
import { resolveClientLocalesByEmail, type RecipientLocale } from '@/lib/i18n/recipient-locale'
import { sendEmailInternal } from '@/lib/email-send'
import { businessToday } from '@/lib/today'
import { daysUntilDue, reminderStage, firstReminderDate } from '@/lib/invoices/reminder-schedule'
import { generateReminderEmail } from '@/lib/invoices/reminder-email'

// Email service - adjust based on your setup (Resend, SendGrid, etc.)
// This example uses a generic sendEmail function - replace with your actual implementation
async function sendReminderEmail(params: {
  to: string
  subject: string
  html: string
  invoiceNumber: string
  orgId: string
  senderUserId: string | null
}): Promise<{ success: boolean; error?: string }> {
  // Send via the shared in-process helper (the send path used everywhere;
  // a fetch to /api/send-email would be rejected by the /api/* auth gate).
  const result = await sendEmailInternal({
    to: params.to,
    subject: params.subject,
    html: params.html,
    orgId: params.orgId,
    senderUserId: params.senderUserId,
  })
  if (!result.success) {
    console.error('Error sending reminder email:', result.error)
  }
  return { success: result.success, error: result.error }
}

export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const supabase = createServerClient()
    const { searchParams } = new URL(request.url)
    const preview = searchParams.get('preview') === 'true'

    // Get invoices that need reminders
    const today = businessToday()

    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('org_id', orgId)
      .in('status', [...REMINDABLE_INVOICE_STATUSES])
      .not('due_date', 'is', null)
      .gt('balance_due', 0)
      // Paused invoices stay in the list (badged, out of bulk sends) — it is
      // the only place to resume one; filtering them out hid them for good.
      .or(`next_reminder_date.lte.${today},next_reminder_date.is.null`)
      .not('client_email', 'is', null)
      .order('due_date', { ascending: true })

    if (error) throw error

    // Categorize by reminder type
    const reminders = (invoices || []).flatMap((invoice: any) => {
      if (!invoice.due_date) return []
      const daysUntil = daysUntilDue(invoice.due_date, today)
      const reminderType = reminderStage(daysUntil)
      // More than 7 days out: too early for any reminder, so not in the list.
      if (!reminderType) return []

      return [{
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        client_name: invoice.client_name,
        client_email: invoice.client_email,
        balance_due: invoice.balance_due,
        currency: invoice.currency,
        due_date: invoice.due_date,
        days_until_due: daysUntil,
        reminder_type: reminderType,
        reminder_count: invoice.reminder_count || 0,
        last_reminder_sent: invoice.last_reminder_sent,
        reminder_paused: !!invoice.reminder_paused
      }]
    })

    return NextResponse.json({
      success: true,
      count: reminders.length,
      reminders,
      preview
    })

  } catch (error: any) {
    console.error('Error fetching reminders:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}

// POST: Process and send reminders
export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const senderUserId = await getCurrentUserId()
    // Signed by the organization sending them (Settings), not the platform.
    const identity = await orgIdentity(orgId)

    const supabase = createServerClient()
    const body = await request.json()
    const { invoiceIds, sendAll = false } = body

    // Get invoices to process
    let query = supabase
      .from('invoices')
      .select('*')
      .eq('org_id', orgId)
      .in('status', [...REMINDABLE_INVOICE_STATUSES])
      .not('due_date', 'is', null)
      .gt('balance_due', 0)
      .eq('reminder_paused', false)
      .not('client_email', 'is', null)

    if (invoiceIds && invoiceIds.length > 0) {
      query = query.in('id', invoiceIds)
    } else if (sendAll) {
      const today = businessToday()
      query = query.or(`next_reminder_date.lte.${today},next_reminder_date.is.null`)
    } else {
      return NextResponse.json(
        { success: false, error: 'Provide invoiceIds or set sendAll=true' },
        { status: 400 }
      )
    }

    const { data: invoices, error } = await query

    if (error) throw error

    if (!invoices || invoices.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No invoices to process',
        sent: 0,
        failed: 0
      })
    }

    const results = {
      sent: 0,
      failed: 0,
      details: [] as any[]
    }

    // Tier 2: resolve each recipient's language once (clients.preferred_language
    // by email), so each reminder is written in the client's own language.
    const localeByEmail = await resolveClientLocalesByEmail(
      supabase,
      invoices.map((i: any) => i.client_email),
      orgId
    )

    for (const invoice of invoices) {
      // M18: an invoice with no due_date yielded NaN here and propagated
      // 'Invalid Date' into the email subject/body. Skip those invoices so
      // they aren't sent a junk reminder.
      if (!invoice.due_date) {
        results.failed++
        results.details.push({
          invoice_id: invoice.id,
          status: 'skipped',
          reason: 'no due_date set',
        })
        continue
      }
      const dueDate = new Date(invoice.due_date)
      if (isNaN(dueDate.getTime())) {
        results.failed++
        results.details.push({
          invoice_id: invoice.id,
          status: 'skipped',
          reason: `invalid due_date: ${invoice.due_date}`,
        })
        continue
      }
      const daysUntil = daysUntilDue(invoice.due_date, businessToday())
      const reminderType = reminderStage(daysUntil)
      if (!reminderType) {
        // More than 7 days out: the fixed "あと7日" copy would be false, so no
        // email yet — schedule the first look for 7 days before it falls due.
        await supabase
          .from('invoices')
          .update({ next_reminder_date: firstReminderDate(invoice.due_date) })
          .eq('id', invoice.id)
          .eq('org_id', orgId)
        results.details.push({
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          status: 'skipped',
          reason: `not due for a reminder until ${firstReminderDate(invoice.due_date)}`,
        })
        continue
      }

      const recipientLocale: RecipientLocale = localeByEmail.get(invoice.client_email) ?? 'en'
      const { subject, html } = generateReminderEmail(invoice, reminderType, recipientLocale, identity)

      // Send email
      const emailResult = await sendReminderEmail({
        to: invoice.client_email,
        subject,
        html,
        invoiceNumber: invoice.invoice_number,
        orgId,
        senderUserId,
      })

      if (emailResult.success) {
        // Update invoice
        const nextReminderDate = new Date()
        nextReminderDate.setDate(nextReminderDate.getDate() + 7) // Next reminder in 7 days

        await supabase
          .from('invoices')
          .update({
            last_reminder_sent: new Date().toISOString(),
            reminder_count: (invoice.reminder_count || 0) + 1,
            next_reminder_date: nextReminderDate.toISOString().split('T')[0]
          })
          .eq('id', invoice.id)
          .eq('org_id', orgId)

        // Log reminder
        await supabase
          .from('invoice_reminders')
          .insert({
            invoice_id: invoice.id,
            reminder_type: reminderType,
            recipient_email: invoice.client_email,
            subject,
            status: 'sent'
          })

        results.sent++
        results.details.push({
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          client_email: invoice.client_email,
          status: 'sent',
          reminder_type: reminderType
        })
      } else {
        // Log failed reminder
        await supabase
          .from('invoice_reminders')
          .insert({
            invoice_id: invoice.id,
            reminder_type: reminderType,
            recipient_email: invoice.client_email,
            subject,
            status: 'failed',
            error_message: emailResult.error
          })

        results.failed++
        results.details.push({
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          client_email: invoice.client_email,
          status: 'failed',
          error: emailResult.error
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${invoices.length} invoices`,
      ...results
    })

  } catch (error: any) {
    console.error('Error processing reminders:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}