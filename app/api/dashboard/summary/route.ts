import { NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

// ============================================
// DASHBOARD SUMMARY — one round trip for the operator's morning view
// ============================================
// Replaces the old dashboard's browser-side scatter of reads (which could only
// see clients/follow-ups/itineraries) and its HARDCODED numbers: "+12% from
// last month" was a string literal, "Today's Summary" was three zeros, and
// "System Status" was decorative. Every figure returned here is computed from
// the database; trends are real period-over-period counts or absent.

const iso = (d: Date) => d.toISOString()
const dayStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

export async function GET() {
  try {
    // createServerClient() is SERVICE-ROLE: it bypasses RLS, so nothing filters
    // these queries except what is written here. Until this line existed, every
    // figure on the dashboard counted EVERY organisation's rows — which is how
    // "Dashboard says 7 quotes, Itineraries says 1" happened: the 7 included
    // another org's trip, and B2B trips the list deliberately hides.
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const supabase = createServerClient()

    const now = new Date()
    const todayStart = dayStart(now)
    const in7 = new Date(todayStart); in7.setDate(in7.getDate() + 7)
    const in30 = new Date(todayStart); in30.setDate(in30.getDate() + 30)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const todayDate = todayStart.toISOString().slice(0, 10) // date-typed columns

    const OPEN_TASK = ['done', 'completed', 'cancelled'] // anything else is open

    const [
      departingSoon,
      inProgress,
      openTasks,
      waUnread,
      emailUnread,
      followups,
      clientsTotal,
      clientsThisMonth,
      clientsPrevMonth,
      quotes,
      quotesCreatedToday,
      bookingsCreatedToday,
      paymentsToday,
    ] = await Promise.all([
      // Confirmed trips leaving in the next 7 days — the "get ready" list
      supabase.from('bookings')
        .select('id, booking_code, trip_name, client_name, start_date, status')
        .eq('org_id', orgId)
        .neq('status', 'cancelled')
        .gte('start_date', todayDate)
        .lt('start_date', in7.toISOString().slice(0, 10))
        .order('start_date', { ascending: true })
        .limit(6),
      // Trips on the ground right now
      supabase.from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .neq('status', 'cancelled')
        .lte('start_date', todayDate)
        .gte('end_date', todayDate),
      // NOT org-scoped, and cannot be: tasks, whatsapp_conversations,
      // email_conversations and client_followups have NO org_id column at all
      // (adding .eq('org_id', ...) to them returns a 400). They predate
      // organisations; scoping them is the deferred G1 work. Called out here so
      // the omission reads as known rather than missed.
      // Open tasks with a due date (split due-today vs overdue in JS)
      supabase.from('tasks')
        .select('id, due_date, status')
        .not('status', 'in', `(${OPEN_TASK.join(',')})`)
        .not('due_date', 'is', null),
      // Unread counts straight from the conversation tables (hidden rows excluded)
      supabase.from('whatsapp_conversations')
        .select('unread_count')
        .or('is_hidden.is.null,is_hidden.eq.false')
        .gt('unread_count', 0),
      supabase.from('email_conversations')
        .select('unread_count')
        .or('is_hidden.is.null,is_hidden.eq.false')
        .gt('unread_count', 0),
      supabase.from('client_followups')
        .select('id, due_date')
        .eq('status', 'pending'),
      supabase.from('clients').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
      supabase.from('clients').select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .gte('created_at', iso(monthStart)),
      supabase.from('clients').select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .gte('created_at', iso(prevMonthStart)).lt('created_at', iso(monthStart)),
      // Quote pipeline (B2C itineraries). `source != 'b2b_custom'` is what the
      // Itineraries list applies too — without it this counted B2B trips the
      // list deliberately hides, and the two screens disagreed by design.
      supabase.from('itineraries').select('id, status, start_date')
        .eq('org_id', orgId)
        .not('source', 'eq', 'b2b_custom'),
      supabase.from('itineraries').select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .not('source', 'eq', 'b2b_custom')
        .gte('created_at', iso(todayStart)),
      supabase.from('bookings').select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .gte('created_at', iso(todayStart)),
      supabase.from('payments').select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .gte('payment_date', todayDate),
    ])

    const openTaskRows = openTasks.data || []
    const followupRows = followups.data || []
    const quoteRows = quotes.data || []
    const sumUnread = (rows: { unread_count: number | null }[] | null) =>
      (rows || []).reduce((s, r) => s + (r.unread_count || 0), 0)

    const quotesSent = quoteRows.filter(q => q.status === 'sent' || q.status === 'confirmed').length
    const quotesConfirmed = quoteRows.filter(q => q.status === 'confirmed').length

    return NextResponse.json({
      success: true,
      data: {
        ops: {
          departingSoon: {
            count: departingSoon.data?.length || 0,
            items: departingSoon.data || [],
          },
          inProgress: inProgress.count || 0,
          tasksDueToday: openTaskRows.filter(t => t.due_date?.slice(0, 10) === todayDate).length,
          tasksOverdue: openTaskRows.filter(t => t.due_date && t.due_date.slice(0, 10) < todayDate).length,
          unreadWhatsApp: sumUnread(waUnread.data),
          unreadEmail: sumUnread(emailUnread.data),
        },
        followups: {
          pending: followupRows.length,
          overdue: followupRows.filter(f => f.due_date && new Date(f.due_date) < now).length,
        },
        clients: {
          total: clientsTotal.count || 0,
          thisMonth: clientsThisMonth.count || 0,
          prevMonth: clientsPrevMonth.count || 0,
        },
        quotes: {
          total: quoteRows.length,
          sent: quotesSent,
          confirmed: quotesConfirmed,
          upcoming30d: quoteRows.filter(q =>
            q.status === 'confirmed' && q.start_date &&
            q.start_date >= todayDate && q.start_date < in30.toISOString().slice(0, 10)
          ).length,
        },
        today: {
          quotesCreated: quotesCreatedToday.count || 0,
          bookingsCreated: bookingsCreatedToday.count || 0,
          paymentsReceived: paymentsToday.count || 0,
        },
      },
    })
  } catch (error: any) {
    console.error('Error building dashboard summary:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}
