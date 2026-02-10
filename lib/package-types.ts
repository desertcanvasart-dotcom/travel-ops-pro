// ============================================
// PACKAGE TYPE SYSTEM — Single Source of Truth
// ============================================

export type PackageType =
  | 'day-trips'
  | 'tours-only'
  | 'land-package'
  | 'full-package'
  | 'cruise-package'
  | 'cruise-land'
  | 'shore-excursions'

export interface PackageTypeIncludes {
  accommodation: boolean
  airportTransfers: boolean
  internalTransfers: boolean
  tours: boolean
  meals: 'none' | 'optional' | 'per-hotel'
}

export interface PackageTypeConfig {
  slug: PackageType
  name: string
  description: string
  includes: PackageTypeIncludes
}

export const PACKAGE_TYPE_CONFIGS: PackageTypeConfig[] = [
  {
    slug: 'day-trips',
    name: 'Day Trips',
    description: 'Single or multiple day excursions from a base location',
    includes: { accommodation: false, airportTransfers: false, internalTransfers: true, tours: true, meals: 'optional' }
  },
  {
    slug: 'tours-only',
    name: 'Tours Only',
    description: 'Guided tours and activities. Client arranges own hotels.',
    includes: { accommodation: false, airportTransfers: false, internalTransfers: true, tours: true, meals: 'optional' }
  },
  {
    slug: 'land-package',
    name: 'Land Package',
    description: 'Hotels, tours, and internal transfers. No airport pickup.',
    includes: { accommodation: true, airportTransfers: false, internalTransfers: true, tours: true, meals: 'per-hotel' }
  },
  {
    slug: 'full-package',
    name: 'Full Package',
    description: 'Everything included: hotels, all transfers, tours.',
    includes: { accommodation: true, airportTransfers: true, internalTransfers: true, tours: true, meals: 'per-hotel' }
  },
  {
    slug: 'cruise-package',
    name: 'Cruise Only',
    description: 'Nile Cruise only — no hotels or land tours.',
    includes: { accommodation: true, airportTransfers: true, internalTransfers: true, tours: true, meals: 'per-hotel' }
  },
  {
    slug: 'cruise-land',
    name: 'Cruise + Land',
    description: 'Nile cruise combined with hotels and land tours.',
    includes: { accommodation: true, airportTransfers: true, internalTransfers: true, tours: true, meals: 'per-hotel' }
  },
  {
    slug: 'shore-excursions',
    name: 'Shore Excursions',
    description: 'Port-based day tours for cruise ship passengers.',
    includes: { accommodation: false, airportTransfers: false, internalTransfers: true, tours: true, meals: 'optional' }
  }
]

export const PACKAGE_TYPE_SLUGS = PACKAGE_TYPE_CONFIGS.map(p => p.slug)

/**
 * Validate if a package type is valid
 */
export function isValidPackageType(type: string): type is PackageType {
  return PACKAGE_TYPE_CONFIGS.some(p => p.slug === type)
}

/**
 * Get the AI prompt instructions based on package type
 * This tells the AI what to include/exclude when generating the itinerary
 */
export function getPackageTypeInstructions(packageType: PackageType): string {
  const pkg = PACKAGE_TYPE_CONFIGS.find(p => p.slug === packageType)
  if (!pkg) return ''

  const instructions: string[] = []

  // Accommodation instructions
  if (pkg.includes.accommodation) {
    instructions.push('- INCLUDE accommodation/hotels for each night of the trip')
    instructions.push('- Suggest appropriate hotels based on the tier (Budget/Standard/Deluxe/Luxury)')
  } else {
    instructions.push('- DO NOT include any accommodation or hotels')
    instructions.push('- The client is arranging their own accommodation')
  }

  // Airport transfer instructions
  if (pkg.includes.airportTransfers) {
    instructions.push('- INCLUDE airport pickup on arrival day')
    instructions.push('- INCLUDE airport dropoff on departure day')
  } else {
    instructions.push('- DO NOT include airport transfers')
    if (packageType === 'shore-excursions') {
      instructions.push('- Pickup and dropoff is at the cruise ship terminal/port')
    }
  }

  // Internal transfers
  if (pkg.includes.internalTransfers) {
    instructions.push('- INCLUDE internal transfers between cities/sites')
  }

  // Tours
  if (pkg.includes.tours) {
    instructions.push('- INCLUDE tours and activities as discussed')
  }

  // Meals
  if (pkg.includes.meals === 'per-hotel') {
    instructions.push('- Meals are typically included with hotel (breakfast) or during tours (lunch)')
  } else if (pkg.includes.meals === 'optional') {
    instructions.push('- Meals are optional - only include if specifically discussed')
  }

  return `
## Package Type: ${pkg.name}
${pkg.description}

### What to Include/Exclude:
${instructions.join('\n')}
`
}

/**
 * Get a summary of what's included for display purposes
 */
export function getPackageTypeSummary(packageType: PackageType): {
  name: string
  includes: string[]
  excludes: string[]
} {
  const pkg = PACKAGE_TYPE_CONFIGS.find(p => p.slug === packageType)
  if (!pkg) {
    return { name: 'Unknown', includes: [], excludes: [] }
  }

  const includes: string[] = []
  const excludes: string[] = []

  if (pkg.includes.accommodation) {
    includes.push('Hotels/Accommodation')
  } else {
    excludes.push('Hotels/Accommodation')
  }

  if (pkg.includes.airportTransfers) {
    includes.push('Airport Transfers')
  } else {
    excludes.push('Airport Transfers')
  }

  if (pkg.includes.internalTransfers) {
    includes.push('Internal Transfers')
  }

  if (pkg.includes.tours) {
    includes.push('Tours & Activities')
  }

  return {
    name: pkg.name,
    includes,
    excludes
  }
}
