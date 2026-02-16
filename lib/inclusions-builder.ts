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
}

export interface InclusionsBuilderOutput {
  inclusions: string[]
  exclusions: string[]
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
  } = input

  const inclusions: string[] = []
  const exclusions: string[] = []

  // Look up package config for reference
  const pkgConfig = PACKAGE_TYPE_CONFIGS.find(p => p.slug === packageType)

  // ============================================
  // BUILD INCLUSIONS
  // ============================================

  // 1. Transportation (always included for all package types)
  inclusions.push('Private air-conditioned vehicle for all transfers and sightseeing')

  // 2. Airport transfers (only for packages that include them)
  if (hasAirportTransfer) {
    inclusions.push('Airport meet, assist, and transfers')
  }

  // 3. Guide
  const guideLang = language || 'English'
  inclusions.push(`Licensed ${guideLang}-speaking Egyptologist guide for all sightseeing days`)

  // 4. Accommodation (conditional on package type)
  if (includeAccommodation) {
    if (isCruise) {
      const nightsText = cruiseNights ? `${cruiseNights} nights` : 'as per itinerary'
      inclusions.push(`Nile Cruise accommodation (${nightsText}, full board)`)
      // If cruise-land, there are also hotels
      if (packageType === 'cruise-land' && hotelName) {
        inclusions.push(`Hotel accommodation at ${hotelName} (bed & breakfast)`)
      } else if (packageType === 'cruise-land') {
        inclusions.push('Hotel accommodation as per itinerary (bed & breakfast)')
      }
    } else if (hotelName) {
      inclusions.push(`Hotel accommodation at ${hotelName} (bed & breakfast)`)
    } else {
      inclusions.push('Hotel accommodation as per itinerary (bed & breakfast)')
    }
  }

  // 5. Entrance fees with actual site names
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

  // 6. Meals
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

  // 7. Bottled water
  inclusions.push('Bottled water during tours')

  // 8. Tips for service staff
  inclusions.push('Tips for drivers, porters, and hotel concierge')

  // 9. Taxes
  inclusions.push('All applicable taxes and service charges')

  // 10. Tier-specific premium extras
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
