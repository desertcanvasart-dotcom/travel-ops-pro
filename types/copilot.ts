// ============================================
// TYPES: AI Communication Copilot
// ============================================

// ============================================
// DATABASE TABLE TYPES
// ============================================

export type CopilotChannel = 'whatsapp' | 'email'
export type ThreadStatus = 'open' | 'waiting' | 'resolved' | 'archived'
export type ThreadUrgency = 'low' | 'normal' | 'high' | 'urgent'
export type InboxStatus = 'new' | 'draft_pending' | 'draft_ready' | 'draft_failed' | 'responded' | 'skipped'
export type DraftStatus = 'pending' | 'approved' | 'rejected' | 'sent' | 'expired'
export type AIConfidence = 'high' | 'medium' | 'low'
export type CopilotTone = 'professional' | 'friendly' | 'formal'

export interface CopilotThread {
  id: string
  channel: CopilotChannel
  whatsapp_conversation_id: string | null
  email_conversation_id: string | null
  client_id: string | null
  client_name: string | null
  contact_info: string
  subject: string | null
  status: ThreadStatus
  urgency: ThreadUrgency
  last_message_at: string | null
  last_draft_at: string | null
  message_count: number
  created_at: string
  updated_at: string
  brief_id: string | null
  origin: string | null
}

export interface CopilotInboxMessage {
  id: string
  thread_id: string
  channel: CopilotChannel
  source_message_id: string
  sender_name: string | null
  sender_contact: string
  message_body: string
  message_snippet: string | null
  subject: string | null
  status: InboxStatus
  last_error: string | null
  received_at: string
  processed_at: string | null
  created_at: string
}

export interface AIFlags {
  escalate: boolean
  escalation_reason: string | null
  message_type: string
  urgency?: string
}

/**
 * What is actually stored in communication_drafts.ai_flags: the model's own
 * flags plus two facts only the caller knows. The analytics grouped drafts by
 * both of these long before anything wrote them.
 */
export type StoredDraftFlags = Partial<AIFlags> & {
  /** The tone the draft was written in. */
  tone: CopilotTone
  /** True when the poller drafted this before the operator opened the thread. */
  pregenerated: boolean
}

export interface CopilotDraft {
  id: string
  thread_id: string
  inbox_message_id: string
  parent_draft_id: string | null
  draft_body: string
  edited_body: string | null
  was_edited: boolean
  operator_notes: string | null
  ai_model: string | null
  ai_confidence: AIConfidence | null
  ai_flags: AIFlags & Partial<Pick<StoredDraftFlags, 'tone' | 'pregenerated'>>
  context_used: CopilotContext
  generation_time_ms: number | null
  status: DraftStatus
  reviewed_by: string | null
  reviewed_at: string | null
  sent_at: string | null
  send_channel: CopilotChannel | null
  send_message_id: string | null
  send_error: string | null
  created_at: string
}

export interface CopilotSettings {
  id: string
  user_id: string
  tone: CopilotTone
  created_at: string
  updated_at: string
}

// ============================================
// CONTEXT TYPES (passed to Claude)
// ============================================

export interface CopilotContextClient {
  id: string
  name: string
  email: string | null
  phone: string | null
  nationality: string | null
  language: string | null
  notes: string | null
  total_bookings: number
}

export interface CopilotContextItinerary {
  id: string
  reference: string | null
  tour_name: string | null
  destination: string | null
  start_date: string | null
  end_date: string | null
  status: string | null
  pax: number | null
  quoted_amount: number | null
  currency: string | null
}

export interface CopilotContextInvoice {
  id: string
  invoice_number: string | null
  invoice_type: string | null
  total_amount: number | null
  amount_paid: number | null
  balance_due: number | null
  status: string | null
  due_date: string | null
  currency: string | null
}

export interface CopilotContextPayment {
  id: string
  amount: number | null
  currency: string | null
  payment_method: string | null
  status: string | null
  paid_at: string | null
}

export interface CopilotContextMessage {
  direction: string
  body: string
  sent_at: string
}

/**
 * One knowledge-base entry that was retrieved for a draft. Stored on the
 * draft (context_used.retrieved) so the analytics can report which entries
 * are actually earning their place — the counts used to read this key while
 * nothing ever wrote it, so the RAG hit rate was permanently 0%.
 * Deliberately a reference, not the text: the entry itself lives in
 * copilot_knowledge.
 */
export interface CopilotRetrievedRef {
  id: string
  title: string | null
  source_type: string
  similarity: number
}

export interface CopilotContext {
  client: CopilotContextClient | null
  itineraries: CopilotContextItinerary[]
  invoices: CopilotContextInvoice[]
  payments: CopilotContextPayment[]
  recent_messages: CopilotContextMessage[]
  /** Present once retrieval has run; an empty array means "ran, found nothing". */
  retrieved?: CopilotRetrievedRef[]
}

// ============================================
// CLAUDE OUTPUT SCHEMA
// ============================================

export interface ClaudeDraftOutput {
  draft_body: string
  confidence: AIConfidence
  operator_notes: string
  flags: AIFlags
}

// ============================================
// API TYPES
// ============================================

export interface CopilotThreadWithLatest extends CopilotThread {
  latest_inbox?: CopilotInboxMessage | null
  latest_draft?: CopilotDraft | null
}

export interface CopilotThreadsResponse {
  success: boolean
  threads: CopilotThreadWithLatest[]
  total: number
}

export interface CopilotThreadCountResponse {
  success: boolean
  count: number
}

export interface CopilotInboxResponse {
  success: boolean
  messages: CopilotInboxMessage[]
}

export interface CopilotDraftResponse {
  success: boolean
  draft: CopilotDraft
}

export interface GenerateDraftRequest {
  inbox_message_id: string
  thread_id: string
  /** True when the background poller drafted this before the operator opened the thread. */
  pregenerated?: boolean
}

export interface ApproveDraftRequest {
  action: 'approve' | 'reject'
  edited_body?: string
}

export interface RegenerateDraftRequest {
  additional_instructions?: string
}

export interface CopilotSendResponse {
  success: boolean
  message_id?: string
  error?: string
}
