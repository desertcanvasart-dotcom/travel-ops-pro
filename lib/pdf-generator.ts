/**
 * PDF Generator - Client-side helper
 * 
 * This module provides functions to generate PDFs via the server-side
 * Puppeteer API, which properly supports Japanese and other non-Latin characters.
 */

interface Itinerary {
  itinerary_code: string
  client_name: string
  client_email: string
  client_phone?: string
  trip_name: string
  start_date: string
  end_date: string
  total_days: number
  num_adults: number
  num_children: number
  currency: string
  total_cost: number
  status: string
  notes?: string
}

interface Day {
  day_number: number
  date: string
  city: string
  title: string
  description: string
  overnight_city: string
  services: Service[]
}

interface Service {
  service_type: string
  service_name: string
  quantity: number
  total_cost: number
  notes?: string
}

/**
 * Generate an itinerary PDF using the server-side Puppeteer API
 * This properly supports Japanese, Chinese, Arabic, and all Unicode characters
 * 
 * @param itinerary - The itinerary data
 * @param days - Array of day data with services
 * @returns Promise<Blob> - The PDF as a Blob
 */
export async function generateItineraryPDF(
  itinerary: Itinerary, 
  days: Day[]
): Promise<{ save: (filename: string) => void }> {
  try {
    const response = await fetch('/api/pdf/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ itinerary, days }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to generate PDF')
    }

    const blob = await response.blob()
    
    // Return an object with save method to match jsPDF interface
    return {
      save: (filename: string) => {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = filename || `${itinerary.itinerary_code}.pdf`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      }
    }
  } catch (error) {
    console.error('PDF generation error:', error)
    throw error
  }
}

/**
 * Generate PDF and return as Blob (for email attachments, etc.)
 */
export async function generateItineraryPDFBlob(
  itinerary: Itinerary, 
  days: Day[]
): Promise<Blob> {
  const response = await fetch('/api/pdf/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ itinerary, days }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to generate PDF')
  }

  return response.blob()
}

/**
 * Generate PDF and return as Base64 string (for API transmission)
 */
export async function generateItineraryPDFBase64(
  itinerary: Itinerary, 
  days: Day[]
): Promise<string> {
  const blob = await generateItineraryPDFBlob(itinerary, days)
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const base64 = reader.result as string
      // Remove the data URL prefix
      resolve(base64.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}