// ============================================
// /api/templates/schedule — queue / list / cancel future template sends.
// Org-scoped via orgAuth(); dispatched by /api/cron/dispatch-scheduled-sends.
// Ported from the sibling app (autoura-saas), tenant_id → org_id.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { orgAuth } from '@/lib/auth/org-auth'

// GET /api/templates/schedule?status=pending — list scheduled sends.
export async function GET(request: NextRequest) {
  try {
    const auth = await orgAuth()
    if (auth.error || !auth.supabase || !auth.org_id) {
      return NextResponse.json({ success: false, error: auth.error || 'Not authenticated' }, { status: auth.status })
    }
    const { supabase, org_id } = auth
    const status = new URL(request.url).searchParams.get('status')

    let query = supabase
      .from('scheduled_sends')
      .select('*, template:message_templates(id, name, channel)')
      .eq('org_id', org_id)
      .order('scheduled_for', { ascending: true })

    if (status && status !== 'all') query = query.eq('status', status)

    const { data, error } = await query
    if (error) {
      console.error('Error fetching scheduled sends:', error)
      return NextResponse.json({ success: false, error: 'Failed to fetch scheduled sends' }, { status: 500 })
    }
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Scheduled sends GET error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/templates/schedule — queue a new send.
export async function POST(request: NextRequest) {
  try {
    const auth = await orgAuth()
    if (auth.error || !auth.supabase || !auth.org_id) {
      return NextResponse.json({ success: false, error: auth.error || 'Not authenticated' }, { status: auth.status })
    }
    const { supabase, org_id, user } = auth
    const body = await request.json()
    const {
      templateId,
      recipientType,
      recipientId,
      recipientContact,
      channel,
      subject,
      body: messageBody,
      scheduledFor,
      timezone,
    } = body

    if (!templateId || !recipientContact || !messageBody || !scheduledFor || !channel) {
      return NextResponse.json(
        { success: false, error: 'Template, recipient, channel, message body, and scheduled time are required' },
        { status: 400 }
      )
    }

    const scheduledDate = new Date(scheduledFor)
    if (Number.isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
      return NextResponse.json({ success: false, error: 'Scheduled time must be a valid future time' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('scheduled_sends')
      .insert({
        org_id,
        template_id: templateId,
        recipient_type: recipientType || 'client',
        recipient_id: recipientId,
        recipient_contact: recipientContact,
        channel,
        subject,
        body: messageBody,
        scheduled_for: scheduledFor,
        timezone: timezone || 'UTC',
        status: 'pending',
        created_by: user?.id ?? null,
      })
      .select()
      .single()

    if (error) {
      console.error('Error scheduling send:', error)
      return NextResponse.json({ success: false, error: 'Failed to schedule send' }, { status: 500 })
    }
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Schedule POST error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/templates/schedule?id=... — cancel a pending scheduled send.
export async function DELETE(request: NextRequest) {
  try {
    const auth = await orgAuth()
    if (auth.error || !auth.supabase || !auth.org_id) {
      return NextResponse.json({ success: false, error: auth.error || 'Not authenticated' }, { status: auth.status })
    }
    const { supabase, org_id } = auth
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 })

    const { error } = await supabase
      .from('scheduled_sends')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('org_id', org_id)
      .eq('status', 'pending') // only pending sends can be cancelled

    if (error) {
      console.error('Error cancelling scheduled send:', error)
      return NextResponse.json({ success: false, error: 'Failed to cancel scheduled send' }, { status: 500 })
    }
    return NextResponse.json({ success: true, message: 'Scheduled send cancelled' })
  } catch (error) {
    console.error('Schedule DELETE error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
