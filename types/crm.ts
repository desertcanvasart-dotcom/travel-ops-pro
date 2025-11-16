// ============================================
// TRAVELOPS PRO - CRM TYPESCRIPT TYPES
// Type definitions for Client Management System
// ============================================

export interface Client {
    id: string
    
    // Basic Information
    client_code: string // CLI-0001, CLI-0002, etc.
    first_name: string
    last_name: string
    email: string
    phone?: string
    alternative_phone?: string
    
    // Additional Details
    nationality?: string
    passport_type?: 'euro_passport' | 'other_passport'
    date_of_birth?: string
    preferred_language?: string
    
    // Address Information
    country?: string
    city?: string
    address_line1?: string
    address_line2?: string
    postal_code?: string
    
    // Contact Preferences
    preferred_contact_method?: 'email' | 'whatsapp' | 'phone' | 'sms'
    best_time_to_contact?: string
    timezone?: string
    
    // Travel Preferences
    preferred_accommodation_level?: 'budget' | 'moderate' | 'luxury' | 'ultra_luxury'
    dietary_restrictions?: string[]
    accessibility_needs?: string[]
    special_interests?: string[]
    
    // Business Information
    company_name?: string
    job_title?: string
    is_travel_agent: boolean
    agent_commission_rate?: number
    
    // Client Classification
    client_type: 'individual' | 'family' | 'group' | 'corporate' | 'agent'
    vip_status: boolean
    client_source?: string
    referred_by_client_id?: string
    
    // Marketing & Communication
    marketing_consent: boolean
    newsletter_subscribed: boolean
    sms_consent: boolean
    
    // Financial Information
    total_bookings_count: number
    total_revenue_generated: number
    currency_preference: string
    average_booking_value: number
    
    // Status & Tags
    status: 'active' | 'inactive' | 'blacklisted' | 'prospect'
    tags?: string[]
    rating?: number // 1-5 stars
    
    // System Fields
    created_at: string
    updated_at: string
    created_by?: string
    last_contacted_at?: string
    
