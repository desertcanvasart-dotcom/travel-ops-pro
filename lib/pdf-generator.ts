// ============================================
// PDF GENERATOR - ITINERARY QUOTE
// File: lib/pdf-generator.ts
// ============================================

import { jsPDF } from 'jspdf'
import { loadJapaneseFont, pickFontFamily } from './pdf-fonts'

// ============================================
// TYPES
// ============================================

interface Service {
  id: string
  service_type: string
  service_name: string
  quantity: number
  rate_eur?: number
  rate_non_eur?: number
  total_cost: number
  notes?: string
}

interface DayWithServices {
  id: string
  day_number: number
  date: string
  city: string
  title: string
  description: string
  overnight_city: string
  services?: Service[]
}

interface Itinerary {
  id: string
  itinerary_code: string
  client_name: string
  client_email?: string
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
  tier?: string
  inclusions?: string[]
  exclusions?: string[]
}

interface AggregatedService {
  name: string
  type: string
  quantity: number
  total: number
  rate: number
}

// Pre-translated string set passed in by the caller. Built once in the calling
// page via useTranslations('pdf'), then handed in. Keeps the generator pure
// and decoupled from next-intl (which only works in component contexts).
export interface PdfLabels {
  brand: string
  quote: string
  date: string
  client: string
  travelDates: string
  duration: string
  durationDays: (count: number) => string
  travelers: string
  travelerCountAdultsOnly: (adults: number) => string
  travelerCountWithChildren: (adults: number, children: number) => string
  package: string
  packageTier: (tier: string) => string
  egyptTourPackage: string
  day: string
  dayN: (n: number) => string
  dayNumberTitle: (n: number, title: string) => string
  activities: string
  overnight: string
  pricingSummary: string
  subtotal: string
  total: string
  totalPerPerson: string
  service: string
  quantity: string
  rate: string
  amount: string
  inclusions: string
  exclusions: string
  notes: string
}

interface PDFOptions {
  showPricingBreakdown?: boolean  // true = show service breakdown, false = total only
  showServiceDetails?: boolean    // show individual service lines
  // Phase 3 Tier 1 — Japanese delivery. Caller passes locale + pre-translated
  // labels. When locale='ja', the generator loads NotoSansJP and switches the
  // font for every text call. Helvetica (jsPDF default) cannot render kanji.
  locale?: 'en' | 'ja'
  labels?: PdfLabels
}

const DEFAULT_OPTIONS: PDFOptions = {
  showPricingBreakdown: true,
  showServiceDetails: true,
  locale: 'en',
}

// English fallback labels — used when a caller doesn't pass labels (back-compat).
// Caller SHOULD always pass labels in production; this avoids hard-breaking
// edge callers like tests or one-off scripts.
const FALLBACK_LABELS_EN: PdfLabels = {
  brand: 'Travel2Egypt',
  quote: 'Quote',
  date: 'Date',
  client: 'Client',
  travelDates: 'Travel Dates',
  duration: 'Duration',
  durationDays: (n) => `${n} days`,
  travelers: 'Travelers',
  travelerCountAdultsOnly: (a) => `${a} adult${a === 1 ? '' : 's'}`,
  travelerCountWithChildren: (a, c) => `${a} adult${a === 1 ? '' : 's'}, ${c} child${c === 1 ? '' : 'ren'}`,
  package: 'Package',
  packageTier: (t) => `${t} Tier`,
  egyptTourPackage: 'Egypt Tour Package',
  day: 'Day',
  dayN: (n) => `Day ${n}`,
  dayNumberTitle: (n, t) => `Day ${n}: ${t}`,
  activities: 'Activities',
  overnight: 'Overnight',
  pricingSummary: 'PRICING SUMMARY',
  subtotal: 'Subtotal',
  total: 'Total',
  totalPerPerson: 'Total per person',
  service: 'Service',
  quantity: 'Quantity',
  rate: 'Rate',
  amount: 'Amount',
  inclusions: 'Inclusions',
  exclusions: 'Exclusions',
  notes: 'Notes',
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Clean up service names for display
 */
function cleanServiceName(name: string, type: string): string {
  if (!name) return type || 'Service'
  
  let cleaned = name
    .replace(/^(Daily |Per Day |Standard )/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  
  return cleaned || type || 'Service'
}

/**
 * Clean day title - remove duplicate "Day X:" prefix if present
 */
function cleanDayTitle(title: string, dayNumber: number): string {
  if (!title) return `Day ${dayNumber}`
  
  // Remove existing "Day X:" or "Day X -" prefix patterns
  const cleaned = title
    .replace(/^Day\s*\d+\s*[:\-–—]\s*/i, '')
    .trim()
  
  return cleaned || `Day ${dayNumber}`
}

// Locale → BCP-47 tag for Intl. 'en' → 'en-GB' preserves the prior date shape;
// 'ja' → 'ja-JP' renders Japanese-style dates (2026年6月27日).
function intlLocale(locale: 'en' | 'ja'): string {
  return locale === 'ja' ? 'ja-JP' : 'en-GB'
}

function formatDate(dateStr: string, locale: 'en' | 'ja' = 'en'): string {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString(intlLocale(locale), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  } catch {
    return dateStr
  }
}

function formatShortDate(dateStr: string, locale: 'en' | 'ja' = 'en'): string {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString(intlLocale(locale), {
      day: 'numeric',
      month: 'short'
    })
  } catch {
    return dateStr
  }
}

/**
 * Get currency symbol
 */
function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    EUR: '€',
    USD: '$',
    GBP: '£',
    EGP: 'E£'
  }
  return symbols[currency] || currency
}

