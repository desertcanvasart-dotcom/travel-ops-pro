// ============================================
// AUTOURA - Resource Management Types
// ============================================
// TypeScript interfaces for Guides and Vehicles
// Version: 1.0
// Date: 2025-11-17
// ============================================

// ============================================
// GUIDE TYPES
// ============================================

export interface Guide {
    id: string
    
    // Basic Information
    name: string
    email: string | null
    phone: string | null
    
    // Professional Details
    languages: string[] // ['English', 'Spanish', 'Arabic']
    specialties: string[] // ['Ancient Egypt', 'Desert Tours']
    certification_number: string | null
    license_expiry: string | null // ISO date string
    
    // Availability
    is_active: boolean
    max_group_size: number | null
    hourly_rate: number | null
    daily_rate: number | null
    
    // Contact & Emergency
    emergency_contact_name: string | null
    emergency_contact_phone: string | null
    address: string | null
    
    // Notes & Documentation
    notes: string | null
    profile_photo_url: string | null
    
    // Metadata
    created_at: string // ISO date string
    updated_at: string // ISO date string
  }
  
  export interface GuideFormData {
    name: string
    email?: string
    phone?: string
    languages: string[]
    specialties: string[]
    certification_number?: string
    license_expiry?: string
    is_active: boolean
    max_group_size?: number
    hourly_rate?: number
    daily_rate?: number
    emergency_contact_name?: string
    emergency_contact_phone?: string
    address?: string
    notes?: string
    profile_photo_url?: string
  }
  
  export interface GuideWithBookings extends Guide {
    active_bookings: number
    upcoming_bookings: number
    total_revenue: number
    utilization_rate: number // percentage
  }
  
  // ============================================
  // VEHICLE / TRANSPORT SUPPLIER TYPES
  // ============================================
  // Vehicles are external transport suppliers (companies/drivers),
  // not internally owned fleet. Managed via the Suppliers page.

  export type TransportSupplierType = 'transport' | 'local_operator' | 'driver'

  // Kept for backward compatibility with code that references VehicleType
  export type VehicleType = 'car' | 'van' | 'minibus' | 'bus' | 'suv'

  export interface Vehicle {
    id: string

    // Basic Information
    name: string
    type: TransportSupplierType
    city: string | null

    // Contact
    phone: string | null
    whatsapp: string | null
    email: string | null

    // Capabilities
    vehicle_types: string[] // ['Sedan', 'Minivan', 'Van', 'Bus']

    // Status
    is_active: boolean
    notes: string | null

    // Metadata
    created_at: string
    updated_at: string
  }

  export interface VehicleFormData {
    name: string
    type: TransportSupplierType
    city?: string
    phone?: string
    whatsapp?: string
    email?: string
    vehicle_types: string[]
    is_active: boolean
    notes?: string
  }

  export interface VehicleWithBookings extends Vehicle {
    active_bookings: number
    upcoming_bookings: number
    total_revenue: number
  }
  
  // ============================================
  // ITINERARY EXTENSIONS
  // ============================================
  
  export interface ItineraryWithResources {
    id: string
    itinerary_code: string
    client_name: string
    start_date: string
    end_date: string
    num_travelers: number
    payment_status: string
    total_cost: number
    destinations: string
    
    // Resource Assignments
    assigned_guide_id: string | null
    assigned_vehicle_id: string | null
    guide_notes: string | null
    vehicle_notes: string | null
    pickup_location: string | null
    pickup_time: string | null // HH:MM format
    
    // Populated relationships
    guide?: Guide
    vehicle?: Vehicle
  }
  
  export interface ResourceAssignment {
    guide_id?: string | null
    vehicle_id?: string | null
    guide_notes?: string
    vehicle_notes?: string
    pickup_location?: string
    pickup_time?: string
  }
  
  // ============================================
  // AVAILABILITY & CONFLICT TYPES
  // ============================================
  
  export interface DateRange {
    start: string // ISO date
    end: string // ISO date
  }
  
  export interface ResourceAvailability {
    resource_id: string
    resource_name: string
    resource_type: 'guide' | 'vehicle'
    is_available: boolean
    conflicting_bookings: string[] // array of itinerary IDs
  }
  
  export interface ResourceConflict {
    resource_id: string
    resource_name: string
    resource_type: 'guide' | 'vehicle'
    booking_1: {
      id: string
      code: string
      client: string
      dates: DateRange
    }
    booking_2: {
      id: string
      code: string
      client: string
      dates: DateRange
    }
  }
  
  // ============================================
  // FILTER & SEARCH TYPES
  // ============================================
  
  export interface GuideFilters {
    search?: string
    languages?: string[]
    specialties?: string[]
    is_active?: boolean
    availability_from?: string
    availability_to?: string
  }
  
  export interface VehicleFilters {
    search?: string
    type?: TransportSupplierType[]
    city?: string
    vehicle_types?: string[] // filter by available vehicle types
    is_active?: boolean
    availability_from?: string
    availability_to?: string
  }
  
  // ============================================
  // API RESPONSE TYPES
  // ============================================
  
  export interface ApiResponse<T> {
    success: boolean
    data?: T
    error?: string
    message?: string
  }
  
  export interface GuidesResponse {
    guides: Guide[]
    total: number
    page: number
    per_page: number
  }
  
  export interface VehiclesResponse {
    vehicles: Vehicle[]
    total: number
    page: number
    per_page: number
  }
  
  // ============================================
  // STATISTICS TYPES
  // ============================================
  
  export interface GuideStats {
    total_guides: number
    active_guides: number
    inactive_guides: number
    guides_with_bookings: number
    average_daily_rate: number
    most_booked_guide: {
      id: string
      name: string
      booking_count: number
    } | null
  }
  
  export interface VehicleStats {
    total_vehicles: number
    active_vehicles: number
    inactive_vehicles: number
    vehicles_with_bookings: number
    most_used_vehicle: {
      id: string
      name: string
      booking_count: number
    } | null
    vehicles_by_supplier_type: {
      [key in TransportSupplierType]?: number
    }
  }
  
  // ============================================
  // FORM VALIDATION TYPES
  // ============================================
  
  export interface ValidationError {
    field: string
    message: string
  }
  
  export interface GuideValidation {
    isValid: boolean
    errors: ValidationError[]
  }
  
  export interface VehicleValidation {
    isValid: boolean
    errors: ValidationError[]
  }
  
  // ============================================
  // UTILITY TYPES
  // ============================================
  
  export type SortDirection = 'asc' | 'desc'
  
  export interface SortConfig {
    field: string
    direction: SortDirection
  }
  
  export interface PaginationConfig {
    page: number
    per_page: number
    total: number
  }
  
  // ============================================
  // CONSTANTS
  // ============================================
  
  // Legacy vehicle types kept for backward compatibility
  export const VEHICLE_TYPES: { value: VehicleType; label: string }[] = [
    { value: 'car', label: 'Car' },
    { value: 'van', label: 'Van' },
    { value: 'minibus', label: 'Minibus' },
    { value: 'bus', label: 'Bus' },
    { value: 'suv', label: 'SUV' },
  ]

  export const TRANSPORT_SUPPLIER_TYPES: { value: TransportSupplierType; label: string }[] = [
    { value: 'transport', label: 'Transport' },
    { value: 'local_operator', label: 'Local Operator' },
    { value: 'driver', label: 'Driver' },
  ]
  
  export const COMMON_LANGUAGES = [
    'English',
    'Arabic',
    'French',
    'German',
    'Spanish',
    'Italian',
    'Russian',
    'Chinese',
    'Japanese',
    'Portuguese',
  ]
  
  export const COMMON_SPECIALTIES = [
    'Ancient Egypt',
    'Cairo Tours',
    'Pyramids',
    'Luxor',
    'Valley of Kings',
    'Temples',
    'Desert Safari',
    'Siwa Oasis',
    'Red Sea',
    'Diving',
    'Beach Tours',
    'Cultural Tours',
    'Adventure Tours',
    'Photography Tours',
  ]
  
  // ============================================
  // TYPE GUARDS
  // ============================================
  
  export function isGuide(resource: Guide | Vehicle): resource is Guide {
    return 'languages' in resource
  }
  
  export function isVehicle(resource: Guide | Vehicle): resource is Vehicle {
    return 'vehicle_types' in resource
  }
  
  export function isValidVehicleType(type: string): type is VehicleType {
    return ['car', 'van', 'minibus', 'bus', 'suv'].includes(type)
  }
  
  // ============================================
  // HELPER FUNCTIONS
  // ============================================
  
  export function formatGuideDisplay(guide: Guide): string {
    const languages = guide.languages.join(', ')
    return `${guide.name} (${languages})`
  }
  
  export function formatVehicleDisplay(vehicle: Vehicle): string {
    const types = vehicle.vehicle_types?.length ? ` (${vehicle.vehicle_types.join(', ')})` : ''
    const city = vehicle.city ? ` - ${vehicle.city}` : ''
    return `${vehicle.name}${city}${types}`
  }

  export function getVehicleTypeLabel(type: VehicleType): string {
    const vehicleType = VEHICLE_TYPES.find(v => v.value === type)
    return vehicleType?.label || type
  }

  export function getTransportSupplierTypeLabel(type: TransportSupplierType): string {
    const supplierType = TRANSPORT_SUPPLIER_TYPES.find(t => t.value === type)
    return supplierType?.label || type
  }