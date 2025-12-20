// =====================================================
// CONTENT LIBRARY - CATEGORY-SPECIFIC SCHEMAS
// =====================================================
// 📁 COPY TO: lib/content-library/category-schemas.ts
// =====================================================

export type FieldType = 
  | 'text' 
  | 'textarea' 
  | 'number' 
  | 'select' 
  | 'multi-select' 
  | 'checkboxes' 
  | 'boolean' 
  | 'time' 
  | 'rating'
  | 'list'

export interface FieldOption {
  value: string
  label: string
}

export interface CategoryField {
  name: string
  type: FieldType
  label: string
  placeholder?: string
  required?: boolean
  options?: string[] | FieldOption[]
  max?: number // For rating type
  min?: number // For number type
  helpText?: string
}

export interface CategorySchema {
  slug: string
  label: string
  icon: string
  fields: CategoryField[]
  tierConfig: {
    showInclusions: boolean
    showHighlights: boolean
    customFields?: CategoryField[] // Additional tier-specific fields
  }
}

// =====================================================
// CATEGORY SCHEMAS
// =====================================================

export const CATEGORY_SCHEMAS: Record<string, CategorySchema> = {
  // ---------------------------------------------------
  // SITES & ATTRACTIONS
  // ---------------------------------------------------
  'sites-attractions': {
    slug: 'sites-attractions',
    label: 'Sites & Attractions',
    icon: 'Landmark',
    fields: [
      { 
        name: 'duration', 
        type: 'text', 
        label: 'Typical Duration',
        placeholder: 'e.g., 2-3 hours',
        helpText: 'How long visitors typically spend here'
      },
      { 
        name: 'best_time', 
        type: 'select', 
        label: 'Best Time to Visit',
        options: ['Early Morning', 'Morning', 'Afternoon', 'Late Afternoon', 'Sunset', 'Any Time']
      },
      { 
        name: 'accessibility', 
        type: 'select', 
        label: 'Accessibility Level',
        options: ['Easy (fully accessible)', 'Moderate (some walking)', 'Challenging (stairs/terrain)', 'Difficult (significant physical effort)']
      },
      { 
        name: 'photography', 
        type: 'boolean', 
        label: 'Photography Allowed'
      },
      { 
        name: 'ticket_required', 
        type: 'boolean', 
        label: 'Separate Ticket Required'
      },
      {
        name: 'highlights_nearby',
        type: 'list',
        label: 'Nearby Attractions',
        placeholder: 'Add nearby site...',
        helpText: 'Other attractions that can be combined with this visit'
      }
    ],
    tierConfig: {
      showInclusions: false, // REMOVED as requested
      showHighlights: true
    }
  },

  // ---------------------------------------------------
  // HOTELS & ACCOMMODATIONS
  // ---------------------------------------------------
  'hotels-accommodations': {
    slug: 'hotels-accommodations',
    label: 'Hotels & Accommodations',
    icon: 'Hotel',
    fields: [
      { 
        name: 'star_rating', 
        type: 'rating', 
        label: 'Star Rating',
        max: 5
      },
      { 
        name: 'hotel_type', 
        type: 'select', 
        label: 'Property Type',
        options: ['Hotel', 'Resort', 'Boutique Hotel', 'Heritage Hotel', 'Lodge', 'Camp', 'Eco-Lodge']
      },
      { 
        name: 'room_types', 
        type: 'multi-select', 
        label: 'Room Types Available',
        options: ['Standard', 'Superior', 'Deluxe', 'Junior Suite', 'Suite', 'Royal Suite', 'Presidential', 'Villa']
      },
      { 
        name: 'amenities', 
        type: 'checkboxes', 
        label: 'Hotel Amenities',
        options: ['Pool', 'Spa', 'Gym', 'Restaurant', 'Bar', 'Room Service', 'WiFi', 'Parking', 'Shuttle', 'Concierge', 'Business Center', 'Kids Club']
      },
      { 
        name: 'room_amenities', 
        type: 'checkboxes', 
        label: 'Room Features',
        options: ['A/C', 'Minibar', 'Safe', 'Balcony', 'Sea View', 'Nile View', 'Pyramid View', 'City View', 'Bathtub', 'Rain Shower']
      },
      { 
        name: 'check_in', 
        type: 'time', 
        label: 'Check-in Time'
      },
      { 
        name: 'check_out', 
        type: 'time', 
        label: 'Check-out Time'
      },
      { 
        name: 'breakfast_included', 
        type: 'boolean', 
        label: 'Breakfast Typically Included'
      },
      {
        name: 'distance_landmarks',
        type: 'textarea',
        label: 'Distance to Key Landmarks',
        placeholder: 'e.g., 5 min from Pyramids, 20 min from Cairo Airport...',
        helpText: 'Useful distances for itinerary planning'
      }
    ],
    tierConfig: {
      showInclusions: true,
      showHighlights: true
    }
  },

  // ---------------------------------------------------
  // EXPERIENCES & ACTIVITIES
  // ---------------------------------------------------
  'experiences-activities': {
    slug: 'experiences-activities',
    label: 'Experiences & Activities',
    icon: 'Sparkles',
    fields: [
      { 
        name: 'duration', 
        type: 'text', 
        label: 'Duration',
        placeholder: 'e.g., 2 hours, Half day, Full day'
      },
      { 
        name: 'activity_type', 
        type: 'select', 
        label: 'Activity Type',
        options: ['Cultural', 'Adventure', 'Relaxation', 'Water Sports', 'Desert Safari', 'Dining Experience', 'Entertainment', 'Workshop/Class', 'Photography', 'Wellness']
      },
      { 
        name: 'physical_level', 
        type: 'select', 
        label: 'Physical Difficulty',
        options: ['Easy (suitable for all)', 'Moderate (some activity required)', 'Active (good fitness needed)', 'Challenging (high fitness required)']
      },
      { 
        name: 'age_requirement', 
        type: 'text', 
        label: 'Age Requirements',
        placeholder: 'e.g., All ages, 8+, Adults only',
        helpText: 'Minimum age or restrictions'
      },
      { 
        name: 'group_size', 
        type: 'select', 
        label: 'Group Size',
        options: ['Private', 'Small Group (2-8)', 'Medium Group (9-15)', 'Large Group (16+)', 'Flexible']
      },
      { 
        name: 'best_time', 
        type: 'select', 
        label: 'Best Time',
        options: ['Sunrise', 'Morning', 'Afternoon', 'Sunset', 'Evening', 'Night', 'Any Time']
      },
      {
        name: 'what_to_bring',
        type: 'list',
        label: 'What to Bring',
        placeholder: 'Add item...',
        helpText: 'Items guests should bring for this activity'
      },
      {
        name: 'not_suitable_for',
        type: 'list',
        label: 'Not Suitable For',
        placeholder: 'Add restriction...',
        helpText: 'e.g., People with back problems, Pregnant women'
      }
    ],
    tierConfig: {
      showInclusions: true,
      showHighlights: true,
      customFields: [
        {
          name: 'whats_included',
          type: 'list',
          label: 'What\'s Included',
          placeholder: 'Add inclusion...'
        }
      ]
    }
  },

  // ---------------------------------------------------
  // RESTAURANTS & DINING
  // ---------------------------------------------------
  'restaurants-dining': {
    slug: 'restaurants-dining',
    label: 'Restaurants & Dining',
    icon: 'UtensilsCrossed',
    fields: [
      { 
        name: 'cuisine_type', 
        type: 'multi-select', 
        label: 'Cuisine Type',
        options: ['Egyptian', 'Mediterranean', 'Middle Eastern', 'Italian', 'French', 'Asian', 'International', 'Seafood', 'Steakhouse', 'Vegetarian']
      },
      { 
        name: 'meal_types', 
        type: 'checkboxes', 
        label: 'Meals Served',
        options: ['Breakfast', 'Brunch', 'Lunch', 'Dinner', 'All Day']
      },
      { 
        name: 'restaurant_type', 
        type: 'select', 
        label: 'Restaurant Type',
        options: ['Fine Dining', 'Casual Dining', 'Café', 'Rooftop', 'Waterfront', 'Hotel Restaurant', 'Local/Traditional', 'Buffet']
      },
      { 
        name: 'dress_code', 
        type: 'select', 
        label: 'Dress Code',
        options: ['Casual', 'Smart Casual', 'Business Casual', 'Formal']
      },
      { 
        name: 'price_range', 
        type: 'select', 
        label: 'Price Range',
        options: ['$ Budget', '$$ Moderate', '$$$ Upscale', '$$$$ Fine Dining']
      },
      { 
        name: 'dietary_options', 
        type: 'checkboxes', 
        label: 'Dietary Options',
        options: ['Vegetarian', 'Vegan', 'Halal', 'Gluten-Free', 'Kosher', 'Dairy-Free']
      },
      { 
        name: 'reservations', 
        type: 'select', 
        label: 'Reservations',
        options: ['Required', 'Recommended', 'Not Needed', 'Walk-in Only']
      },
      { 
        name: 'alcohol_served', 
        type: 'boolean', 
        label: 'Alcohol Served'
      },
      {
        name: 'signature_dishes',
        type: 'list',
        label: 'Signature Dishes',
        placeholder: 'Add dish...',
        helpText: 'Recommended dishes to highlight'
      },
      {
        name: 'average_meal_time',
        type: 'text',
        label: 'Average Meal Duration',
        placeholder: 'e.g., 1-1.5 hours'
      }
    ],
    tierConfig: {
      showInclusions: false,
      showHighlights: true
    }
  },

  // ---------------------------------------------------
  // CRUISES
  // ---------------------------------------------------
  'cruises': {
    slug: 'cruises',
    label: 'Cruises',
    icon: 'Ship',
    fields: [
      { 
        name: 'cruise_operator', 
        type: 'text', 
        label: 'Cruise Operator',
        placeholder: 'e.g., Oberoi, Sonesta, Sanctuary'
      },
      { 
        name: 'cruise_type', 
        type: 'select', 
        label: 'Cruise Type',
        options: ['Nile Cruise', 'Lake Nasser Cruise', 'Dahabiya', 'Felucca']
      },
      { 
        name: 'route', 
        type: 'select', 
        label: 'Route',
        options: ['Luxor to Aswan', 'Aswan to Luxor', 'Round Trip (Luxor)', 'Round Trip (Aswan)', 'Abu Simbel (Lake Nasser)']
      },
      { 
        name: 'duration_nights', 
        type: 'number', 
        label: 'Duration (Nights)',
        min: 1,
        max: 14
      },
      { 
        name: 'cabin_types', 
        type: 'multi-select', 
        label: 'Cabin Types',
        options: ['Standard', 'Deluxe', 'Junior Suite', 'Suite', 'Royal Suite', 'Presidential']
      },
      { 
        name: 'deck_info', 
        type: 'multi-select', 
        label: 'Deck Options',
        options: ['Main Deck', 'Upper Deck', 'Sun Deck', 'Promenade Deck']
      },
      { 
        name: 'amenities', 
        type: 'checkboxes', 
        label: 'Onboard Amenities',
        options: ['Pool', 'Sun Deck', 'Spa', 'Gym', 'Restaurant', 'Bar', 'Entertainment', 'WiFi', 'Laundry', 'Gift Shop']
      },
      { 
        name: 'departure_days', 
        type: 'checkboxes', 
        label: 'Departure Days',
        options: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      },
      {
        name: 'included_excursions',
        type: 'list',
        label: 'Included Excursions',
        placeholder: 'Add excursion...',
        helpText: 'Sites visited during the cruise'
      },
      { 
        name: 'full_board', 
        type: 'boolean', 
        label: 'Full Board Included'
      }
    ],
    tierConfig: {
      showInclusions: true,
      showHighlights: true
    }
  },

  // ---------------------------------------------------
  // TRANSFERS & TRANSPORTATION
  // ---------------------------------------------------
  'transfers-transportation': {
    slug: 'transfers-transportation',
    label: 'Transfers & Transportation',
    icon: 'Car',
    fields: [
      { 
        name: 'transfer_type', 
        type: 'select', 
        label: 'Transfer Type',
        options: ['Airport Transfer', 'Hotel Transfer', 'Inter-city', 'Day Trip', 'Train Station']
      },
      { 
        name: 'vehicle_types', 
        type: 'multi-select', 
        label: 'Vehicle Types Available',
        options: ['Sedan', 'SUV', 'Minivan 7-seat', 'Van 10-seat', 'Minibus 15-seat', 'Bus 25+', 'Luxury', '4x4']
      },
      { 
        name: 'features', 
        type: 'checkboxes', 
        label: 'Vehicle Features',
        options: ['A/C', 'WiFi', 'Water', 'Child Seat', 'Wheelchair Access', 'USB Charging']
      },
      { 
        name: 'driver_speaks', 
        type: 'multi-select', 
        label: 'Driver Languages',
        options: ['English', 'Arabic', 'French', 'Spanish', 'German', 'Italian']
      },
      { 
        name: 'meet_greet', 
        type: 'boolean', 
        label: 'Meet & Greet Available'
      },
      { 
        name: 'estimated_duration', 
        type: 'text', 
        label: 'Estimated Duration',
        placeholder: 'e.g., 45 minutes'
      }
    ],
    tierConfig: {
      showInclusions: true,
      showHighlights: false
    }
  },

  // ---------------------------------------------------
  // DAY STRUCTURES
  // ---------------------------------------------------
  'day-structures': {
    slug: 'day-structures',
    label: 'Day Structures',
    icon: 'Calendar',
    fields: [
      { 
        name: 'structure_type', 
        type: 'select', 
        label: 'Structure Type',
        options: ['Full Day', 'Half Day (Morning)', 'Half Day (Afternoon)', 'Evening', 'Arrival Day', 'Departure Day', 'Free Day', 'Travel Day']
      },
      { 
        name: 'typical_start', 
        type: 'time', 
        label: 'Typical Start Time'
      },
      { 
        name: 'typical_end', 
        type: 'time', 
        label: 'Typical End Time'
      },
      {
        name: 'time_slots',
        type: 'list',
        label: 'Time Slots',
        placeholder: 'Add time slot (e.g., "08:00 - Breakfast at hotel")...',
        helpText: 'Define the flow of the day'
      }
    ],
    tierConfig: {
      showInclusions: false,
      showHighlights: false
    }
  },

  // ---------------------------------------------------
  // PHRASES & EXPRESSIONS
  // ---------------------------------------------------
  'phrases-expressions': {
    slug: 'phrases-expressions',
    label: 'Phrases & Expressions',
    icon: 'MessageSquare',
    fields: [
      { 
        name: 'phrase_type', 
        type: 'select', 
        label: 'Phrase Type',
        options: ['Greeting', 'Welcome Message', 'Day Opening', 'Day Closing', 'Transfer Description', 'Meal Description', 'Sign-off', 'Thank You', 'Special Occasion']
      },
      { 
        name: 'use_context', 
        type: 'multi-select', 
        label: 'Where to Use',
        options: ['Itinerary', 'Email', 'WhatsApp', 'Quote', 'Invoice']
      },
      { 
        name: 'tone', 
        type: 'select', 
        label: 'Tone',
        options: ['Formal', 'Professional', 'Warm', 'Casual', 'Enthusiastic', 'Luxurious']
      }
    ],
    tierConfig: {
      showInclusions: false,
      showHighlights: false
    }
  }
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Get schema by category slug
 */
export function getCategorySchema(slug: string): CategorySchema | null {
  return CATEGORY_SCHEMAS[slug] || null
}

/**
 * Get schema by category ID (fetches from DB then matches)
 */
export function getSchemaBySlug(categorySlug: string): CategorySchema | null {
  // Normalize slug (handle variations)
  const normalizedSlug = categorySlug.toLowerCase().replace(/\s+/g, '-')
  
  // Direct match
  if (CATEGORY_SCHEMAS[normalizedSlug]) {
    return CATEGORY_SCHEMAS[normalizedSlug]
  }
  
  // Try to find by partial match
  const matchingKey = Object.keys(CATEGORY_SCHEMAS).find(key => 
    normalizedSlug.includes(key) || key.includes(normalizedSlug)
  )
  
  return matchingKey ? CATEGORY_SCHEMAS[matchingKey] : null
}

/**
 * Get all category slugs
 */
export function getAllCategorySlugs(): string[] {
  return Object.keys(CATEGORY_SCHEMAS)
}

/**
 * Get default metadata for a category
 */
export function getDefaultMetadata(slug: string): Record<string, unknown> {
  const schema = getCategorySchema(slug)
  if (!schema) return {}
  
  const defaults: Record<string, unknown> = {}
  
  schema.fields.forEach(field => {
    switch (field.type) {
      case 'boolean':
        defaults[field.name] = false
        break
      case 'checkboxes':
      case 'multi-select':
      case 'list':
        defaults[field.name] = []
        break
      case 'number':
        defaults[field.name] = field.min || 0
        break
      case 'rating':
        defaults[field.name] = 0
        break
      default:
        defaults[field.name] = ''
    }
  })
  
  return defaults
}