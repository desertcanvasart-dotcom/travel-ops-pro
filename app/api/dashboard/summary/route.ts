import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, getCurrentUserRole, noOrgResponse } from '@/lib/auth/current-org'
import { scopedToConnectedMailboxes } from '@/lib/email/connected-mailboxes'
import { shiftDateISO, todayFromRequest } from '@/lib/today'
import { quotePipeline, STAFF_ROLES } from '@/lib/dashboard/figures'
import { roleAllows } from '@/lib/auth/roles'

// ============================================
// DASHBOARD SUMMARY — one round trip for the operator's morning view
// ============================================
// Replaces the old dashboard's browser-side scatter of reads (which could only
// see clients/follow-ups/itineraries) and its HARDCODED numbers: "+12% from
// last month" was a string literal, "Today's Summary" was three zeros, and
// "System Status" was decorative. Every figure returned here is computed from
// the database; trends are real period-over-period counts or absent.

export async function GET(request: NextRequest) {
  try {
    // createServerClient() is SERVICE-ROLE: it bypasses RLS, so nothing filters
    // these queries except what is written here. Until this line existed, every
    // figure on the dashboard counted EVERY organisation's rows — which is how
    // "Dashboard says 7 quotes, Itineraries says 1" happened: the 7 included
    // another org's trip, and B2B trips the list deliberately hides.
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const supabase = createServerClient()

    // The caller's calendar date, not the UTC server's — the same "today" the
    // attention and money routes use (see todayFromRequest).
    const todayDate = todayFromRequest(request.url)
    const in7 = shiftDateISO(todayDate, 7)
    const in30 = shiftDateISO(todayDate, 30)
    const monthStart = `${todayDate.slice(0, 7)}-01`
    const prevMonthStart = shiftDateISO(monthStart, -1).slice(0, 7) + '-01'
    // Timestamp columns are compared from the start of that date (UTC).
    const todayStart = `${todayDate}T00:00:00Z`

    // Recent quotes name customers; the itineraries API they used to come
    // from is staff-only, so they still are.
    const role = await getCurrentUserRole()
    const isStaff = roleAllows(role, STAFF_ROLES)

    const OPEN_TASK = ['done', 'completed', 'cancelled'] // anything else is open

    const [
      departingSoon,
      departingSoonCount,
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
      recentQuotes,
    ] = await Promise.all([
      // Bookings (any status but cancelled) leaving in the next 7 days — the
      // "get ready" list. The list is capped; the count below is not.
      supabase.from('bookings')
        .select('id, booking_code, trip_name, client_name, start_date, status')
        .eq('org_id', orgId)
        .neq('status', 'cancelled')
        .gte('start_date', todayDate)
        .lt('start_date', in7)
        .order('start_date', { ascending: true })
        .limit(6),
      supabase.from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .neq('status', 'cancelled')
        .gte('start_date', todayDate)
        .lt('start_date', in7),
      // Trips on the ground right now
      supabase.from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .neq('status', 'cancelled')
        .lte('start_date', todayDate)
        .gte('end_date', todayDate),
      // NOT org-scoped, and cannot be: tasks, email_conversations and
      // client_followups have NO org_id column at all (adding
      // .eq('org_id', ...) to them returns a 400). They predate organisations;
      // scoping them is the deferred G1 work. Called out here so the omission
      // reads as known rather than missed. (whatsapp_conversations has org_id
      // since 20261125 and is scoped below.)
      // Open tasks with a due date (split due-today vs overdue in JS)
      supabase.from('tasks')
        .select('id, due_date, status')
        .not('status', 'in', `(${OPEN_TASK.join(',')})`)
        .not('due_date', 'is', null),
      // Unread counts straight from the conversation tables (hidden rows excluded)
      supabase.from('whatsapp_conversations')
        .select('unread_count')
        .eq('org_id', orgId)
        .or('is_hidden.is.null,is_hidden.eq.false')
        .gt('unread_count', 0),
      // Only a connected address's mail (lib/email/connected-mailboxes).
      scopedToConnectedMailboxes(supabase, (mailboxFilter) => {
        let q = supabase.from('email_conversations')
          .select('unread_count')
          .or('is_hidden.is.null,is_hidden.eq.false')
          .gt('unread_count', 0)
        if (mailboxFilter) q = q.or(mailboxFilter)
        return q
      }),
      supabase.from('client_followups')
        .select('id, due_date')
        .eq('status', 'pending'),
      supabase.from('clients').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
      supabase.from('clients').select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .gte('created_at', monthStart),
      supabase.from('clients').select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .gte('created_at', prevMonthStart).lt('created_at', monthStart),
      // Quote pipeline (B2C itineraries). `source != 'b2b_custom'` is what the
      // Itineraries list applies too — without it this counted B2B trips the
      // list deliberately hides, and the two screens disagreed by design.
      supabase.from('itineraries').select('id, status, start_date')
        .eq('org_id', orgId)
        .not('source', 'eq', 'b2b_custom'),
      supabase.from('itineraries').select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .not('source', 'eq', 'b2b_custom')
        .gte('created_at', todayStart),
      supabase.from('bookings').select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .gte('created_at', todayStart),
      // Money in only: a refund is a payments row too (payment_type 'refund')
      supabase.from('payments').select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .neq('payment_type', 'refund')
        .gte('payment_date', todayDate),
      // Recent Activity: the five newest quotes, only what the list shows —
      // the dashboard used to pull a 100-row page of /api/itineraries for it.
      isStaff
        ? supabase.from('itineraries')
            .select('id, itinerary_code, client_name, status, created_at')
            .eq('org_id', orgId)
            .not('source', 'eq', 'b2b_custom')
            .order('created_at', { ascending: false })
            .limit(5)
        : Promise.resolve({ data: [], error: null }),
    ])

    const openTaskRows = openTasks.data || []
    const followupRows = followups.data || []
    const quoteRows = quotes.data || []
    const sumUnread = (rows: { unread_count: number | null }[] | null) =>
      (rows || []).reduce((s, r) => s + (r.unread_count || 0), 0)

    const pipeline = quotePipeline(quoteRows)

    return NextResponse.json({
      success: true,
      data: {
        ops: {
          departingSoon: {
            count: departingSoonCount.count || 0,
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
          // due_date is a date: overdue once the day has passed, not on it
          overdue: followupRows.filter(f => f.due_date && f.due_date.slice(0, 10) < todayDate).length,
        },
        clients: {
          total: clientsTotal.count || 0,
          thisMonth: clientsThisMonth.count || 0,
          prevMonth: clientsPrevMonth.count || 0,
        },
        quotes: {
          total: quoteRows.length,
          sent: pipeline.sent,
          confirmed: pipeline.confirmed,
          upcoming30d: quoteRows.filter(q =>
            q.status === 'confirmed' && q.start_date &&
            q.start_date >= todayDate && q.start_date < in30
          ).length,
          recent: recentQuotes.data || [],
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
