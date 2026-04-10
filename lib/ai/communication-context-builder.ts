// ============================================
// AI COMMUNICATION CONTEXT BUILDER
// ============================================
// Builds a rich context object for Claude by pulling
// client, itinerary, invoice, payment, and message data
// from the database for a given copilot thread.
// ============================================

import { SupabaseClient } from '@supabase/supabase-js'
import {
  CopilotContext,
  CopilotContextClient,
  CopilotContextItinerary,
  CopilotContextInvoice,
  CopilotContextPayment,
  CopilotContextMessage,
} from '@/types/copilot'

/**
 * Build the full communication context for a copilot thread.
 * Queries are capped to keep Claude's input under ~4000 tokens.
 */
export async function buildCommunicationContext(
  threadId: string,
  supabase: SupabaseClient
): Promise<CopilotContext> {
  // 1. Get the thread to determine client, channel, and linked conversations
  const { data: thread, error: threadError } = await supabase
    .from('communication_threads')
    .select('id, channel, client_id, whatsapp_conversation_id, email_conversation_id')
    .eq('id', threadId)
    .single()

  if (threadError || !thread) {
    console.error('Failed to fetch thread for context:', threadError)
    return emptyContext()
  }

  // Run all queries in parallel for efficiency
  const [client, itineraries, invoices, payments, recentMessages] = await Promise.all([
    thread.client_id ? fetchClient(thread.client_id, supabase) : Promise.resolve(null),
    thread.client_id ? fetchItineraries(thread.client_id, supabase) : Promise.resolve([]),
    thread.client_id ? fetchInvoices(thread.client_id, supabase) : Promise.resolve([]),
    thread.client_id ? fetchPayments(thread.client_id, supabase) : Promise.resolve([]),
    fetchRecentMessages(thread, supabase),
  ])

  return {
    client,
    itineraries,
    invoices,
    payments,
    recent_messages: recentMessages,
  }
}

function emptyContext(): CopilotContext {
  return {
    client: null,
    itineraries: [],
    invoices: [],
    payments: [],
    recent_messages: [],
  }
}

// ============================================
// INDIVIDUAL FETCHERS
// ============================================

async function fetchClient(
  clientId: string,
  supabase: SupabaseClient
): Promise<CopilotContextClient | null> {
  const { data: client, error } = await supabase
    .from('clients')
    .select('id, first_name, last_name, email, phone, nationality, preferred_language, notes')
    .eq('id', clientId)
    .single()

  if (error || !client) return null

  // Count total bookings for this client
  const { count } = await supabase
    .from('itineraries')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)

  return {
    id: client.id,
    name: `${client.first_name || ''} ${client.last_name || ''}`.trim(),
    email: client.email,
    phone: client.phone,
    nationality: client.nationality,
    language: client.preferred_language,
    notes: client.notes,
    total_bookings: count || 0,
  }
}

async function fetchItineraries(
  clientId: string,
  supabase: SupabaseClient
): Promise<CopilotContextItinerary[]> {
  const { data, error } = await supabase
    .from('itineraries')
    .select('id, itinerary_code, tour_name, destination, start_date, end_date, status, number_of_adults, number_of_children, total_cost, currency')
    .eq('client_id', clientId)
    .order('start_date', { ascending: false })
    .limit(3)

  if (error || !data) return []

  return data.map((it) => ({
    id: it.id,
    reference: it.itinerary_code,
    tour_name: it.tour_name,
    destination: it.destination,
    start_date: it.start_date,
    end_date: it.end_date,
    status: it.status,
    pax: (it.number_of_adults || 0) + (it.number_of_children || 0),
    quoted_amount: it.total_cost,
    currency: it.currency,
  }))
}

async function fetchInvoices(
  clientId: string,
  supabase: SupabaseClient
): Promise<CopilotContextInvoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_type, total_amount, amount_paid, balance_due, status, due_date, currency')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(5)

  if (error || !data) return []

  return data.map((inv) => ({
    id: inv.id,
    invoice_number: inv.invoice_number,
    invoice_type: inv.invoice_type,
    total_amount: inv.total_amount,
    amount_paid: inv.amount_paid,
    balance_due: inv.balance_due,
    status: inv.status,
    due_date: inv.due_date,
    currency: inv.currency,
  }))
}

async function fetchPayments(
  clientId: string,
  supabase: SupabaseClient
): Promise<CopilotContextPayment[]> {
  // Payments are linked to invoices, which are linked to clients
  const { data: invoiceIds, error: invoiceError } = await supabase
    .from('invoices')
    .select('id')
    .eq('client_id', clientId)

  if (invoiceError || !invoiceIds || invoiceIds.length === 0) return []

  const ids = invoiceIds.map((inv) => inv.id)

  const { data, error } = await supabase
    .from('invoice_payments')
    .select('id, amount, currency, payment_method, status, payment_date')
    .in('invoice_id', ids)
    .order('payment_date', { ascending: false })
    .limit(10)

  if (error || !data) return []

  return data.map((p) => ({
    id: p.id,
    amount: p.amount,
    currency: p.currency,
    payment_method: p.payment_method,
    status: p.status,
    paid_at: p.payment_date,
  }))
}

async function fetchRecentMessages(
  thread: { channel: string; whatsapp_conversation_id: string | null; email_conversation_id: string | null },
  supabase: SupabaseClient
): Promise<CopilotContextMessage[]> {
  if (thread.channel === 'whatsapp' && thread.whatsapp_conversation_id) {
    const { data, error } = await supabase
      .from('whatsapp_messages')
      .select('direction, message_body, sent_at')
      .eq('conversation_id', thread.whatsapp_conversation_id)
      .order('sent_at', { ascending: false })
      .limit(10)

    if (error || !data) return []

    return data.reverse().map((m) => ({
      direction: m.direction,
      body: m.message_body || '',
      sent_at: m.sent_at,
    }))
  }

  if (thread.channel === 'email' && thread.email_conversation_id) {
    const { data, error } = await supabase
      .from('email_messages')
      .select('direction, body_text, sent_at')
      .eq('conversation_id', thread.email_conversation_id)
      .order('sent_at', { ascending: false })
      .limit(10)

    if (error || !data) return []

    return data.reverse().map((m) => ({
      direction: m.direction,
      body: m.body_text || '',
      sent_at: m.sent_at,
    }))
  }

  return []
}
