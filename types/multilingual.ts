// ============================================
// MULTILINGUAL CONTENT SYSTEM - TYPE DEFINITIONS
// ============================================

export type Language = 'en' | 'ja'

export const SUPPORTED_LANGUAGES: Language[] = ['en', 'ja']

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  ja: '日本語'
}

export const LANGUAGE_FLAGS: Record<Language, string> = {
  en: '🇬🇧',
  ja: '🇯🇵'
}

// ============================================
// BASE INTERFACES
// ============================================

export interface MultilingualEntity {
  id: string
  available_languages: Language[]
  version_count?: number
}

export interface VersionMetadata {
  id: string
  language: Language
  created_by?: string
  created_at: string
  updated_at: string
}

// ============================================
// ITINERARY TYPES
// ============================================

export interface ItineraryVersion extends VersionMetadata {
  itinerary_id: string
  trip_name: string
  notes: string | null
  pickup_location: string | null
  guide_notes: string | null
  vehicle_notes: string | null
  inclusions?: string[]
  exclusions?: string[]
}

export interface ItineraryDayVersion extends VersionMetadata {
  itinerary_day_id: string
  title: string | null
  description: string | null
  city: string | null
  overnight_city: string | null
}

export interface ItineraryWithVersions extends MultilingualEntity {
  // Non-translatable fields (stay at top level)
  itinerary_code: string
  client_id: string | null
  client_name: string
  client_email: string | null
  client_phone: string | null
  start_date: string
  end_date: string
  total_days: number
  num_adults: number
  num_children: number
  total_cost: number
  currency: string
  status: string
  tier: string | null
  cost_mode: 'auto' | 'manual'
  assigned_guide_id: string | null
  assigned_vehicle_id: string | null
  pickup_time: string | null
  created_at: string
  updated_at: string

  // Language-specific content
  versions: Partial<Record<Language, ItineraryVersion>>
}

export interface ItineraryDayWithVersions {
  id: string
  itinerary_id: string
  day_number: number
  date: string

  // Language-specific content
  versions: Partial<Record<Language, ItineraryDayVersion>>
}

// ============================================
// TOUR TEMPLATE TYPES
// ============================================

export interface TourTemplateVersion extends VersionMetadata {
  template_id: string
  template_name: string
  short_description: string | null
  long_description: string | null
  highlights: string[]
  main_attractions: string[]
  best_for: string[]
  inclusions: string[]
  exclusions: string[]
  itinerary: TourItineraryDay[] | null
}

export interface TourItineraryDay {
  day: number
  title: string
  description: string
  meals: string[]
}

export interface TourTemplateWithVersions extends MultilingualEntity {
  // Non-translatable fields
  template_code: string
  category_id: string | null
  tour_type: string
  duration_days: number
  duration_nights: number | null
  cities_covered: string[]
  physical_level: string | null
  image_url: string | null
  is_featured: boolean
  is_active: boolean
  uses_day_builder: boolean
  pricing_mode: string | null
  created_at: string
  updated_at: string

  // Language-specific content
  versions: Partial<Record<Language, TourTemplateVersion>>
}

// ============================================
// TOUR VARIATION TYPES
// ============================================

export interface TourVariationVersion extends VersionMetadata {
  variation_id: string
  variation_name: string
  inclusions: string[]
  exclusions: string[]
  optional_extras: string[]
}

export interface TourVariationWithVersions extends MultilingualEntity {
  // Non-translatable fields
  template_id: string
  variation_code: string
  tier: 'budget' | 'standard' | 'deluxe' | 'luxury'
  group_type: 'private' | 'shared'
  min_pax: number
  max_pax: number
  optimal_pax: number | null
  guide_type: string | null
  guide_languages: string[]
  vehicle_type: string | null
  accommodation_standard: string | null
  meal_quality: string | null
  is_active: boolean
  created_at: string
  updated_at: string

  // Language-specific content
  versions: Partial<Record<Language, TourVariationVersion>>
}

// ============================================
// QUOTE TYPES
// ============================================

export interface QuoteVersion extends VersionMetadata {
  quote_id: string
  title: string | null
  notes: string | null
  terms_conditions: string | null
  special_requests: string | null
}

export interface QuoteWithVersions extends MultilingualEntity {
  // Non-translatable fields
  quote_number: string
  partner_id: string | null
  variation_id: string | null
  travel_date: string | null
  num_adults: number
  num_children: number
  tour_leader_included: boolean
  cost_price: number
  selling_price: number
  price_per_person: number
  currency: string
  status: string
  valid_until: string | null
  created_at: string
  updated_at: string

  // Language-specific content
  versions: Partial<Record<Language, QuoteVersion>>
}

// ============================================
// API RESPONSE TYPES
// ============================================

export interface VersionCreateRequest<T> {
  language: Language
  content: Omit<T, 'id' | 'language' | 'created_at' | 'updated_at' | 'created_by'>
}

export interface VersionUpdateRequest<T> {
  content: Partial<Omit<T, 'id' | 'language' | 'created_at' | 'updated_at' | 'created_by'>>
}

export interface MultilingualListResponse<T extends MultilingualEntity> {
  success: boolean
  data: T[]
  pagination?: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export interface MultilingualDetailResponse<T extends MultilingualEntity> {
  success: boolean
  data: T
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get the content for a specific language, falling back to English if not available
 */
export function getVersionContent<T extends VersionMetadata>(
  versions: Partial<Record<Language, T>> | undefined,
  preferredLanguage: Language
): T | null {
  if (!versions) return null
  return versions[preferredLanguage] || versions['en'] || null
}

/**
 * Check if a specific language version exists
 */
export function hasLanguageVersion<T extends VersionMetadata>(
  versions: Partial<Record<Language, T>> | undefined,
  language: Language
): boolean {
  return versions ? !!versions[language] : false
}

/**
 * Get list of available languages for an entity
 */
export function getAvailableLanguages<T extends VersionMetadata>(
  versions: Partial<Record<Language, T>> | undefined
): Language[] {
  if (!versions) return []
  return Object.keys(versions).filter(lang => versions[lang as Language]) as Language[]
}