/**
 * Format currency amount
 */
function formatCurrency(amount: number, currency: string): string {
  const symbol = getCurrencySymbol(currency)
  return `${symbol}${Number(amount).toFixed(2)}`
}

/**
 * Draw a simple table
 */
function drawTable(
  doc: jsPDF,
  startY: number,
  headers: string[],
  rows: string[][],
  colWidths: number[],
  margin: number,
  fontFamily: string = 'helvetica'
): number {
  const rowHeight = 8
  const headerHeight = 10
  let y = startY
  
  // Draw header background
  doc.setFillColor(100, 124, 71)
  doc.rect(margin, y, colWidths.reduce((a, b) => a + b, 0), headerHeight, 'F')
  
  // Draw header text
  doc.setFontSize(9)
  doc.setFont(fontFamily, 'bold')
  doc.setTextColor(255, 255, 255)
  
  let x = margin + 2
  headers.forEach((header, i) => {
    doc.text(header, x, y + 7)
    x += colWidths[i]
  })
  
  y += headerHeight
  
  // Draw rows
  doc.setFont(fontFamily, 'normal')
  doc.setTextColor(60, 60, 60)
  
  rows.forEach((row, rowIndex) => {
    // Alternate row background
    if (rowIndex % 2 === 0) {
      doc.setFillColor(248, 250, 245)
      doc.rect(margin, y, colWidths.reduce((a, b) => a + b, 0), rowHeight, 'F')
    }
    
    x = margin + 2
    row.forEach((cell, i) => {
      // Truncate if too long
      const maxWidth = colWidths[i] - 4
      let text = cell || ''
      while (doc.getTextWidth(text) > maxWidth && text.length > 0) {
        text = text.slice(0, -1)
      }
      if (text !== cell && text.length > 0) {
        text = text.slice(0, -2) + '..'
      }
      doc.text(text, x, y + 5.5)
      x += colWidths[i]
    })
    
    y += rowHeight
  })
  
  // Draw border
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.3)
  doc.rect(margin, startY, colWidths.reduce((a, b) => a + b, 0), y - startY)
  
  return y + 5
}

// ============================================
// MAIN EXPORT FUNCTION
// ============================================

