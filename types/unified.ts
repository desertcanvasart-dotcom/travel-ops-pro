// ============================================
// TRAVELOPS PRO - UNIFIED CONVERSATION TYPES
// Type definitions for Unified Conversation System
// ============================================

// ============================================
// CHANNEL TYPES
// ============================================

export type ConversationChannel = 'whatsapp' | 'email'
export type MessageDirection = 'inbound' | 'outbound'
export type ConversationStatus = 'active' | 'archived' | 'spam' | 'blocked'
export type SyncStatus = 'idle' | 'running' | 'failed'

// ============================================
// EMAIL CONVERSATION TYPES
// ============================================

export interface EmailConversation {
  id: string

  // Gmail identifiers
  thread_id: string
  user_id: string

  // Client linking
  client_id: string | null
  client_name: string | null
  client_email: string | null

  // Thread metadata
  subject: string | null
  last_message_snippet: string | null
  last_message_at: string | null
  message_count: number

  // Status tracking
  unread_count: number
  status: ConversationStatus
  is_starred: boolean
  is_hidden: boolean

  // Assignment
  assigned_team_member_id: string | null
  assigned_at: string | null

  // Gmail sync
  last_sync_at: string | null
  gmail_history_id: string | null

  // Timestamps
  created_at: string
  updated_at: string

  // Joined relations (optional)
  client?: {
    id: string
    first_name: string
    last_name: string
    email: string
    client_code: string
  } | null
  assigned_agent?: {
    id: string
    name: string
    email: string | null
    avatar_url: string | null
    is_available: boolean
  } | null
}

export interface EmailMessage {
  id: string

  // Relationships
  conversation_id: string

  // Gmail identifiers
  message_id: string
  thread_id: string

  // Message content
  direction: MessageDirection
  from_address: string
  to_addresses: string[]
  cc_addresses: string[] | null
  bcc_addresses: string[] | null
  subject: string | null
  body_text: string | null
  body_html: string | null
  snippet: string | null

  // Attachments
  attachments: EmailAttachment[]

  // Status
  is_read: boolean
  is_starred: boolean
  labels: string[] | null

  // Timestamps
  sent_at: string
  received_at: string | null
  created_at: string
}

export interface EmailAttachment {
  id: string
  filename: string
  mimeType: string
  size: number
}

export interface EmailSyncState {
  id: string
  user_id: string
  last_history_id: string | null
  last_full_sync_at: string | null
  last_incremental_sync_at: string | null
  sync_status: SyncStatus
  error_message: string | null
  emails_synced: number
  created_at: string
  updated_at: string
}

// ============================================
// UNIFIED CONVERSATION TYPES
// ============================================

export interface UnifiedConversation {
  id: string
  channel: ConversationChannel
  identifier: string // phone_number for WhatsApp, thread_id for email

  // Client linking
  client_id: string | null
  client_name: string | null
  client_email: string | null
  contact_info: string // phone or email

  // Metadata
  subject: string | null // Email only
  last_message_snippet: string | null
  last_message_at: string | null

  // Status
  unread_count: number
  status: ConversationStatus

  // Assignment
  assigned_team_member_id: string | null
  assigned_at: string | null

  // Timestamps
  created_at: string
  updated_at: string
  is_hidden: boolean

  // Joined relations (optional)
  client?: {
    id: string
    first_name: string
    last_name: string
    email: string
    client_code: string
    phone?: string
  } | null
  assigned_agent?: {
    id: string
    name: string
    email: string | null
    avatar_url: string | null
    is_available: boolean
    current_conversations: number
    max_conversations: number
  } | null
}

export interface UnifiedMessage {
  id: string
  channel: ConversationChannel
  conversation_id: string
  direction: MessageDirection

  // Content
  content: string // message_body for WhatsApp, body_text/body_html for email
  isHtml?: boolean // true when content is HTML (email body_html)
  snippet: string | null

  // Email-specific
  subject?: string | null
  from_address?: string
  to_addresses?: string[]

  // Media/Attachments
  media_url?: string | null // WhatsApp
  media_type?: string | null // WhatsApp
  attachments?: EmailAttachment[] // Email

  // Status
  status: string
  is_read?: boolean

  // Timestamps
  sent_at: string
  created_at: string
}

// ============================================
// CLIENT CONVERSATION SUMMARY
// ============================================

export interface ClientConversationSummary {
  client_id: string
  client_code: string
  client_name: string
  client_email: string | null
  client_phone: string | null

  // Conversation counts
  whatsapp_conversations: number
  email_conversations: number
  total_conversations: number

  // Last activity
  last_whatsapp_at: string | null
  last_email_at: string | null
  last_activity_at: string | null

  // Unread counts
  whatsapp_unread: number
  email_unread: number
  total_unread: number
}

// ============================================
// FORM & FILTER TYPES
// ============================================

export interface UnifiedConversationFilters {
  channel?: ConversationChannel | 'all'
  status?: ConversationStatus
  client_id?: string
  assigned_team_member_id?: string
  unassigned_only?: boolean
  has_unread?: boolean
  search?: string // Search in contact_info, client_name, subject
}

export interface EmailConversationFormData {
  thread_id: string
  user_id: string
  client_email?: string
  subject?: string
}

export interface EmailMessageFormData {
  conversation_id: string
  message_id: string
  thread_id: string
  direction: MessageDirection
  from_address: string
  to_addresses: string[]
  cc_addresses?: string[]
  subject?: string
  body_text?: string
  body_html?: string
  snippet?: string
  attachments?: EmailAttachment[]
  sent_at: string
  is_read?: boolean
  labels?: string[]
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

export interface UnifiedConversationsApiResponse {
  success: boolean
  data?: UnifiedConversation[]
  total?: number
  error?: string
}

export interface EmailConversationApiResponse {
  success: boolean
  data?: EmailConversation
  created?: boolean
  error?: string
}

export interface EmailMessagesApiResponse {
  success: boolean
  data?: EmailMessage[]
  total?: number
  error?: string
}

export interface EmailSyncApiResponse {
  success: boolean
  conversations_synced?: number
  messages_synced?: number
  history_id?: string
  error?: string
}

export interface ClientConversationsApiResponse {
  success: boolean
  data?: {
    client: {
      id: string
      client_code: string
      first_name: string
      last_name: string
      email: string | null
      phone: string | null
    }
    whatsapp_conversations: UnifiedConversation[]
    email_conversations: UnifiedConversation[]
  }
  error?: string
}

// ============================================
// SYNC TYPES
// ============================================

export interface EmailSyncOptions {
  user_id: string
  full_sync?: boolean // If true, sync last 30 days. If false, incremental only
  max_results?: number
  days_back?: number // For initial sync, default 30
}

export interface EmailSyncResult {
  success: boolean
  conversations_created: number
  conversations_updated: number
  messages_created: number
  history_id: string | null
  error?: string
}

// ============================================
// ACTIVITY TYPES (extends existing)
// ============================================

export type UnifiedActivityType =
  | 'assigned'
  | 'claimed'
  | 'transferred'
  | 'unassigned'
  | 'auto_assigned'
  | 'replied'
  | 'note_added'
  | 'status_changed'
  | 'viewed'
  | 'exported'
  | 'email_sent'
  | 'email_received'

export interface UnifiedActivity {
  id: string
  conversation_id: string
  channel: ConversationChannel
  agent_id: string | null
  action_type: UnifiedActivityType
  action_details: Record<string, unknown> | null
  created_at: string

  // Joined relations
  agent?: {
    id: string
    name: string
    avatar_url: string | null
  } | null
}
