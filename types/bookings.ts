// =====================================================
// BOOKINGS MODULE - TYPE DEFINITIONS
// =====================================================

export type BookingStatus =
  | 'pending'
  | 'supplier_confirmed'
  | 'payment_received'
  | 'ready'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export type PaymentStatus =
  | 'pending'
  | 'deposit_received'
  | 'partial'
  | 'paid'
  | 'refunded'

export type SupplierConfirmationStatus =
  | 'pending'
  | 'requested'
  | 'confirmed'
  | 'waitlist'
  | 'rejected'
  | 'cancelled'

export type PaymentType =
  | 'deposit'
  | 'partial'
  | 'final'
  | 'refund'
  | 'adjustment'

export type SupplierType =
  | 'hotel'
  | 'guide'
  | 'transport'
  | 'restaurant'
  | 'activity'
  | 'entrance'
  | 'cruise'
  | 'flight'
  | 'other'

// =====================================================
// MAIN BOOKING INTERFACE
// =====================================================

export interface Booking {
  id: string
  booking_code: string
  itinerary_id: string

  // Client
  client_name: string
  client_email: string | null
  client_phone: string | null

  // Trip Details
  trip_name: string
  start_date: string
  end_date: string
  num_adults: number
  num_children: number
  total_cost: number
  currency: string
  tier: string | null

  // Status
  status: BookingStatus

  // Payment
  deposit_amount: number
  deposit_paid: boolean
  deposit_paid_date: string | null
  balance_due: number
  payment_deadline: string | null
  payment_status: PaymentStatus

  // Resources
  assigned_guide_id: string | null
  assigned_vehicle_id: string | null

  // Operational
  emergency_contact: string | null
  emergency_phone: string | null
  special_requests: string | null
  operational_notes: string | null

  // Timestamps
  created_at: string
  updated_at: string
  cancelled_at: string | null
  cancellation_reason: string | null
}

// =====================================================
// BOOKING WITH RELATIONS
// =====================================================

export interface BookingWithDetails extends Booking {
  suppliers?: BookingSupplierStatus[]
  payments?: BookingPayment[]
  itinerary?: {
    id: string
    itinerary_code: string
    status: string
  }
  assigned_guide?: {
    id: string
    name: string
    phone: string | null
  } | null
  assigned_vehicle?: {
    id: string
    vehicle_type: string
    plate_number: string | null
  } | null
}

// =====================================================
// SUPPLIER STATUS
// =====================================================

export interface BookingSupplierStatus {
  id: string
  booking_id: string

  // Supplier Info
  supplier_id: string | null
  supplier_type: SupplierType
  supplier_name: string

  // Service
  service_description: string | null
  service_date: string | null

  // Status
  status: SupplierConfirmationStatus
  confirmation_number: string | null
  confirmed_at: string | null
  confirmation_notes: string | null

  // Contact
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null

  // Cost
  quoted_cost: number | null
  confirmed_cost: number | null

  // Timestamps
  created_at: string
  updated_at: string
}

// =====================================================
// PAYMENT
// =====================================================

export interface BookingPayment {
  id: string
  booking_id: string
  payment_type: PaymentType
  amount: number
  currency: string
  payment_method: string | null
  payment_date: string
  transaction_reference: string | null
  notes: string | null
  created_at: string
}

// =====================================================
// API REQUEST/RESPONSE TYPES
// =====================================================

export interface CreateBookingRequest {
  itinerary_id: string
}

export interface UpdateBookingRequest {
  status?: BookingStatus
  payment_status?: PaymentStatus
  deposit_amount?: number
  deposit_paid?: boolean
  deposit_paid_date?: string
  balance_due?: number
  payment_deadline?: string
  assigned_guide_id?: string | null
  assigned_vehicle_id?: string | null
  emergency_contact?: string
  emergency_phone?: string
  special_requests?: string
  operational_notes?: string
}

export interface CreateSupplierStatusRequest {
  supplier_id?: string
  supplier_type: SupplierType
  supplier_name: string
  service_description?: string
  service_date?: string
  contact_name?: string
  contact_email?: string
  contact_phone?: string
  quoted_cost?: number
}

export interface UpdateSupplierStatusRequest {
  status?: SupplierConfirmationStatus
  confirmation_number?: string
  confirmation_notes?: string
  confirmed_cost?: number
}

export interface CreatePaymentRequest {
  payment_type: PaymentType
  amount: number
  payment_method?: string
  payment_date: string
  transaction_reference?: string
  notes?: string
}

// =====================================================
// LIST RESPONSE
// =====================================================

export interface BookingsListResponse {
  success: boolean
  data: Booking[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
  summary: {
    total: number
    pending: number
    supplier_confirmed: number
    payment_received: number
    ready: number
    in_progress: number
    completed: number
    cancelled: number
  }
}

// =====================================================
// HELPER TYPES
// =====================================================

export interface BookingFilters {
  status?: BookingStatus
  startDateFrom?: string
  startDateTo?: string
  search?: string
  assignedGuideId?: string
}

export const BOOKING_STATUS_CONFIG: Record<BookingStatus, { label: string; color: string; bgColor: string }> = {
  pending: { label: 'Pending', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  supplier_confirmed: { label: 'Suppliers Confirmed', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  payment_received: { label: 'Payment Received', color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
  ready: { label: 'Ready', color: 'text-green-600', bgColor: 'bg-green-100' },
  in_progress: { label: 'In Progress', color: 'text-purple-600', bgColor: 'bg-purple-100' },
  completed: { label: 'Completed', color: 'text-gray-600', bgColor: 'bg-gray-200' },
  cancelled: { label: 'Cancelled', color: 'text-red-600', bgColor: 'bg-red-100' },
}

export const SUPPLIER_STATUS_CONFIG: Record<SupplierConfirmationStatus, { label: string; color: string; bgColor: string }> = {
  pending: { label: 'Pending', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  requested: { label: 'Requested', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  confirmed: { label: 'Confirmed', color: 'text-green-600', bgColor: 'bg-green-100' },
  waitlist: { label: 'Waitlist', color: 'text-amber-600', bgColor: 'bg-amber-100' },
  rejected: { label: 'Rejected', color: 'text-red-600', bgColor: 'bg-red-100' },
  cancelled: { label: 'Cancelled', color: 'text-gray-600', bgColor: 'bg-gray-200' },
}

export const PAYMENT_STATUS_CONFIG: Record<PaymentStatus, { label: string; color: string; bgColor: string }> = {
  pending: { label: 'Pending', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  deposit_received: { label: 'Deposit Received', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  partial: { label: 'Partial Payment', color: 'text-amber-600', bgColor: 'bg-amber-100' },
  paid: { label: 'Fully Paid', color: 'text-green-600', bgColor: 'bg-green-100' },
  refunded: { label: 'Refunded', color: 'text-red-600', bgColor: 'bg-red-100' },
}
