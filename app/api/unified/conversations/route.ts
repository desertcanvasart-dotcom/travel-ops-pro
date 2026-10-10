import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { sanitizeSearchTerm } from '@/lib/db/sanitize-search'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, requireRole } from '@/lib/auth/current-org'
import type { UnifiedConversation, UnifiedConversationFilters } from '@/types/unified'
import { waitingSince } from '@/lib/email/automated-senders'
import { tripThreads } from '@/lib/unified/trip-threads'

// Use service role for API routes to bypass RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/unified/conversations - List all conversations across channels
//
// Role-gated to match the /inbox page — middleware only gates pages.
export async function GET(request: NextRequest) {
  try {
    const forbidden = await requireRole(['admin', 'manager', 'agent'])
    if (forbidden) return forbidden

    const { searchParams } = new URL(request.url)

    // Parse filters
    const channel = searchParams.get('channel') || 'all'
    const status = searchParams.get('status') || 'all' // Default to 'all' to show all conversations
    const clientId = searchParams.get('client_id')
    const agentId = searchParams.get('agent_id')
    const unassignedOnly = searchParams.get('unassigned_only') === 'true'
    const hasUnread = searchParams.get('has_unread') === 'true'
    // Customers still waiting for an answer (email; lib/email/reply-status).
    const awaitingReply = searchParams.get('awaiting_reply') === 'true'
    const search = sanitizeSearchTerm(searchParams.get('search')) || ''
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // We'll query both tables separately and merge, since views can be tricky with Supabase
    const conversations: UnifiedConversation[] = []

    // Query WhatsApp conversations
    const whatsappTask = (async () => {
    if (channel === 'all' || channel === 'whatsapp') {
      // The org's own threads — the ones that came to its WhatsApp number
      // (migration 20261125). This listed every org's.
      const orgId = await getCurrentOrgId()
      if (!orgId) return
      let waQuery = supabase
        .from('whatsapp_conversations')
        .select(`
          *,
          client:clients (
            id,
            first_name,
            last_name,
            email,
            client_code,
            phone
          ),
          assigned_agent:team_members!whatsapp_conversations_assigned_team_member_id_fkey (
            id,
            name,
            email,
            avatar_url,
            is_available,
            current_conversations,
            max_conversations
          )
        `)
        .eq('org_id', orgId)
        .or('is_hidden.is.null,is_hidden.eq.false')
        .order('last_message_at', { ascending: false, nullsFirst: false })

      // Only filter by status if not 'all'
      if (status !== 'all') {
        waQuery = waQuery.eq('status', status)
      }

      if (clientId) waQuery = waQuery.eq('client_id', clientId)
      if (agentId) waQuery = waQuery.eq('assigned_team_member_id', agentId)
      if (unassignedOnly) waQuery = waQuery.is('assigned_team_member_id', null)
      if (hasUnread) waQuery = waQuery.gt('unread_count', 0)
      if (search) {
        waQuery = waQuery.or(`phone_number.ilike.%${search}%,client_name.ilike.%${search}%`)
      }

      const { data: waData, error: waError } = await waQuery.limit(limit)

      // As trip chats below: one channel failing must not take the inbox down.
      // Before 20261125 has run (whatsapp_conversations.org_id) the scoped
      // read fails; WhatsApp is then absent — never listed unscoped — and the
      // other channels still load.
      if (waError) console.error('[unified conversations] WhatsApp chats unavailable:', waError.message)

      // Transform WhatsApp data to unified format
      for (const conv of waError ? [] : waData || []) {
        conversations.push({
          id: conv.id,
          channel: 'whatsapp',
          identifier: conv.phone_number,
          client_id: conv.client_id,
          client_name: conv.client_name,
          client_email: conv.client?.email || null,
          contact_info: conv.phone_number,
          subject: null,
          last_message_snippet: conv.last_message,
          last_message_at: conv.last_message_at,
          unread_count: conv.unread_count || 0,
          status: conv.status,
          assigned_team_member_id: conv.assigned_team_member_id,
          assigned_at: conv.assigned_at,
          created_at: conv.created_at,
          updated_at: conv.updated_at,
          is_hidden: conv.is_hidden || false,
          client: conv.client ? {
            ...conv.client,
            full_name: `${conv.client.first_name || ''} ${conv.client.last_name || ''}`.trim()
          } : null,
          assigned_agent: conv.assigned_agent
        })
      }
    }
    })()

    // Query portal conversations — the traveller writing from their own
    // booking page. Unlike the other two these are keyed on a BOOKING rather
    // than a phone number or an address, so the same person's portal thread and
    // WhatsApp chat stay separate. That is deliberate: one is tied to a trip.
    const portalTask = (async () => {
    if (channel === 'all' || channel === 'portal') {
      let portalQuery = supabase
        .from('portal_message_threads')
        .select(`
          id,
          booking_id,
          passenger_id,
          last_message_at,
          last_message_snippet,
          last_sender,
          staff_last_read_at,
          created_at,
          updated_at,
          booking:bookings (
            id,
            booking_code,
            trip_name,
            client_name,
            client_email
          ),
          passenger:booking_passengers (
            first_name,
            last_name,
            family_name_kanji,
            given_name_kanji
          )
        `)
        .order('last_message_at', { ascending: false, nullsFirst: false })

      // No client filter: bookings carry the client's details inline and have
      // no client_id, so a portal thread cannot be narrowed to one client the
      // way a WhatsApp or email conversation can. Filtering by client simply
      // returns no portal rows rather than the wrong ones.
      if (clientId) portalQuery = portalQuery.limit(0)

      const { data: portalData, error: portalError } = await portalQuery.limit(limit)
      if (portalError) throw portalError

      for (const thread of portalData || []) {
        const booking = Array.isArray(thread.booking) ? thread.booking[0] : thread.booking
        const pax = Array.isArray(thread.passenger) ? thread.passenger[0] : thread.passenger

        // A conversation nobody has written in yet is not a conversation.
        if (!thread.last_message_at) continue

        // Unread is derived, never stored: a message from the traveller newer
        // than the last time staff read the thread.
        const unread =
          thread.last_sender === 'customer' &&
          (!thread.staff_last_read_at || thread.last_message_at > thread.staff_last_read_at)
            ? 1
            : 0

        if (hasUnread && unread === 0) continue

        const travellerName = pax
          ? [pax.family_name_kanji, pax.given_name_kanji].filter(Boolean).join(' ')
            || [pax.last_name, pax.first_name].filter(Boolean).join(' ')
          : null

        const who = travellerName || booking?.client_name || 'Traveller'
        if (search && !`${who} ${booking?.booking_code ?? ''}`.toLowerCase().includes(search.toLowerCase())) {
          continue
        }

        conversations.push({
          id: thread.id,
          channel: 'portal',
          identifier: booking?.booking_code || thread.booking_id,
          client_id: null,
          client_name: who,
          client_email: booking?.client_email || null,
          contact_info: booking?.booking_code || null,
          // Saying WHICH conversation this is matters here in a way it does not
          // for the other channels: one booking can hold a shared thread and a
          // private thread per traveller.
          subject: thread.passenger_id
            ? `${booking?.trip_name || 'Trip'} — ${travellerName || 'traveller'} (private)`
            : `${booking?.trip_name || 'Trip'} — whole party`,
          last_message_snippet: thread.last_message_snippet,
          last_message_at: thread.last_message_at,
          unread_count: unread,
          status: 'active',
          assigned_team_member_id: null,
          assigned_at: null,
          created_at: thread.created_at,
          updated_at: thread.updated_at,
          is_hidden: false,
          client: null,
          assigned_agent: null,
        })
      }
    }
    })()

    // Trip chats — the traveller writing from the trip's share link
    // (trip_messages). One conversation per itinerary, its id the itinerary's
    // id, so the thread opens on /api/itineraries/[id]/messages like the trip
    // page's own chat. Built from the org's newest messages: a thread nobody
    // has written in among the latest TRIP_WINDOW messages is old enough to
    // drop off the list (it is still on its trip page).
    const tripTask = (async () => {
    if (channel === 'all' || channel === 'trip') {
      // Like portal threads, a trip thread has no client_id to filter on.
      if (clientId) return
      const orgId = await getCurrentOrgId()
      if (!orgId) return
      const TRIP_WINDOW = 1000
      const { data: rows, error: tripError } = await supabase
        .from('trip_messages')
        .select('itinerary_id, direction, content, sender_name, is_read, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(TRIP_WINDOW)
      // One channel failing must not take the inbox down with it: before the
      // trip_messages migration has run, or on a failed read, the other
      // channels still list and trip chats are simply absent.
      if (tripError) {
        console.error('[unified conversations] trip chats unavailable:', tripError.message)
        return
      }

      const threads = new Map(tripThreads(rows ?? []).map(t => [t.itineraryId, t]))
      if (threads.size === 0) return

      const { data: trips, error: tripsError } = await supabase
        .from('itineraries')
        .select('id, itinerary_code, trip_name, client_name, client_email, client_id')
        .eq('org_id', orgId)
        .in('id', [...threads.keys()])
      if (tripsError) {
        console.error('[unified conversations] trip chats unavailable:', tripsError.message)
        return
      }

      for (const trip of trips ?? []) {
        const t = threads.get(trip.id)!
        if (hasUnread && t.unread === 0) continue
        const who = trip.client_name || t.traveller || 'Traveller'
        if (search && !`${who} ${trip.itinerary_code ?? ''} ${trip.trip_name ?? ''}`.toLowerCase().includes(search.toLowerCase())) continue
        conversations.push({
          id: trip.id,
          channel: 'trip',
          identifier: trip.itinerary_code || trip.id,
          client_id: trip.client_id,
          client_name: who,
          client_email: trip.client_email || null,
          contact_info: trip.itinerary_code || '',
          subject: trip.trip_name || null,
          last_message_snippet: t.lastContent?.slice(0, 140) ?? null,
          last_message_at: t.lastAt,
          unread_count: t.unread,
          status: 'active',
          assigned_team_member_id: null,
          assigned_at: null,
          created_at: t.firstAt,
          updated_at: t.lastAt,
          is_hidden: false,
          client: null,
          assigned_agent: null,
        })
      }
    }
    })()

    // Query Email conversations
    const emailTask = (async () => {
    if (channel === 'all' || channel === 'email') {
      let emailQuery = supabase
        .from('email_conversations')
        .select(`
          *,
          client:clients (
            id,
            first_name,
            last_name,
            email,
            client_code,
            phone,
            status,
            lead_source
          ),
          assigned_agent:team_members!email_conversations_assigned_team_member_id_fkey (
            id,
            name,
            email,
            avatar_url,
            is_available,
            current_conversations,
            max_conversations
          )
        `)
        .or('is_hidden.is.null,is_hidden.eq.false')
        .order('last_message_at', { ascending: false, nullsFirst: false })

      // Only filter by status if not 'all'
      if (status !== 'all') {
        emailQuery = emailQuery.eq('status', status)
      }

      if (clientId) emailQuery = emailQuery.eq('client_id', clientId)
      if (agentId) emailQuery = emailQuery.eq('assigned_team_member_id', agentId)
      if (unassignedOnly) emailQuery = emailQuery.is('assigned_team_member_id', null)
      if (hasUnread) emailQuery = emailQuery.gt('unread_count', 0)
      if (awaitingReply) emailQuery = emailQuery.not('awaiting_reply_since', 'is', null)
      if (search) {
        emailQuery = emailQuery.or(`client_email.ilike.%${search}%,client_name.ilike.%${search}%,subject.ilike.%${search}%`)
      }

      const { data: emailData, error: emailError } = await emailQuery.limit(limit)

      if (emailError) throw emailError

      // Transform Email data to unified format
      for (const conv of emailData || []) {
        conversations.push({
          id: conv.id,
          channel: 'email',
          identifier: conv.thread_id,
          client_id: conv.client_id,
          client_name: conv.client_name,
          client_email: conv.client_email,
          contact_info: conv.client_email || '',
          subject: conv.subject,
          last_message_snippet: conv.last_message_snippet,
          last_message_at: conv.last_message_at,
          unread_count: conv.unread_count || 0,
          status: conv.status,
          // A no-reply or service address is nobody waiting: no badge, and the
          // "awaiting reply" filter below drops it (lib/email/automated-senders).
          awaiting_reply_since: waitingSince(conv.client_email, conv.awaiting_reply_since),
          assigned_team_member_id: conv.assigned_team_member_id,
          assigned_at: conv.assigned_at,
          created_at: conv.created_at,
          updated_at: conv.updated_at,
          is_hidden: conv.is_hidden || false,
          client: conv.client ? {
            ...conv.client,
            full_name: `${conv.client.first_name || ''} ${conv.client.last_name || ''}`.trim()
          } : null,
          assigned_agent: conv.assigned_agent
        })
      }
    }
    })()

    // The three channels are independent reads of different tables, and this
    // list is polled while the inbox is open: they used to run one after the
    // other (three sequential round trips per poll). Each task pushes into
    // `conversations`, which is sorted below, so running them together changes
    // nothing but the wait.
    await Promise.all([whatsappTask, portalTask, tripTask, emailTask])

    // Awaiting reply is an email state; the other channels have none.
    if (awaitingReply) {
      for (let i = conversations.length - 1; i >= 0; i--) {
        if (!conversations[i].awaiting_reply_since) conversations.splice(i, 1)
      }
    }

    // Sort all conversations by last_message_at
    conversations.sort((a, b) => {
      const dateA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
      const dateB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
      return dateB - dateA
    })

    // Apply limit after merge
    const limitedConversations = conversations.slice(offset, offset + limit)

    return NextResponse.json({
      conversations: limitedConversations,
      total: conversations.length,
      success: true
    })
  } catch (error: any) {
    console.error('Error fetching unified conversations:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error'), success: false }, { status: 500 })
  }
}