    // Notes
    internal_notes?: string
  }
  
  export interface ClientContact {
    id: string
    client_id: string
    
    // Contact Information
    contact_type: 'primary' | 'emergency' | 'billing' | 'travel_companion'
    first_name: string
    last_name: string
    relationship?: string
    email?: string
    phone?: string
    
    // Additional Details
    date_of_birth?: string
    passport_number?: string
    passport_expiry?: string
    
    is_primary: boolean
    
    created_at: string
    updated_at: string
  }
  
  export interface CommunicationHistory {
    id: string
    client_id: string
    
    // Communication Details
    communication_type: 'email' | 'whatsapp' | 'phone_call' | 'sms' | 'meeting' | 'website_chat'
    direction: 'inbound' | 'outbound'
    subject?: string
    content?: string
    
    // WhatsApp Specific
    whatsapp_conversation_text?: string
    
    // Email Specific
    email_from?: string
    email_to?: string
    email_cc?: string
    
    // Phone Specific
    phone_duration_minutes?: number
    phone_number?: string
    
    // Metadata
    handled_by?: string
    status: 'pending' | 'completed' | 'follow_up_needed'
    priority?: 'low' | 'normal' | 'high' | 'urgent'
    
    // Related Records
    related_itinerary_id?: string
    
    // Attachments
    attachments?: {
      name: string
      url: string
      type: string
      size_kb: number
    }[]
    
    // System Fields
    communication_date: string
    created_at: string
    
    // Notes
    internal_notes?: string
  }
  
  export interface ClientNote {
    id: string
    client_id: string
    
    // Note Details
    note_type: 'general' | 'preference' | 'complaint' | 'compliment' | 'warning'
    title?: string
    content: string
    
    // Categorization
    category?: string
    is_important: boolean
    is_pinned: boolean
    
    // System Fields
    created_by?: string
    created_at: string
    updated_at: string
  }
  
  export interface ClientFollowup {
    id: string
    client_id: string
    
    // Follow-up Details
    followup_type: 'call' | 'email' | 'whatsapp' | 'meeting' | 'quote' | 'payment_reminder'
    title: string
    description?: string
    
    // Scheduling
    due_date: string
    due_time?: string
    
    // Assignment
    assigned_to?: string
    priority: 'low' | 'normal' | 'high' | 'urgent'
    
    // Status
    status: 'pending' | 'completed' | 'cancelled' | 'overdue'
    completed_at?: string
    completed_by?: string
    
    // Related Records
    related_itinerary_id?: string
    related_communication_id?: string
    
    // Reminders
    send_reminder: boolean
    reminder_sent: boolean
    
    // System Fields
    created_at: string
    updated_at: string
    
    // Completion Notes
    completion_notes?: string
  }
  
  export interface ClientDocument {
    id: string
    client_id: string
    
    // Document Details
    document_type: 'passport' | 'visa' | 'insurance' | 'flight_ticket' | 'contract' | 'invoice' | 'quote'
    document_name: string
    file_url: string
    file_size_kb?: number
    file_type?: string
    
    // Metadata
    description?: string
    document_number?: string
    issue_date?: string
    expiry_date?: string
    
    // Related Records
    related_itinerary_id?: string
    
    // Access Control
    is_confidential: boolean
    uploaded_by?: string
    
    // System Fields
    created_at: string
    updated_at: string
  }
  
  export interface ClientPreferences {
    id: string
    client_id: string
    
    // Travel Preferences
    preferred_travel_style?: string[]
    preferred_destinations?: string[]
    preferred_activities?: string[]
    
    // Accommodation Preferences
    preferred_hotel_chains?: string[]
    room_preferences?: string[]
    
    // Food & Dining
    cuisine_preferences?: string[]
    dietary_restrictions?: string[]
    favorite_restaurants?: string[]
    
    // Transportation
    preferred_transportation_types?: string[]
    seat_preferences?: string
    
    // Services
    preferred_guide_languages?: string[]
    preferred_guide_specializations?: string[]
    
    // Budget & Spending
    typical_budget_range?: string
    price_sensitivity?: 'budget_conscious' | 'value_seeker' | 'luxury_preferred' | 'price_irrelevant'
    
    // Special Needs
    mobility_requirements?: string
    health_considerations?: string
    age_related_needs?: string
    
    // Dislikes & Avoid
    destinations_to_avoid?: string[]
    activities_to_avoid?: string[]
    
    // Booking Behavior
    typical_advance_booking_days?: number
    preferred_booking_channels?: string[]
    decision_making_style?: 'impulsive' | 'researcher' | 'comparison_shopper' | 'quick_decision'
    
    // System Fields
    created_at: string
    updated_at: string
  }
  
  // ============================================
  // VIEW TYPES
  // ============================================
  
  export interface ClientSummary {
    id: string
    client_code: string
    first_name: string
    last_name: string
    email: string
    phone?: string
    nationality?: string
    client_type: string
    vip_status: boolean
    status: string
    total_bookings_count: number
    total_revenue_generated: number
    average_booking_value: number
    last_contacted_at?: string
    created_at: string
    confirmed_bookings: number
    pending_followups: number
    total_communications: number
    last_booking_date?: string
  }
  
  export interface HighValueClient extends Client {
    revenue_rank: number
  }
  
  export interface OverdueFollowup extends ClientFollowup {
    client_name: string
    client_email: string
    client_phone?: string
  }
  
  // ============================================
  // FORM TYPES
  // ============================================
  
  export interface ClientFormData {
    first_name: string
    last_name: string
    email: string
    phone?: string
    nationality?: string
    passport_type?: 'euro_passport' | 'other_passport'
    preferred_language?: string
    preferred_contact_method?: 'email' | 'whatsapp' | 'phone' | 'sms'
    client_type: 'individual' | 'family' | 'group' | 'corporate' | 'agent'
    client_source?: string
    marketing_consent: boolean
  }
  
  export interface CommunicationFormData {
    client_id: string
    communication_type: 'email' | 'whatsapp' | 'phone_call' | 'sms' | 'meeting' | 'website_chat'
    direction: 'inbound' | 'outbound'
    subject?: string
    content?: string
    handled_by?: string
    priority?: 'low' | 'normal' | 'high' | 'urgent'
  }
  
  export interface NoteFormData {
    client_id: string
    note_type: 'general' | 'preference' | 'complaint' | 'compliment' | 'warning'
    title?: string
    content: string
    category?: string
    is_important: boolean
  }
  
  export interface FollowupFormData {
    client_id: string
    followup_type: 'call' | 'email' | 'whatsapp' | 'meeting' | 'quote' | 'payment_reminder'
    title: string
    description?: string
    due_date: string
    due_time?: string
    assigned_to?: string
    priority: 'low' | 'normal' | 'high' | 'urgent'
  }
  
  // ============================================
  // FILTER & SEARCH TYPES
  // ============================================
  
  export interface ClientFilters {
    status?: 'active' | 'inactive' | 'blacklisted' | 'prospect'
    client_type?: 'individual' | 'family' | 'group' | 'corporate' | 'agent'
    vip_status?: boolean
    nationality?: string
    client_source?: string
    tags?: string[]
    min_revenue?: number
    max_revenue?: number
    min_bookings?: number
    max_bookings?: number
    created_after?: string
    created_before?: string
    last_contacted_after?: string
    last_contacted_before?: string
  }
  
  export interface ClientSearchParams {
    query?: string // Search in name, email, phone
    filters?: ClientFilters
    sort_by?: 'created_at' | 'last_contacted_at' | 'total_revenue_generated' | 'total_bookings_count'
    sort_order?: 'asc' | 'desc'
    page?: number
    limit?: number
  }
  
  // ============================================
  // ANALYTICS TYPES
  // ============================================
  
  export interface ClientAnalytics {
    total_clients: number
    active_clients: number
    vip_clients: number
    new_clients_this_month: number
    total_revenue: number
    average_lifetime_value: number
    clients_by_nationality: { nationality: string; count: number }[]
    clients_by_source: { source: string; count: number }[]
    top_clients_by_revenue: ClientSummary[]
    repeat_customer_rate: number
  }
  
  export interface CommunicationStats {
    total_communications: number
    by_type: { type: string; count: number }[]
    by_month: { month: string; count: number }[]
    average_response_time_hours?: number
  }
  
  export interface FollowupStats {
    total_pending: number
    overdue: number
    completed_this_week: number
    by_priority: { priority: string; count: number }[]
    by_assigned_to: { assigned_to: string; count: number }[]
  }
  
  // ============================================
  // API RESPONSE TYPES
  // ============================================
  
  export interface ClientApiResponse {
    success: boolean
    data?: Client
    error?: string
    message?: string
  }
  
  export interface ClientsListApiResponse {
    success: boolean
    data?: Client[]
    total?: number
    page?: number
    limit?: number
    error?: string
  }
  
  export interface CommunicationApiResponse {
    success: boolean
    data?: CommunicationHistory
    error?: string
  }
  
  export interface FollowupApiResponse {
    success: boolean
    data?: ClientFollowup
    error?: string
  }
  
  // ============================================
  // UTILITY TYPES
  // ============================================
  
  export type ClientStatus = 'active' | 'inactive' | 'blacklisted' | 'prospect'
  export type ClientType = 'individual' | 'family' | 'group' | 'corporate' | 'agent'
  export type PassportType = 'euro_passport' | 'other_passport'
  export type ContactMethod = 'email' | 'whatsapp' | 'phone' | 'sms'
  export type CommunicationType = 'email' | 'whatsapp' | 'phone_call' | 'sms' | 'meeting' | 'website_chat'
  export type Priority = 'low' | 'normal' | 'high' | 'urgent'
  export type FollowupType = 'call' | 'email' | 'whatsapp' | 'meeting' | 'quote' | 'payment_reminder'
  export type FollowupStatus = 'pending' | 'completed' | 'cancelled' | 'overdue'
  export type NoteType = 'general' | 'preference' | 'complaint' | 'compliment' | 'warning'