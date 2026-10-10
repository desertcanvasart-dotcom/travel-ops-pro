import { reminderBlocker, reminderStage, daysUntilDue } from '@/lib/invoices/reminder-schedule'
import { generateReminderEmail } from '@/lib/invoices/reminder-email'
import { NextRequest, NextResponse } from 'next/server'
import { orgIdentity } from '@/lib/org-identity'
import { clientMessage } from '@/lib/api-errors'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'
import { resolveClientLocalesByEmail } from '@/lib/i18n/recipient-locale'
import { sendEmailInternal } from '@/lib/email-send'
import { businessToday } from '@/lib/today'

// POST: Send reminder for a specific invoice
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params
    const supabase = createServerClient()

    // Get invoice
    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .single()

    if (error || !invoice) {
      return NextResponse.json(
        { success: false, error: 'Invoice not found' },
        { status: 404 }
      )
    }

    if (!invoice.client_email) {
      return NextResponse.json(
        { success: false, error: 'Invoice has no client email' },
        { status: 400 }
      )
    }

    if (Number(invoice.balance_due) <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invoice has no balance due' },
        { status: 400 }
      )
    }

    // A draft was never sent to the client; with no due date the reminder
    // would compute from new Date(null) — 1 January 1970.
    const blocked = reminderBlocker(invoice)
    if (blocked) {
      return NextResponse.json({ success: false, error: blocked }, { status: 400 })
    }

    // The client's own language and the stage the bulk send would use.
    const locale = (await resolveClientLocalesByEmail(supabase, [invoice.client_email], orgId)).get(invoice.client_email) ?? 'en'
    const stage = reminderStage(daysUntilDue(invoice.due_date, businessToday())) ?? 'default'
    const { subject, html } = generateReminderEmail(invoice, stage, locale, await orgIdentity(orgId))

    // Send via the shared in-process helper.
    const emailResult = await sendEmailInternal({
      to: invoice.client_email,
      subject,
      html,
      orgId,
      senderUserId: await getCurrentUserId(),
    })

    if (!emailResult.success) {
      
      // Log failed attempt
      await supabase
        .from('invoice_reminders')
        .insert({
          invoice_id: id,
          reminder_type: 'manual',
          recipient_email: invoice.client_email,
          subject,
          status: 'failed',
          error_message: emailResult.error || 'Failed to send'
        })

      return NextResponse.json(
        { success: false, error: emailResult.error || 'Failed to send email' },
        { status: 500 }
      )
    }

    // Update invoice
    const nextReminderDate = new Date()
    nextReminderDate.setDate(nextReminderDate.getDate() + 7)

    await supabase
      .from('invoices')
      .update({
        last_reminder_sent: new Date().toISOString(),
        reminder_count: (invoice.reminder_count || 0) + 1,
        next_reminder_date: nextReminderDate.toISOString().split('T')[0]
      })
      .eq('id', id)
      .eq('org_id', orgId)

    // Log reminder
    await supabase
      .from('invoice_reminders')
      .insert({
        invoice_id: id,
        reminder_type: 'manual',
        recipient_email: invoice.client_email,
        subject,
        status: 'sent'
      })

    return NextResponse.json({
      success: true,
      message: `Reminder sent to ${invoice.client_email}`,
      invoice_number: invoice.invoice_number
    })

  } catch (error: any) {
    console.error('Error sending reminder:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}

// GET: Get reminder history for an invoice
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params
    const supabase = createServerClient()

    // invoice_reminders is a child without org_id — verify the parent invoice
    // belongs to this org before listing its reminder history.
    const { data: parent } = await supabase
      .from('invoices')
      .select('id')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!parent) {
      return NextResponse.json(
        { success: false, error: 'Invoice not found' },
        { status: 404 }
      )
    }

    const { data: reminders, error } = await supabase
      .from('invoice_reminders')
      .select('*')
      .eq('invoice_id', id)
      .order('sent_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({
      success: true,
      reminders: reminders || []
    })

  } catch (error: any) {
    console.error('Error fetching reminders:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
} 