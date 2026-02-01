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
      showInclusions: false,
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