export async function generateItineraryPDF(
  itinerary: Itinerary,
  days: DayWithServices[],
  options: PDFOptions = DEFAULT_OPTIONS
): Promise<jsPDF> {
  console.log('📄 PDF Generator started')

  const opts = { ...DEFAULT_OPTIONS, ...options }
  const locale: 'en' | 'ja' = opts.locale === 'ja' ? 'ja' : 'en'
  const labels: PdfLabels = opts.labels ?? FALLBACK_LABELS_EN

  try {
    if (!itinerary) {
      throw new Error('Itinerary data is required')
    }

    if (!days || !Array.isArray(days)) {
      days = []
    }

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    })

    // Noto Sans JP is the base font for ALL locales (renders Latin + CJK), so
    // a Japanese supplier/client name inside an English document renders
    // instead of tofu. Loaded unconditionally (Regular + Bold). Loader throws
    // if the asset is missing; do NOT silently fall back.
    await loadJapaneseFont(doc)
    const fontFamily = pickFontFamily(locale)

    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 15
    const contentWidth = pageWidth - 2 * margin
    let yPos = margin

    const currency = itinerary.currency || 'EUR'
    
    // ============================================
    // HEADER
    // ============================================
    
    doc.setFontSize(24)
    doc.setFont(fontFamily, 'bold')
    doc.setTextColor(100, 124, 71)
    doc.text(labels.brand, margin, yPos + 8)

    doc.setFontSize(10)
    doc.setFont(fontFamily, 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(`${labels.quote}: ${itinerary.itinerary_code || 'N/A'}`, pageWidth - margin, yPos + 5, { align: 'right' })
    doc.text(`${labels.date}: ${formatDate(new Date().toISOString(), locale)}`, pageWidth - margin, yPos + 10, { align: 'right' })
    
    yPos += 20
    
    // Divider
    doc.setDrawColor(100, 124, 71)
    doc.setLineWidth(0.5)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    
    yPos += 10
    
    // ============================================
    // TRIP TITLE
    // ============================================
    
    doc.setFontSize(18)
    doc.setFont(fontFamily, 'bold')
    doc.setTextColor(40, 40, 40)
    doc.text(itinerary.trip_name || labels.egyptTourPackage, margin, yPos)
    
    yPos += 10
    
    // ============================================
    // TRIP INFO
    // ============================================
    
    doc.setFontSize(10)
    doc.setFont(fontFamily, 'normal')
    doc.setTextColor(80, 80, 80)
    
    const numAdults = itinerary.num_adults || 0
    const numChildren = itinerary.num_children || 0
    const travelerLine = numChildren > 0
      ? labels.travelerCountWithChildren(numAdults, numChildren)
      : labels.travelerCountAdultsOnly(numAdults)
    const infoLines = [
      `${labels.client}: ${itinerary.client_name || 'N/A'}`,
      `${labels.travelDates}: ${formatDate(itinerary.start_date, locale)} - ${formatDate(itinerary.end_date, locale)}`,
      `${labels.duration}: ${labels.durationDays(itinerary.total_days || 0)}`,
      `${labels.travelers}: ${travelerLine}`,
    ]

    if (itinerary.tier) {
      const tierLabel = itinerary.tier.charAt(0).toUpperCase() + itinerary.tier.slice(1)
      infoLines.push(`${labels.package}: ${labels.packageTier(tierLabel)}`)
    }
    
    infoLines.forEach(line => {
      doc.text(line, margin, yPos)
      yPos += 5
    })
    
    yPos += 10
    
    // ============================================
    // ITINERARY OVERVIEW TABLE
    // ============================================
    
    if (days.length > 0) {
      doc.setFontSize(14)
      doc.setFont(fontFamily, 'bold')
      doc.setTextColor(100, 124, 71)
      // Reuses 'activities' label for the overview heading — same column header.
      doc.text(labels.activities.toUpperCase(), margin, yPos)
      
      yPos += 8
      
      // Build table data - clean the titles to avoid "Day X: Day X:"
      const daysData = days.map(day => [
        labels.dayN(day.day_number || 0),
        formatShortDate(day.date, locale),
        cleanDayTitle(day.title, day.day_number) || day.city || '',
        day.overnight_city || ''
      ])
      
      yPos = drawTable(doc, yPos, [labels.day, labels.date, labels.activities, labels.overnight], daysData, [20, 25, 90, 45], margin, fontFamily)
      
      yPos += 5
    }
    
    // ============================================
    // DAY DETAILS
    // ============================================
    
    days.forEach((day, index) => {
      if (yPos > pageHeight - 60) {
        doc.addPage()
        yPos = margin
      }
      
      // Day header box
      doc.setFillColor(245, 247, 241)
      doc.rect(margin, yPos - 3, contentWidth, 10, 'F')
      
      doc.setFontSize(11)
      doc.setFont(fontFamily, 'bold')
      doc.setTextColor(74, 92, 53)
      
      // FIX: Clean the title to avoid "Day X: Day X:" duplication
      const cleanedTitle = cleanDayTitle(day.title, day.day_number)
      doc.text(labels.dayNumberTitle(day.day_number || index + 1, cleanedTitle), margin + 3, yPos + 3)
      
      doc.setFontSize(9)
      doc.setFont(fontFamily, 'normal')
      doc.setTextColor(120, 120, 120)
      doc.text(formatShortDate(day.date, locale), pageWidth - margin - 3, yPos + 3, { align: 'right' })
      
      yPos += 12
      
      // Description
      if (day.description) {
        doc.setFontSize(9)
        doc.setFont(fontFamily, 'normal')
        doc.setTextColor(60, 60, 60)
        
        const lines = doc.splitTextToSize(day.description, contentWidth - 10)
        doc.text(lines, margin + 5, yPos)
        yPos += lines.length * 4 + 5
      }
      
      yPos += 5
    })
    
    // ============================================
    // PRICING SUMMARY
    // ============================================
    
    if (yPos > pageHeight - 100) {
      doc.addPage()
      yPos = margin
    }
    
    doc.setFontSize(14)
    doc.setFont(fontFamily, 'bold')
    doc.setTextColor(100, 124, 71)
    doc.text(labels.pricingSummary, margin, yPos)
    
    yPos += 8
    
    // Show service breakdown only if enabled
    if (opts.showPricingBreakdown && opts.showServiceDetails) {
      // Aggregate services across all days
      const serviceMap = new Map<string, AggregatedService>()
      
      days.forEach((day) => {
        if (!day.services || !Array.isArray(day.services)) return
        
        day.services
          .filter((s) => s && (s.total_cost || 0) > 0)
          .forEach((service) => {
            const name = cleanServiceName(service.service_name, service.service_type)
            const key = `${service.service_type}-${name}`
            
            if (serviceMap.has(key)) {
              const existing = serviceMap.get(key)!
              existing.quantity += service.quantity || 0
              existing.total += service.total_cost || 0
            } else {
              const qty = service.quantity || 1
              const total = service.total_cost || 0
              serviceMap.set(key, {
                name,
                type: service.service_type,
                quantity: qty,
                total,
                rate: qty > 0 ? total / qty : total
              })
            }
          })
      })
      
      const serviceRows = Array.from(serviceMap.values()).map(s => [
        s.name,
        s.quantity.toString(),
        formatCurrency(s.rate, currency),
        formatCurrency(s.total, currency)
      ])
      
      if (serviceRows.length > 0) {
        yPos = drawTable(doc, yPos, [labels.service, labels.quantity, labels.rate, labels.total], serviceRows, [85, 20, 35, 40], margin, fontFamily)
      } else {
        doc.setFontSize(10)
        doc.setFont(fontFamily, 'italic')
        doc.setTextColor(150, 150, 150)
        doc.text('No services calculated yet', margin, yPos)
        yPos += 10
      }
    } else {
      // Total only - no breakdown
      doc.setFontSize(10)
      doc.setFont(fontFamily, 'normal')
      doc.setTextColor(80, 80, 80)
      doc.text('Package includes all services as per itinerary.', margin, yPos)
      yPos += 10
    }
    
    // ============================================
    // TOTAL BOX
    // ============================================
    
    yPos += 5
    const totalPrice = itinerary.total_cost || 0
    const totalPax = (itinerary.num_adults || 0) + (itinerary.num_children || 0)
    
    doc.setFillColor(100, 124, 71)
    doc.roundedRect(pageWidth - margin - 80, yPos, 80, 22, 2, 2, 'F')
    
    doc.setFontSize(9)
    doc.setFont(fontFamily, 'normal')
    doc.setTextColor(255, 255, 255)
    doc.text('TOTAL PRICE', pageWidth - margin - 75, yPos + 7)
    
    doc.setFontSize(16)
    doc.setFont(fontFamily, 'bold')
    doc.text(formatCurrency(totalPrice, currency), pageWidth - margin - 5, yPos + 17, { align: 'right' })
    
    yPos += 32
    
    // Per person cost (if multiple travelers)
    if (totalPax > 1 && totalPrice > 0) {
      doc.setFontSize(9)
      doc.setFont(fontFamily, 'normal')
      doc.setTextColor(100, 100, 100)
      const perPerson = totalPrice / totalPax
      doc.text(`(${formatCurrency(perPerson, currency)} per person)`, pageWidth - margin, yPos, { align: 'right' })
      yPos += 10
    }
    
    // ============================================
    // INCLUSIONS
    // ============================================
    
    if (yPos > pageHeight - 70) {
      doc.addPage()
      yPos = margin
    }
    
    doc.setFontSize(12)
    doc.setFont(fontFamily, 'bold')
    doc.setTextColor(100, 124, 71)
    doc.text('INCLUSIONS', margin, yPos)
    yPos += 6
    
    doc.setFontSize(9)
    doc.setFont(fontFamily, 'normal')
    doc.setTextColor(60, 60, 60)
    
    const inclusions = itinerary.inclusions && itinerary.inclusions.length > 0
      ? itinerary.inclusions
      : [
          'Private air-conditioned vehicle for all transfers and tours',
          'Professional English-speaking Egyptologist guide',
          'All entrance fees to sites mentioned in the itinerary',
          'Bottled water during tours',
          'All applicable taxes and service charges'
        ]

    inclusions.forEach(item => {
      if (yPos > pageHeight - 15) {
        doc.addPage()
        yPos = margin
      }
      doc.text(`• ${item}`, margin + 3, yPos)
      yPos += 5
    })

    yPos += 6

    // ============================================
    // EXCLUSIONS
    // ============================================

    if (yPos > pageHeight - 40) {
      doc.addPage()
      yPos = margin
    }

    doc.setFontSize(12)
    doc.setFont(fontFamily, 'bold')
    doc.setTextColor(100, 124, 71)
    doc.text('EXCLUSIONS', margin, yPos)
    yPos += 6

    doc.setFontSize(9)
    doc.setFont(fontFamily, 'normal')
    doc.setTextColor(60, 60, 60)

    const exclusions = itinerary.exclusions && itinerary.exclusions.length > 0
      ? itinerary.exclusions
      : [
          'International flights',
          'Travel insurance',
          'Personal expenses and tips (optional)',
          'Any items not mentioned in inclusions'
        ]

    exclusions.forEach(item => {
      if (yPos > pageHeight - 15) {
        doc.addPage()
        yPos = margin
      }
      doc.text(`• ${item}`, margin + 3, yPos)
      yPos += 5
    })
    
    yPos += 6
    
    // ============================================
    // PAYMENT TERMS
    // ============================================
    
    if (yPos > pageHeight - 35) {
      doc.addPage()
      yPos = margin
    }
    
    doc.setFontSize(12)
    doc.setFont(fontFamily, 'bold')
    doc.setTextColor(100, 124, 71)
    doc.text('PAYMENT TERMS', margin, yPos)
    yPos += 6
    
    doc.setFontSize(9)
    doc.setFont(fontFamily, 'normal')
    doc.setTextColor(60, 60, 60)
    
    const terms = [
      '30% deposit required to confirm booking',
      'Remaining balance due 14 days before arrival',
      'Payment accepted via bank transfer or credit card'
    ]
    
    terms.forEach(term => {
      doc.text(`• ${term}`, margin + 3, yPos)
      yPos += 5
    })
    
    // ============================================
    // FOOTER ON ALL PAGES
    // ============================================
    
    const totalPages = doc.getNumberOfPages()
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i)
      const footerY = pageHeight - 10
      
      doc.setDrawColor(200, 200, 200)
      doc.setLineWidth(0.3)
      doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5)
      
      doc.setFontSize(8)
      doc.setTextColor(150, 150, 150)
      doc.text('Travel2Egypt | www.travel2egypt.org | info@travel2egypt.org', pageWidth / 2, footerY, { align: 'center' })
      doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, footerY, { align: 'right' })
    }
    
    console.log('📄 PDF generation complete!')
    return doc
    
  } catch (error) {
    console.error('❌ PDF Generation Error:', error)
    throw error
  }
}

// ============================================
// DOWNLOAD HELPER
// ============================================

export async function downloadItineraryPDF(
  itinerary: Itinerary,
  days: DayWithServices[],
  filename?: string,
  options?: PDFOptions
): Promise<void> {
  const doc = await generateItineraryPDF(itinerary, days, options)
  const clientName = (itinerary.client_name || 'Client').replace(/\s+/g, '_')
  const defaultFilename = `${itinerary.itinerary_code}_${clientName}.pdf`
  doc.save(filename || defaultFilename)
}

// ============================================
// CONVENIENCE EXPORTS
// ============================================

// Download with full breakdown (default)
export function downloadWithBreakdown(itinerary: Itinerary, days: DayWithServices[], filename?: string): void {
  downloadItineraryPDF(itinerary, days, filename, { showPricingBreakdown: true, showServiceDetails: true })
}

// Download with total only (no service breakdown)
export function downloadTotalOnly(itinerary: Itinerary, days: DayWithServices[], filename?: string): void {
  downloadItineraryPDF(itinerary, days, filename, { showPricingBreakdown: false, showServiceDetails: false })
}