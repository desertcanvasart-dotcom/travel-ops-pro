// ============================================
// PRICING GRID — Type Definitions
// ============================================

// --- Grid Configuration (header controls) ---

export type Tier = 'budget' | 'standard' | 'deluxe' | 'luxury'
export type ClientType = 'b2b' | 'b2c'
export type PassportType = 'eu' | 'non_eu'

export interface GridConfig {
  pax: number
  passport: PassportType
  tier: Tier
  clientType: ClientType
  withGuide: boolean
  currency: string
  marginPercent: number
  exchangeRate: number | null  // EUR → target currency
}

// --- Slot Definitions (fixed structure) ---

export type SlotBucket = 'group' | 'per_person'
export type SelectionMode = 'single' | 'multi' | 'custom' | 'auto'

export interface SlotDefinition {
  slotId: string
  label: string
  bucket: SlotBucket
  selectionMode: SelectionMode
  icon: string
  rateTable: string | null  // null = manual entry
}

// All 16 fixed slots
export const SLOT_DEFINITIONS: SlotDefinition[] = [
  // GROUP SERVICES (charged once, divided by pax)
  { slotId: 'vehicle',          label: 'Vehicle',          bucket: 'group',      selectionMode: 'auto',   icon: '🚗', rateTable: 'transportation_rates' },
  { slotId: 'route',            label: 'Route',            bucket: 'group',      selectionMode: 'single', icon: '🛣️', rateTable: 'transportation_rates' },
  { slotId: 'guide',            label: 'Guide',            bucket: 'group',      selectionMode: 'single', icon: '👨‍🏫', rateTable: 'guide_rates' },
  { slotId: 'airport_services', label: 'Airport Services', bucket: 'group',      selectionMode: 'multi',  icon: '✈️', rateTable: 'airport_staff_rates' },
  { slotId: 'hotel_services',   label: 'Hotel Services',   bucket: 'group',      selectionMode: 'multi',  icon: '🏨', rateTable: 'hotel_staff_rates' },
  { slotId: 'tipping',          label: 'Tipping',          bucket: 'group',      selectionMode: 'multi',  icon: '💰', rateTable: 'tipping_rates' },
  { slotId: 'boat_rides',       label: 'Boat Rides',       bucket: 'group',      selectionMode: 'multi',  icon: '⛵', rateTable: 'activity_rates' },
  { slotId: 'other_group',      label: 'Other (Group)',    bucket: 'group',      selectionMode: 'custom', icon: '📋', rateTable: null },
  // PER-PERSON SERVICES (multiplied by pax)
  { slotId: 'accommodation',    label: 'Accommodation',    bucket: 'per_person', selectionMode: 'single', icon: '🛏️', rateTable: 'accommodation_rates' },
  { slotId: 'entrance_fees',    label: 'Entrance Fees',    bucket: 'per_person', selectionMode: 'multi',  icon: '🎫', rateTable: 'entrance_fees' },
  { slotId: 'flights',          label: 'Flights',          bucket: 'per_person', selectionMode: 'multi',  icon: '🛩️', rateTable: null },
  { slotId: 'experiences',      label: 'Experiences',      bucket: 'per_person', selectionMode: 'multi',  icon: '🎈', rateTable: 'activity_rates' },
  { slotId: 'meals',            label: 'Meals',            bucket: 'per_person', selectionMode: 'multi',  icon: '🍽️', rateTable: 'meal_rates' },
  { slotId: 'water',            label: 'Water',            bucket: 'per_person', selectionMode: 'single', icon: '💧', rateTable: null },
  { slotId: 'cruise',           label: 'Nile Cruise',      bucket: 'per_person', selectionMode: 'single', icon: '🚢', rateTable: 'cruise_rates' },
  { slotId: 'other_pp',         label: 'Other (PP)',       bucket: 'per_person', selectionMode: 'custom', icon: '📋', rateTable: null },
]

export const GROUP_SLOTS = SLOT_DEFINITIONS.filter(s => s.bucket === 'group')
export const PP_SLOTS = SLOT_DEFINITIONS.filter(s => s.bucket === 'per_person')

// --- Runtime Slot Values ---

export interface SelectedItem {
  rateId: string
  name: string
  rateEur: number
  rateNonEur: number
}

export interface SlotValue {
  slotId: string
  selectedItems: SelectedItem[]
  customAmount: number  // For 'custom' slots (Other Group / Other PP)
}

// --- Day State ---

export interface GridDay {
  id: string
  dayNumber: number
  title: string
  city: string
  description: string
  isExpanded: boolean
  slots: SlotValue[]
}

// --- Rate Options (fetched from DB, used in dropdowns) ---

export interface RateOption {
  id: string
  name: string
  rateEur: number
  rateNonEur: number
  city?: string
  category?: string
  details?: string  // e.g., "4★", "Standard cabin", "Aswan → Luxor"
}

export interface AllRates {
  vehicle: RateOption[]
  route: RateOption[]
  guide: RateOption[]
  airport_services: RateOption[]
  hotel_services: RateOption[]
  tipping: RateOption[]
  boat_rides: RateOption[]
  accommodation: RateOption[]
  entrance_fees: RateOption[]
  flights: RateOption[]
  experiences: RateOption[]
  meals: RateOption[]
  water: RateOption[]
  cruise: RateOption[]
}

// --- Calculation Results ---

export interface DayCalc {
  groupTotal: number
  perPersonTotal: number
  groupPerPerson: number
  dailyPerPerson: number
  dailyTotal: number
}

export interface GridTotals {
  costPerPerson: number
  totalCost: number
  marginAmount: number
  sellingPricePerPerson: number
  sellingPriceTotal: number
}
