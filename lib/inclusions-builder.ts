// ============================================
// INCLUSIONS & EXCLUSIONS BUILDER
// Generates itinerary-specific inclusions/exclusions
// based on package type, tier, services, and content
// ============================================

import { type PackageType, PACKAGE_TYPE_CONFIGS } from '@/lib/package-types'

// ============================================
// TYPES
// ============================================

export interface InclusionsBuilderInput {
  packageType: PackageType
  tier: 'budget' | 'standard' | 'deluxe' | 'luxury'
  includeLunch: boolean
  includeDinner: boolean
  includeAccommodation: boolean
  isCruise: boolean
  cruiseNights?: number
  language: string
  hotelName?: string | null
  hasAirportTransfer: boolean
  attractions: string[]
  citiesVisited: string[]
  totalDays: number
  numAdults: number
  numChildren: number
  // Enhanced fields (all optional for backward compatibility)
  vehicleType?: string
  hotelsPerCity?: Array<{ city: string; hotelName: string; nights: number }>
  domesticFlights?: Array<{ from: string; to: string }>
  intercityTransfers?: Array<{ from: string; to: string }>
}

export interface InclusionsBuilderOutput {
  inclusions: string[]
  exclusions: string[]
}

// ============================================
// ITINERARY DETAILS EXTRACTION
// ============================================

export interface ItineraryDetails {
  /** Per-city hotel night counts */
  nightsPerCity: Map<string, number>
  /** Domestic flights: array of {from, to} */
  domesticFlights: Array<{ from: string; to: string }>
  /** Intercity road transfers: array of {from, to} */
  intercityTransfers: Array<{ from: string; to: string }>
  /** Ordered list of unique cities visited */
  orderedCities: string[]
}

/**
 * Extracts structured itinerary details from AI-generated day data.
 * Pure function — no DB calls. Handles both land AI output (overnight_city)
 * and cruise content library (overnight) field names.
 */
export function extractItineraryDetails(days: any[]): ItineraryDetails {
  const nightsPerCity = new Map<string, number>()
  const domesticFlights: Array<{ from: string; to: string }> = []
  const intercityTransfers: Array<{ from: string; to: string }> = []
  const orderedCities: string[] = []

  for (let i = 0; i < days.length; i++) {
    const day = days[i]
    const isLastDay = i === days.length - 1

    // Track ordered cities
    const dayCity = day.city
    if (dayCity && !orderedCities.includes(dayCity)) {
      orderedCities.push(dayCity)
    }

    // Get overnight city — handles both field names
    const overnightCity = day.overnight_city || day.overnight || null
    const isCruiseDay = day.is_cruise_day || day.accommodation_type === 'cruise'

    // Count hotel nights per overnight city (skip cruise days and last day)
    if (!isCruiseDay && overnightCity && !isLastDay) {
      const current = nightsPerCity.get(overnightCity) || 0
      nightsPerCity.set(overnightCity, current + 1)
    }

    // Detect domestic flights (mirrors service-creation.ts line 290-291)
    const isDomesticFlight = !day.is_arrival && !day.is_departure
      && !!day.flight_info && day.transport_type === 'flight'
    if (isDomesticFlight) {
      const prevDay = i > 0 ? days[i - 1] : null
      const fromCity = prevDay?.overnight_city || prevDay?.overnight || prevDay?.city || 'Unknown'
      const toCity = dayCity || 'Unknown'
      domesticFlights.push({ from: fromCity, to: toCity })
    }

    // Detect intercity road transfers: overnight city changed from previous day
    // (not flight, not cruise). Compare previous overnight to CURRENT overnight
    // to avoid flagging day trips (where city changes but overnight stays the same).
    if (i > 0 && !isDomesticFlight && !isCruiseDay) {
      const prevDay = days[i - 1]
      const prevOvernight = prevDay?.overnight_city || prevDay?.overnight || prevDay?.city
      const currentOvernight = overnightCity || dayCity
      const prevIsCruise = prevDay?.is_cruise_day || prevDay?.accommodation_type === 'cruise'
      if (
        prevOvernight && currentOvernight
        && prevOvernight.toLowerCase() !== currentOvernight.toLowerCase()
        && !prevIsCruise
        && !day.is_arrival
      ) {
        intercityTransfers.push({ from: prevOvernight, to: currentOvernight })
      }
    }
  }

  return { nightsPerCity, domesticFlights, intercityTransfers, orderedCities }
}

// ============================================
// HELPERS
// ============================================

/**
 * Format a list of cities with Oxford comma.
 * 1 city: "Cairo"
 * 2 cities: "Cairo and Luxor"
 * 3+ cities: "Cairo, Luxor, and Aswan"
 */
export function formatCityList(cities: string[]): string {
  if (cities.length === 0) return ''
  if (cities.length === 1) return cities[0]
  if (cities.length === 2) return `${cities[0]} and ${cities[1]}`
  return `${cities.slice(0, -1).join(', ')}, and ${cities[cities.length - 1]}`
}

// ============================================
// MAIN BUILDER FUNCTION
// ============================================

