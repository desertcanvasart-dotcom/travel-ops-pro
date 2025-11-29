/**
 * Template Placeholder Utilities
 * 
 * Replaces placeholders like {{client_name}}, {{dates}}, {{total}} with actual values
 */

export interface PlaceholderData {
  // Client information
  client_name?: string
  client_first_name?: string
  client_last_name?: string
  client_email?: string
  client_phone?: string
  
  // Trip information
  trip_name?: string
  trip_dates?: string
  start_date?: string
  end_date?: string
  duration?: string
  num_travelers?: number
  destinations?: string
  
  // Pricing
  total?: string | number
  subtotal?: string | number
  deposit?: string | number
  balance?: string | number
  currency?: string
  
  // Booking
  booking_ref?: string
  booking_id?: string
  confirmation_number?: string
  
  // Company
  company_name?: string
  agent_name?: string
  agent_email?: string
  agent_phone?: string
  
  // Custom fields (dynamic)
  [key: string]: string | number | undefined
}

/**
 * Replace all placeholders in a template with actual values
 * 
 * @param template - The template string with {{placeholders}}
 * @param data - Object containing placeholder values
 * @param options - Optional configuration
 * @returns The template with placeholders replaced
 */
export function replacePlaceholders(
  template: string,
  data: PlaceholderData,
  options: {
    preserveUnmatched?: boolean  // Keep {{placeholder}} if no value provided
    defaultValue?: string        // Default value for unmatched placeholders
    formatCurrency?: boolean     // Auto-format currency values
    currencySymbol?: string      // Currency symbol to use
  } = {}
): string {
  const {
    preserveUnmatched = false,
    defaultValue = '',
    formatCurrency = true,
    currencySymbol = '$'
  } = options

  // Regex to match {{placeholder}} or {{ placeholder }} (with optional spaces)
  const placeholderRegex = /\{\{\s*(\w+)\s*\}\}/g

  return template.replace(placeholderRegex, (match, key) => {
    const value = data[key]

    // No value found
    if (value === undefined || value === null) {
      return preserveUnmatched ? match : defaultValue
    }

    // Format currency values
    if (formatCurrency && isCurrencyField(key) && typeof value === 'number') {
      return formatCurrencyValue(value, currencySymbol)
    }

    return String(value)
  })
}

/**
 * Get list of all placeholders in a template
 */
export function getPlaceholders(template: string): string[] {
  const placeholderRegex = /\{\{\s*(\w+)\s*\}\}/g
  const placeholders: string[] = []
  let match

  while ((match = placeholderRegex.exec(template)) !== null) {
    if (!placeholders.includes(match[1])) {
      placeholders.push(match[1])
    }
  }

  return placeholders
}

/**
 * Validate that all required placeholders have values
 */
export function validatePlaceholders(
  template: string,
  data: PlaceholderData
): { valid: boolean; missing: string[] } {
  const placeholders = getPlaceholders(template)
  const missing = placeholders.filter(p => !data[p])

  return {
    valid: missing.length === 0,
    missing
  }
}

/**
 * Build placeholder data from client and booking objects
 */
export function buildPlaceholderData(
  client?: {
    name?: string
    email?: string
    phone?: string
  },
  booking?: {
    id?: string
    ref?: string
    tripName?: string
    startDate?: string | Date
    endDate?: string | Date
    travelers?: number
    total?: number
    deposit?: number
    currency?: string
  },
  company?: {
    name?: string
    agentName?: string
    agentEmail?: string
    agentPhone?: string
  }
): PlaceholderData {
  const data: PlaceholderData = {}

  // Client data
  if (client) {
    data.client_name = client.name
    if (client.name) {
      const parts = client.name.split(' ')
      data.client_first_name = parts[0]
      data.client_last_name = parts.slice(1).join(' ')
    }
    data.client_email = client.email
    data.client_phone = client.phone
  }

  // Booking data
  if (booking) {
    data.booking_id = booking.id
    data.booking_ref = booking.ref
    data.confirmation_number = booking.ref || booking.id
    data.trip_name = booking.tripName
    data.num_travelers = booking.travelers
    data.total = booking.total
    data.deposit = booking.deposit
    data.currency = booking.currency || 'USD'

    if (booking.total && booking.deposit) {
      data.balance = booking.total - booking.deposit
    }

    // Format dates
    if (booking.startDate) {
      const start = new Date(booking.startDate)
      data.start_date = formatDate(start)
    }
    if (booking.endDate) {
      const end = new Date(booking.endDate)
      data.end_date = formatDate(end)
    }
    if (booking.startDate && booking.endDate) {
      const start = new Date(booking.startDate)
      const end = new Date(booking.endDate)
      data.trip_dates = `${formatDate(start)} - ${formatDate(end)}`
      
      const diffTime = Math.abs(end.getTime() - start.getTime())
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      data.duration = `${diffDays} days`
    }
  }

  // Company data
  if (company) {
    data.company_name = company.name
    data.agent_name = company.agentName
    data.agent_email = company.agentEmail
    data.agent_phone = company.agentPhone
  }

  return data
}

// Helper functions

function isCurrencyField(key: string): boolean {
  const currencyFields = ['total', 'subtotal', 'deposit', 'balance', 'price', 'amount', 'cost', 'fee']
  return currencyFields.some(f => key.toLowerCase().includes(f))
}

function formatCurrencyValue(value: number, symbol: string): string {
  return `${symbol}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

/**
 * Available placeholder reference (for UI display)
 */
export const PLACEHOLDER_REFERENCE = [
  {
    category: 'Client',
    placeholders: [
      { key: 'client_name', description: 'Full client name' },
      { key: 'client_first_name', description: 'Client first name' },
      { key: 'client_last_name', description: 'Client last name' },
      { key: 'client_email', description: 'Client email address' },
      { key: 'client_phone', description: 'Client phone number' },
    ]
  },
  {
    category: 'Trip',
    placeholders: [
      { key: 'trip_name', description: 'Name of the trip/tour' },
      { key: 'trip_dates', description: 'Trip date range (e.g., "Jan 15 - Jan 22, 2025")' },
      { key: 'start_date', description: 'Trip start date' },
      { key: 'end_date', description: 'Trip end date' },
      { key: 'duration', description: 'Trip duration (e.g., "7 days")' },
      { key: 'num_travelers', description: 'Number of travelers' },
      { key: 'destinations', description: 'Destinations/locations' },
    ]
  },
  {
    category: 'Pricing',
    placeholders: [
      { key: 'total', description: 'Total price' },
      { key: 'subtotal', description: 'Subtotal before extras' },
      { key: 'deposit', description: 'Deposit amount' },
      { key: 'balance', description: 'Balance due' },
      { key: 'currency', description: 'Currency code (e.g., "USD")' },
    ]
  },
  {
    category: 'Booking',
    placeholders: [
      { key: 'booking_ref', description: 'Booking reference number' },
      { key: 'booking_id', description: 'Booking ID' },
      { key: 'confirmation_number', description: 'Confirmation number' },
    ]
  },
  {
    category: 'Company',
    placeholders: [
      { key: 'company_name', description: 'Your company name' },
      { key: 'agent_name', description: 'Agent/staff name' },
      { key: 'agent_email', description: 'Agent email' },
      { key: 'agent_phone', description: 'Agent phone' },
    ]
  },
]