export function buildInclusionsExclusions(input: InclusionsBuilderInput): InclusionsBuilderOutput {
  const {
    packageType,
    tier,
    includeLunch,
    includeDinner,
    includeAccommodation,
    isCruise,
    cruiseNights,
    language,
    hotelName,
    hasAirportTransfer,
    attractions,
    citiesVisited,
    totalDays,
    vehicleType,
    hotelsPerCity,
    domesticFlights,
    intercityTransfers,
  } = input

  const inclusions: string[] = []
  const exclusions: string[] = []

  // Look up package config for reference
  const pkgConfig = PACKAGE_TYPE_CONFIGS.find(p => p.slug === packageType)

  // ============================================
  // BUILD INCLUSIONS
  // ============================================

  // 1. Tour summary (uses totalDays + citiesVisited)
  if (totalDays > 0 && citiesVisited.length > 0) {
    const cityList = formatCityList(citiesVisited)
    inclusions.push(`${totalDays}-day private guided tour covering ${cityList}`)
  }

  // 2. Transportation (uses vehicleType if available)
  const vehicleLabel = vehicleType || 'vehicle'
  inclusions.push(`Private air-conditioned ${vehicleLabel} for all transfers and sightseeing`)

  // 3. Airport transfers (only for packages that include them)
  if (hasAirportTransfer) {
    inclusions.push('Airport meet, assist, and transfers')
  }

  // 4. Guide
  const guideLang = language || 'English'
  inclusions.push(`Licensed ${guideLang}-speaking Egyptologist guide for all sightseeing days`)

  // 5. Accommodation (uses hotelsPerCity if available)
  if (includeAccommodation) {
    if (isCruise) {
      const nightsText = cruiseNights ? `${cruiseNights} nights` : 'as per itinerary'
      inclusions.push(`Nile Cruise accommodation (${nightsText}, full board)`)
    }

    // Per-city hotel details (enhanced)
    if (hotelsPerCity && hotelsPerCity.length > 0) {
      const hotelParts = hotelsPerCity.map(h => {
        const nightLabel = h.nights === 1 ? 'night' : 'nights'
        return `${h.hotelName}, ${h.city} (${h.nights} ${nightLabel}, BB)`
      })
      if (hotelParts.length === 1) {
        inclusions.push(`Accommodation at ${hotelParts[0]}`)
      } else {
        inclusions.push(`Accommodation at ${hotelParts.join(' and ')}`)
      }
    } else if (!isCruise) {
      // Fallback: single hotel or generic
      if (hotelName) {
        inclusions.push(`Hotel accommodation at ${hotelName} (bed & breakfast)`)
      } else {
        inclusions.push('Hotel accommodation as per itinerary (bed & breakfast)')
      }
    } else if (isCruise && packageType === 'cruise-land') {
      // cruise-land without per-city data: fallback
      if (hotelName) {
        inclusions.push(`Hotel accommodation at ${hotelName} (bed & breakfast)`)
      } else {
        inclusions.push('Hotel accommodation as per itinerary (bed & breakfast)')
      }
    }
  }

  // 6. Domestic flights (new)
  if (domesticFlights && domesticFlights.length > 0) {
    for (const flight of domesticFlights) {
      inclusions.push(`Domestic flight ${flight.from} \u2192 ${flight.to}`)
    }
  }

  // 7. Intercity transfers (new)
  if (intercityTransfers && intercityTransfers.length > 0) {
    for (const transfer of intercityTransfers) {
      inclusions.push(`Private intercity transfer ${transfer.from} \u2192 ${transfer.to}`)
    }
  }

  // 8. Entrance fees with actual site names
  if (attractions.length > 0) {
    const uniqueAttractions = [...new Set(attractions)]
    if (uniqueAttractions.length <= 6) {
      inclusions.push(`Entrance fees to all listed sites: ${uniqueAttractions.join(', ')}`)
    } else {
      // For long lists, show first few and indicate "and more"
      const displayed = uniqueAttractions.slice(0, 5).join(', ')
      const remaining = uniqueAttractions.length - 5
      inclusions.push(`Entrance fees to all ${uniqueAttractions.length} listed sites: ${displayed}, and ${remaining} more`)
    }
  } else {
    inclusions.push('Entrance fees to all sites mentioned in the itinerary')
  }

  // 9. Meals
  if (isCruise) {
    inclusions.push('All meals on board the Nile Cruise (breakfast, lunch, dinner)')
    // For cruise-land, land meals are separate
    if (packageType === 'cruise-land') {
      if (includeLunch) {
        inclusions.push('Daily lunch at selected restaurants (land tour days)')
      }
      if (includeDinner) {
        inclusions.push('Daily dinner at selected restaurants (land tour days)')
      }
    }
  } else {
    if (includeLunch) {
      inclusions.push('Daily lunch at selected restaurants')
    }
    if (includeDinner) {
      inclusions.push('Daily dinner at selected restaurants')
    }
  }

  // 10. Bottled water
  inclusions.push('Bottled water during tours')

  // 11. Tips for service staff
  inclusions.push('Tips for drivers, porters, and hotel concierge')

  // 12. Taxes
  inclusions.push('All applicable taxes and service charges')

  // 13. Tier-specific premium extras
  if (tier === 'luxury') {
    inclusions.push('Priority skip-the-line access at major sites')
    inclusions.push('Premium dining experiences')
    inclusions.push('Cold towels and refreshments during tours')
  } else if (tier === 'deluxe') {
    inclusions.push('Upgraded restaurant selections')
  }

  // ============================================
  // BUILD EXCLUSIONS
  // ============================================

  // Always excluded
  exclusions.push('International flights')

  // Conditionally excluded (only when NOT included)
  if (!includeAccommodation) {
    exclusions.push('Accommodation (client arranges own hotels)')
  }

  if (!hasAirportTransfer) {
    exclusions.push('Airport transfers')
  }

  if (!includeLunch && !isCruise) {
    exclusions.push('Lunches')
  }

  if (!includeDinner && !isCruise) {
    exclusions.push('Dinners')
  }

  // Always excluded
  exclusions.push('Travel insurance')
  exclusions.push('Gratuities for your guide (appreciated but not obligatory)')
  exclusions.push('Personal expenses and shopping')
  exclusions.push('Visa fees (if applicable)')
  exclusions.push('Optional activities not mentioned in the itinerary')

  return { inclusions, exclusions }
}
