// lib/supplier-document-pdf.ts
// Professional Supplier Document PDF Generator
// Unified branding with Travel2Egypt / Autoura colors

import jsPDF from 'jspdf'
import { loadJapaneseFont, pickFontFamily } from './pdf-fonts'
import { formatMoney } from '@/lib/currency-totals'

// Caller-supplied translations. Construct in the calling page via
// useTranslations('pdf.voucher') and pass in. Async font load happens
// inside generateSupplierDocumentPDF when locale='ja'.
export interface SupplierDocPdfLabels {
  brand: string
  tagline: string
  documentNumber: string
  issueDate: string
  supplier: string
  supplierUpper: string
  guestInformation: string
  pax: string
  checkIn: string
  checkOut: string
  duration: string
  nights: (count: number) => string
  serviceDate: string
  pickupTime: string
  from: string
  to: string
  service: string
  vehicleType: string
  driver: string
  servicesItems: string
  description: string
  qty: string
  amount: string
  specialRequests: string
  paymentTerms: string
  totalAmount: string
  total: string
  authorizedBy: string
  supplierConfirmationStamp: string
  footerContact: string
  // Added in the JA fix pass — these were rendering English in the JA voucher.
  nationality: string
  // Japanese uses counters (名), not word swaps — built as a function so the
  // count composes naturally: '大人2名、子供1名' (NOT '2 大人 + 1 子供').
  paxComposition: (adults: number, children: number) => string
  driverTBA: string                          // driver fallback when unassigned
  paymentTBC: string                         // payment-terms fallback
  paymentTermsByKey: Record<string, string>  // prepaid/credit/on_service/commission
  vehicleTypes: Record<string, string>       // sedan/minivan/van/... localized
  generatedOn: (datetime: string) => string  // footer "generated on {dt}"
  documentTitle: Record<string, string>  // by document_type
}

const FALLBACK_LABELS_EN: SupplierDocPdfLabels = {
  brand: 'TRAVEL2EGYPT',
  tagline: 'Your Gateway to Egypt',
  documentNumber: 'Document Number',
  issueDate: 'Issue Date',
  supplier: 'Supplier',
  supplierUpper: 'SUPPLIER',
  guestInformation: 'GUEST INFORMATION',
  pax: 'PAX',
  checkIn: 'CHECK-IN',
  checkOut: 'CHECK-OUT',
  duration: 'DURATION',
  nights: (n) => `${n} night${n === 1 ? '' : 's'}`,
  serviceDate: 'SERVICE DATE',
  pickupTime: 'PICKUP TIME',
  from: 'FROM:',
  to: 'TO:',
  service: 'SERVICE',
  vehicleType: 'VEHICLE TYPE',
  driver: 'DRIVER',
  servicesItems: 'SERVICES / ITEMS',
  description: 'Description',
  qty: 'Qty',
  amount: 'Amount',
  specialRequests: 'SPECIAL REQUESTS',
  paymentTerms: 'PAYMENT TERMS',
  totalAmount: 'TOTAL AMOUNT',
  total: 'Total',
  authorizedBy: 'Authorized by Travel2Egypt',
  supplierConfirmationStamp: 'Supplier Confirmation & Stamp',
  footerContact: 'Travel2Egypt | www.travel2egypt.com | reservations@travel2egypt.com | +20 100 XXX XXXX',
  nationality: 'Nationality',
  paxComposition: (a, c) => `${a} Adult${a !== 1 ? 's' : ''}${c > 0 ? ` + ${c} Child${c !== 1 ? 'ren' : ''}` : ''}`,
  driverTBA: 'To be assigned',
  paymentTBC: 'To be confirmed',
  paymentTermsByKey: {
    prepaid: 'Prepaid',
    credit: 'Credit terms',
    on_service: 'Pay on service date',
    commission: 'Commission based',
  },
  vehicleTypes: {
    sedan: 'Sedan (1-3 pax)',
    suv: 'SUV / 4x4 (1-4 pax)',
    minivan: 'Minivan (4-6 pax)',
    van: 'Van (7-10 pax)',
    minibus: 'Minibus (11-20 pax)',
    bus: 'Bus (21+ pax)',
    luxury_sedan: 'Luxury Sedan',
    luxury_van: 'Luxury Van / Sprinter',
  },
  generatedOn: (dt) => `Document generated on ${dt}`,
  documentTitle: {
    hotel_voucher: 'HOTEL VOUCHER',
    service_order: 'SERVICE ORDER',
    transport_voucher: 'TRANSPORT VOUCHER',
    activity_voucher: 'ACTIVITY VOUCHER',
    guide_assignment: 'GUIDE ASSIGNMENT',
    cruise_voucher: 'CRUISE VOUCHER',
    entrance_fees: 'ENTRANCE FEES ORDER',
  },
}

export interface SupplierDocPdfOptions {
  locale?: 'en' | 'ja'
  labels?: SupplierDocPdfLabels
}

interface ServiceItem {
  date?: string
  service_name?: string
  service_type?: string
  quantity?: number
  unit_price?: number
  total_price?: number
  notes?: string
}

interface SupplierDocument {
  id: string
  document_type: string
  document_number: string
  supplier_name: string
  supplier_contact_name?: string
  supplier_contact_email?: string
  supplier_contact_phone?: string
  supplier_whatsapp?: string
  supplier_address?: string
  client_name: string
  client_nationality?: string
  num_adults: number
  num_children: number
  city?: string
  service_date?: string
  check_in?: string
  check_out?: string
  pickup_time?: string
  pickup_location?: string
  dropoff_location?: string
  vehicle_type?: string
  driver_name?: string
  services: ServiceItem[]
  currency: string
  total_cost: number
  payment_terms?: string
  special_requests?: string
  internal_notes?: string
  created_at: string
  // Entrance fees specific
  selected_attractions?: {
    id: string
    attraction_name: string
    city: string
    eur_rate: number
    non_eur_rate: number
    quantity: number
  }[]
  // Transport routes specific
  selected_routes?: {
    rate_id: string
    service_code: string
    route_name: string
    service_type: string
    city: string
    quantity: number
    unit_rate: number
    total_cost: number
  }[]
  // Meal specific
  selected_meals?: {
    rate_id: string
    service_code: string
    restaurant_name: string
    meal_type: string
    city: string
    quantity: number
    unit_rate: number
    total_cost: number
  }[]
  // Guide specific
  selected_guides?: {
    rate_id: string
    service_code: string
    guide_language: string
    guide_type: string
    tour_duration: string
    city: string
    quantity: number
    unit_rate: number
    total_cost: number
  }[]
}

// Brand colors - lighter, more professional palette
const BRAND = {
  primary: { r: 100, g: 124, b: 71 },      // Olive green #647C47
  primaryDark: { r: 80, g: 100, b: 57 },   // Darker olive
  primaryLight: { r: 245, g: 248, b: 241 }, // Very light olive bg (lighter)
  primaryMedium: { r: 220, g: 230, b: 210 }, // Medium light olive for accents
  text: { r: 30, g: 30, b: 30 },
  textMuted: { r: 100, g: 100, b: 100 },
  textLight: { r: 150, g: 150, b: 150 },
  border: { r: 200, g: 210, b: 190 },       // Light olive border
  borderLight: { r: 230, g: 230, b: 230 },  // Very light border
  white: { r: 255, g: 255, b: 255 },
  background: { r: 252, g: 252, b: 250 }
}

const DOCUMENT_TITLES: Record<string, string> = {
  hotel_voucher: 'HOTEL VOUCHER',
  service_order: 'SERVICE ORDER',
  transport_voucher: 'TRANSPORT VOUCHER',
  activity_voucher: 'ACTIVITY VOUCHER',
  guide_assignment: 'GUIDE ASSIGNMENT',
  cruise_voucher: 'CRUISE VOUCHER',
  entrance_fees: 'ENTRANCE FEES ORDER'
}

const DOCUMENT_ICONS: Record<string, string> = {
  hotel_voucher: '🏨',
  service_order: '📋',
  transport_voucher: '🚐',
  activity_voucher: '🎫',
  guide_assignment: '👤',
  cruise_voucher: '🚢',
  entrance_fees: '🎟️'
}

export async function generateSupplierDocumentPDF(
  doc: SupplierDocument,
  options: SupplierDocPdfOptions = {}
): Promise<jsPDF> {
  const locale: 'en' | 'ja' = options.locale === 'ja' ? 'ja' : 'en'
  const labels: SupplierDocPdfLabels = options.labels ?? FALLBACK_LABELS_EN

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  // Noto Sans JP is the base font for ALL locales (Latin + CJK) so a Japanese
  // supplier/client name on an English voucher renders instead of tofu.
  // Loaded unconditionally (Regular + Bold).
  await loadJapaneseFont(pdf)
  const fontFamily = pickFontFamily(locale)

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 15
  const contentWidth = pageWidth - (margin * 2)

  let y = margin

  const title = labels.documentTitle[doc.document_type] || DOCUMENT_TITLES[doc.document_type] || 'SERVICE DOCUMENT'

  // ==================== HEADER SECTION ====================

  // Top accent bar (thin)
  pdf.setFillColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
  pdf.rect(0, 0, pageWidth, 4, 'F')
  
  y = 15
  
  // Company Logo Area (Left side)
  pdf.setFillColor(BRAND.primaryLight.r, BRAND.primaryLight.g, BRAND.primaryLight.b)
  pdf.roundedRect(margin, y, 55, 20, 3, 3, 'F')
  
  pdf.setFontSize(16)
  pdf.setFont(fontFamily, 'bold')
  pdf.setTextColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
  pdf.text(labels.brand, margin + 5, y + 9)
  
  pdf.setFontSize(7)
  pdf.setFont(fontFamily, 'normal')
  pdf.setTextColor(BRAND.textMuted.r, BRAND.textMuted.g, BRAND.textMuted.b)
  pdf.text(labels.tagline, margin + 5, y + 15)
  
  // Document Type & Number (Right side)
  const rightBoxX = pageWidth - margin - 65
  pdf.setFillColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
  pdf.roundedRect(rightBoxX, y, 65, 20, 3, 3, 'F')
  
  pdf.setFontSize(10)
  pdf.setFont(fontFamily, 'bold')
  pdf.setTextColor(BRAND.white.r, BRAND.white.g, BRAND.white.b)
  pdf.text(title, rightBoxX + 32.5, y + 8, { align: 'center' })
  
  pdf.setFontSize(9)
  pdf.setFont(fontFamily, 'normal')
  pdf.text(doc.document_number, rightBoxX + 32.5, y + 15, { align: 'center' })
  
  y += 28
  
  // Issue date line
  pdf.setFontSize(8)
  pdf.setFont(fontFamily, 'normal')
  pdf.setTextColor(BRAND.textMuted.r, BRAND.textMuted.g, BRAND.textMuted.b)
  const issueDate = new Date().toLocaleDateString(locale === 'ja' ? 'ja-JP' : 'en-US', { 
    weekday: 'long',
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  })
  pdf.text(`${labels.issueDate}: ${issueDate}`, pageWidth - margin, y, { align: 'right' })
  
  y += 8

  // ==================== SUPPLIER & GUEST INFO ====================
  
  // Two-column layout
  const colWidth = (contentWidth - 6) / 2
  
  // Supplier Box (Left)
  pdf.setFillColor(BRAND.background.r, BRAND.background.g, BRAND.background.b)
  pdf.setDrawColor(BRAND.border.r, BRAND.border.g, BRAND.border.b)
  pdf.setLineWidth(0.3)
  pdf.roundedRect(margin, y, colWidth, 38, 3, 3, 'FD')
  
  pdf.setFontSize(7)
  pdf.setFont(fontFamily, 'bold')
  pdf.setTextColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
  pdf.text(labels.supplierUpper, margin + 4, y + 5)
  
  pdf.setFontSize(11)
  pdf.setFont(fontFamily, 'bold')
  pdf.setTextColor(BRAND.text.r, BRAND.text.g, BRAND.text.b)
  pdf.text(doc.supplier_name || 'N/A', margin + 4, y + 12)
  
  pdf.setFontSize(8)
  pdf.setFont(fontFamily, 'normal')
  pdf.setTextColor(BRAND.textMuted.r, BRAND.textMuted.g, BRAND.textMuted.b)
  
  let supplierY = y + 18
  if (doc.supplier_address) {
    const addressLines = pdf.splitTextToSize(doc.supplier_address, colWidth - 8)
    pdf.text(addressLines.slice(0, 2), margin + 4, supplierY)
    supplierY += addressLines.slice(0, 2).length * 4
  }
  if (doc.supplier_contact_phone) {
    pdf.text(`Tel: ${doc.supplier_contact_phone}`, margin + 4, supplierY)
    supplierY += 4
  }
  if (doc.supplier_whatsapp) {
    pdf.text(`WhatsApp: ${doc.supplier_whatsapp}`, margin + 4, supplierY)
    supplierY += 4
  }
  if (doc.supplier_contact_email) {
    pdf.text(`Email: ${doc.supplier_contact_email}`, margin + 4, supplierY)
  }
  
  // Guest Box (Right)
  const guestBoxX = margin + colWidth + 6
  pdf.setFillColor(BRAND.primaryLight.r, BRAND.primaryLight.g, BRAND.primaryLight.b)
  pdf.setDrawColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
  pdf.roundedRect(guestBoxX, y, colWidth, 38, 3, 3, 'FD')
  
  pdf.setFontSize(7)
  pdf.setFont(fontFamily, 'bold')
  pdf.setTextColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
  pdf.text(labels.guestInformation, guestBoxX + 4, y + 5)
  
  pdf.setFontSize(11)
  pdf.setFont(fontFamily, 'bold')
  pdf.setTextColor(BRAND.text.r, BRAND.text.g, BRAND.text.b)
  pdf.text(doc.client_name || 'N/A', guestBoxX + 4, y + 12)
  
  pdf.setFontSize(8)
  pdf.setFont(fontFamily, 'normal')
  pdf.setTextColor(BRAND.textMuted.r, BRAND.textMuted.g, BRAND.textMuted.b)
  
  if (doc.client_nationality) {
    pdf.text(`${labels.nationality}: ${doc.client_nationality}`, guestBoxX + 4, y + 18)
  }
  
  // PAX display
  const totalPax = doc.num_adults + (doc.num_children || 0)
  pdf.setFontSize(20)
  pdf.setFont(fontFamily, 'bold')
  pdf.setTextColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
  pdf.text(totalPax.toString(), guestBoxX + colWidth - 15, y + 18)
  
  pdf.setFontSize(7)
  pdf.setFont(fontFamily, 'normal')
  pdf.setTextColor(BRAND.textMuted.r, BRAND.textMuted.g, BRAND.textMuted.b)
  pdf.text(labels.pax, guestBoxX + colWidth - 15, y + 23)
  
  const paxDetail = labels.paxComposition(doc.num_adults, doc.num_children || 0)
  pdf.text(paxDetail, guestBoxX + 4, y + 33)
  
  if (doc.city) {
    pdf.text(doc.city, guestBoxX + 4, y + 28)
  }
  
  y += 45

  // ==================== DATE/TIME SECTION ====================
  
  if (doc.document_type === 'hotel_voucher' || doc.document_type === 'cruise_voucher') {
    // Hotel/Cruise: Check-in / Check-out with nights
    const dateBoxWidth = (contentWidth - 12) / 3
    
    // Check-in
    pdf.setFillColor(BRAND.white.r, BRAND.white.g, BRAND.white.b)
    pdf.setDrawColor(BRAND.border.r, BRAND.border.g, BRAND.border.b)
    pdf.roundedRect(margin, y, dateBoxWidth, 22, 3, 3, 'FD')
    
    pdf.setFontSize(7)
    pdf.setFont(fontFamily, 'bold')
    pdf.setTextColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
    pdf.text(labels.checkIn, margin + 4, y + 5)
    
    pdf.setFontSize(10)
    pdf.setFont(fontFamily, 'bold')
    pdf.setTextColor(BRAND.text.r, BRAND.text.g, BRAND.text.b)
    const checkInDate = doc.check_in ? new Date(doc.check_in).toLocaleDateString(locale === 'ja' ? 'ja-JP' : 'en-US', { 
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' 
    }) : '—'
    pdf.text(checkInDate, margin + 4, y + 14)
    
    // Check-out — set fill+draw explicitly. Previously this box had no
    // setFillColor and inherited the prior fill state, rendering solid black
    // over the date (mis-rendered in EN too — a pre-existing drawing bug).
    pdf.setFillColor(BRAND.white.r, BRAND.white.g, BRAND.white.b)
    pdf.setDrawColor(BRAND.border.r, BRAND.border.g, BRAND.border.b)
    pdf.roundedRect(margin + dateBoxWidth + 6, y, dateBoxWidth, 22, 3, 3, 'FD')

    pdf.setFontSize(7)
    pdf.setFont(fontFamily, 'bold')
    pdf.setTextColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
    pdf.text(labels.checkOut, margin + dateBoxWidth + 10, y + 5)
    
    pdf.setFontSize(10)
    pdf.setFont(fontFamily, 'bold')
    pdf.setTextColor(BRAND.text.r, BRAND.text.g, BRAND.text.b)
    const checkOutDate = doc.check_out ? new Date(doc.check_out).toLocaleDateString(locale === 'ja' ? 'ja-JP' : 'en-US', { 
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' 
    }) : '—'
    pdf.text(checkOutDate, margin + dateBoxWidth + 10, y + 14)
    
    // Nights
    pdf.setFillColor(BRAND.primaryLight.r, BRAND.primaryLight.g, BRAND.primaryLight.b)
    pdf.setDrawColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
    pdf.roundedRect(margin + (dateBoxWidth + 6) * 2, y, dateBoxWidth, 22, 3, 3, 'FD')

    let nights = 0
    if (doc.check_in && doc.check_out) {
      nights = Math.ceil((new Date(doc.check_out).getTime() - new Date(doc.check_in).getTime()) / (1000 * 60 * 60 * 24))
    }

    pdf.setFontSize(7)
    pdf.setFont(fontFamily, 'bold')
    pdf.setTextColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
    pdf.text(labels.duration, margin + (dateBoxWidth + 6) * 2 + 4, y + 5)

    pdf.setFontSize(14)
    pdf.setTextColor(BRAND.text.r, BRAND.text.g, BRAND.text.b)
    // Use the locale-aware nights() label (e.g. '3泊' / '3 nights') instead of
    // the hardcoded English 'N NIGHTS'.
    pdf.text(labels.nights(nights), margin + (dateBoxWidth + 6) * 2 + dateBoxWidth / 2, y + 15, { align: 'center' })
    
    y += 28
    
  } else {
    // Other documents: Service date, pickup time, locations
    const dateBoxWidth = (contentWidth - 6) / 2
    
    // Service Date
    pdf.setFillColor(BRAND.white.r, BRAND.white.g, BRAND.white.b)
    pdf.setDrawColor(BRAND.border.r, BRAND.border.g, BRAND.border.b)
    pdf.roundedRect(margin, y, dateBoxWidth, 22, 3, 3, 'FD')
    
    pdf.setFontSize(7)
    pdf.setFont(fontFamily, 'bold')
    pdf.setTextColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
    pdf.text(labels.serviceDate, margin + 4, y + 5)
    
    pdf.setFontSize(10)
    pdf.setFont(fontFamily, 'bold')
    pdf.setTextColor(BRAND.text.r, BRAND.text.g, BRAND.text.b)
    const serviceDate = doc.service_date ? new Date(doc.service_date).toLocaleDateString(locale === 'ja' ? 'ja-JP' : 'en-US', { 
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' 
    }) : '—'
    pdf.text(serviceDate, margin + 4, y + 14)
    
    // Pickup Time
    pdf.setFillColor(BRAND.primaryLight.r, BRAND.primaryLight.g, BRAND.primaryLight.b)
    pdf.setDrawColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
    pdf.roundedRect(margin + dateBoxWidth + 6, y, dateBoxWidth, 22, 3, 3, 'FD')

    pdf.setFontSize(7)
    pdf.setFont(fontFamily, 'bold')
    pdf.setTextColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
    pdf.text(labels.pickupTime, margin + dateBoxWidth + 10, y + 5)

    pdf.setFontSize(14)
    pdf.setFont(fontFamily, 'bold')
    pdf.setTextColor(BRAND.text.r, BRAND.text.g, BRAND.text.b)
    pdf.text(doc.pickup_time || '—', margin + dateBoxWidth + 10, y + 15)
    
    y += 28
    
    // Pickup/Dropoff for transport (only show single-route box when no selected_routes)
    if (doc.document_type === 'transport_voucher' && !doc.selected_routes?.length && (doc.pickup_location || doc.dropoff_location)) {
      pdf.setFillColor(BRAND.background.r, BRAND.background.g, BRAND.background.b)
      pdf.roundedRect(margin, y, contentWidth, 18, 3, 3, 'F')

      pdf.setFontSize(8)
      pdf.setFont(fontFamily, 'normal')
      pdf.setTextColor(BRAND.textMuted.r, BRAND.textMuted.g, BRAND.textMuted.b)

      if (doc.pickup_location) {
        pdf.setFont(fontFamily, 'bold')
        pdf.text(labels.from, margin + 4, y + 7)
        pdf.setFont(fontFamily, 'normal')
        pdf.setTextColor(BRAND.text.r, BRAND.text.g, BRAND.text.b)
        pdf.text(doc.pickup_location, margin + 20, y + 7)
      }

      if (doc.dropoff_location) {
        pdf.setTextColor(BRAND.textMuted.r, BRAND.textMuted.g, BRAND.textMuted.b)
        pdf.setFont(fontFamily, 'bold')
        pdf.text(labels.to, margin + 4, y + 13)
        pdf.setFont(fontFamily, 'normal')
        pdf.setTextColor(BRAND.text.r, BRAND.text.g, BRAND.text.b)
        pdf.text(doc.dropoff_location, margin + 20, y + 13)
      }

      y += 24
    }

    // Vehicle Type & Driver for transport
    if (doc.document_type === 'transport_voucher' && (doc.vehicle_type || doc.driver_name)) {
      // Locale-aware vehicle type names (was a hardcoded English dict).
      const vehicleTypeLabels = labels.vehicleTypes

      const halfWidth = (contentWidth - 6) / 2

      // Vehicle Type Box
      pdf.setFillColor(BRAND.primaryLight.r, BRAND.primaryLight.g, BRAND.primaryLight.b)
      pdf.setDrawColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
      pdf.roundedRect(margin, y, halfWidth, 18, 3, 3, 'FD')

      pdf.setFontSize(7)
      pdf.setFont(fontFamily, 'bold')
      pdf.setTextColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
      pdf.text(labels.vehicleType, margin + 4, y + 5)

      pdf.setFontSize(10)
      pdf.setFont(fontFamily, 'bold')
      pdf.setTextColor(BRAND.text.r, BRAND.text.g, BRAND.text.b)
      const vehicleLabel = doc.vehicle_type ? (vehicleTypeLabels[doc.vehicle_type] || doc.vehicle_type) : '—'
      pdf.text(vehicleLabel, margin + 4, y + 13)

      // Driver Name Box
      pdf.setFillColor(BRAND.background.r, BRAND.background.g, BRAND.background.b)
      pdf.setDrawColor(BRAND.border.r, BRAND.border.g, BRAND.border.b)
      pdf.roundedRect(margin + halfWidth + 6, y, halfWidth, 18, 3, 3, 'FD')

      pdf.setFontSize(7)
      pdf.setFont(fontFamily, 'bold')
      pdf.setTextColor(BRAND.textMuted.r, BRAND.textMuted.g, BRAND.textMuted.b)
      pdf.text(labels.driver, margin + halfWidth + 10, y + 5)

      pdf.setFontSize(10)
      pdf.setFont(fontFamily, 'normal')
      pdf.setTextColor(BRAND.text.r, BRAND.text.g, BRAND.text.b)
      pdf.text(doc.driver_name || labels.driverTBA, margin + halfWidth + 10, y + 13)

      y += 24
    }
  }

  // ==================== SERVICES TABLE ====================
  
  const hasServices = (doc.services && doc.services.length > 0) || (doc.selected_attractions && doc.selected_attractions.length > 0) || (doc.selected_routes && doc.selected_routes.length > 0) || (doc.selected_meals && doc.selected_meals.length > 0) || (doc.selected_guides && doc.selected_guides.length > 0)
  
  if (hasServices) {
    pdf.setFontSize(9)
    pdf.setFont(fontFamily, 'bold')
    pdf.setTextColor(BRAND.text.r, BRAND.text.g, BRAND.text.b)
    pdf.text(labels.servicesItems, margin, y + 5)
    y += 10
    
    // Table header
    pdf.setFillColor(BRAND.primaryLight.r, BRAND.primaryLight.g, BRAND.primaryLight.b)
    pdf.setDrawColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
    pdf.setLineWidth(0.5)
    pdf.roundedRect(margin, y, contentWidth, 10, 2, 2, 'FD')

    pdf.setFontSize(8)
    pdf.setFont(fontFamily, 'bold')
    pdf.setTextColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
    pdf.text(labels.description, margin + 4, y + 6.5)
    pdf.text(labels.qty, pageWidth - margin - 40, y + 6.5, { align: 'center' })
    pdf.text(labels.amount, pageWidth - margin - 4, y + 6.5, { align: 'right' })
    
    y += 12
    
    // Use selected_routes for transport, selected_meals for meals, selected_attractions for entrance fees, otherwise use services
    const items = doc.selected_routes || doc.selected_meals || doc.selected_guides || doc.selected_attractions || doc.services || []
    
    items.forEach((item: any, idx: number) => {
      const isOdd = idx % 2 === 0
      if (isOdd) {
        pdf.setFillColor(BRAND.background.r, BRAND.background.g, BRAND.background.b)
        pdf.rect(margin, y, contentWidth, 10, 'F')
      }
      
      pdf.setFontSize(8)
      pdf.setFont(fontFamily, 'normal')
      pdf.setTextColor(BRAND.text.r, BRAND.text.g, BRAND.text.b)
      
      // Get item name
      const itemName = item.route_name || item.restaurant_name || (item.guide_language ? `${item.guide_language} ${(item.guide_type || '').replace(/_/g, ' ')} - ${(item.tour_duration || '').replace(/_/g, ' ')}` : null) || item.attraction_name || item.service_name || item.service_type || 'Service'
      const itemCity = item.city ? ` (${item.city})` : ''
      pdf.text((itemName + itemCity).substring(0, 60), margin + 4, y + 6.5)

      // Quantity
      const qty = item.quantity || 1
      pdf.text(qty.toString(), pageWidth - margin - 40, y + 6.5, { align: 'center' })

      // Amount
      const amount = item.total_cost || item.total_price || item.eur_rate || item.unit_price || 0
      if (amount > 0) {
        pdf.text(formatMoney(amount, doc.currency), pageWidth - margin - 4, y + 6.5, { align: 'right' })
      } else {
        pdf.text('—', pageWidth - margin - 4, y + 6.5, { align: 'right' })
      }
      
      y += 10
      
      // Page break check
      if (y > pageHeight - 70) {
        pdf.addPage()
        y = margin

        // Re-add header bar on new page (thin)
        pdf.setFillColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
        pdf.rect(0, 0, pageWidth, 4, 'F')
        y = 15
      }
    })
    
    y += 5
  }

  // ==================== SPECIAL REQUESTS ====================
  
  if (doc.special_requests) {
    pdf.setFillColor(255, 250, 240)
    pdf.setDrawColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
    pdf.setLineWidth(0.5)
    pdf.roundedRect(margin, y, contentWidth, 22, 3, 3, 'FD')
    
    pdf.setFontSize(7)
    pdf.setFont(fontFamily, 'bold')
    pdf.setTextColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
    pdf.text(labels.specialRequests, margin + 4, y + 5)
    
    pdf.setFontSize(9)
    pdf.setFont(fontFamily, 'normal')
    pdf.setTextColor(BRAND.text.r, BRAND.text.g, BRAND.text.b)
    const requestLines = pdf.splitTextToSize(doc.special_requests, contentWidth - 8)
    pdf.text(requestLines.slice(0, 3), margin + 4, y + 12)
    
    y += 28
  }

  // ==================== TOTAL & PAYMENT ====================
  
  // Payment terms (left)
  const paymentBoxWidth = contentWidth * 0.55
  pdf.setFillColor(BRAND.background.r, BRAND.background.g, BRAND.background.b)
  pdf.roundedRect(margin, y, paymentBoxWidth, 18, 3, 3, 'F')
  
  pdf.setFontSize(7)
  pdf.setFont(fontFamily, 'bold')
  pdf.setTextColor(BRAND.textMuted.r, BRAND.textMuted.g, BRAND.textMuted.b)
  pdf.text(labels.paymentTerms, margin + 4, y + 5)
  
  pdf.setFontSize(10)
  pdf.setFont(fontFamily, 'normal')
  pdf.setTextColor(BRAND.text.r, BRAND.text.g, BRAND.text.b)
  // Locale-aware payment-terms display (was a hardcoded English dict + fallback).
  const paymentTermsText = doc.payment_terms
    ? (labels.paymentTermsByKey[doc.payment_terms] || doc.payment_terms.replace(/_/g, ' '))
    : labels.paymentTBC
  pdf.text(paymentTermsText, margin + 4, y + 13)
  
  // Total (right)
  const totalBoxWidth = contentWidth * 0.4
  const totalBoxX = pageWidth - margin - totalBoxWidth
  pdf.setFillColor(BRAND.primaryLight.r, BRAND.primaryLight.g, BRAND.primaryLight.b)
  pdf.setDrawColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
  pdf.setLineWidth(0.8)
  pdf.roundedRect(totalBoxX, y, totalBoxWidth, 18, 3, 3, 'FD')

  pdf.setFontSize(7)
  pdf.setFont(fontFamily, 'bold')
  pdf.setTextColor(BRAND.primary.r, BRAND.primary.g, BRAND.primary.b)
  pdf.text(labels.totalAmount, totalBoxX + 4, y + 5)

  pdf.setFontSize(14)
  pdf.setFont(fontFamily, 'bold')
  pdf.setTextColor(BRAND.text.r, BRAND.text.g, BRAND.text.b)
  pdf.text(formatMoney(doc.total_cost, doc.currency), totalBoxX + totalBoxWidth - 4, y + 14, { align: 'right' })
  
  y += 28

  // ==================== SIGNATURES ====================
  
  const sigWidth = (contentWidth - 20) / 2
  
  // Our signature
  pdf.setDrawColor(BRAND.border.r, BRAND.border.g, BRAND.border.b)
  pdf.setLineWidth(0.3)
  pdf.line(margin, y + 12, margin + sigWidth, y + 12)
  
  pdf.setFontSize(8)
  pdf.setFont(fontFamily, 'normal')
  pdf.setTextColor(BRAND.textMuted.r, BRAND.textMuted.g, BRAND.textMuted.b)
  pdf.text(labels.authorizedBy, margin, y + 18)
  
  // Supplier signature
  pdf.line(pageWidth - margin - sigWidth, y + 12, pageWidth - margin, y + 12)
  pdf.text(labels.supplierConfirmationStamp, pageWidth - margin - sigWidth, y + 18)

  // ==================== FOOTER ====================
  
  const footerY = pageHeight - 12
  
  // Footer bar
  pdf.setFillColor(BRAND.primaryLight.r, BRAND.primaryLight.g, BRAND.primaryLight.b)
  pdf.rect(0, footerY - 8, pageWidth, 20, 'F')
  
  pdf.setFontSize(7)
  pdf.setFont(fontFamily, 'normal')
  pdf.setTextColor(BRAND.textMuted.r, BRAND.textMuted.g, BRAND.textMuted.b)
  pdf.text(labels.footerContact, pageWidth / 2, footerY, { align: 'center' })
  
  pdf.setFontSize(6)
  pdf.setTextColor(BRAND.textLight.r, BRAND.textLight.g, BRAND.textLight.b)
  const generatedAt = new Date().toLocaleString(locale === 'ja' ? 'ja-JP' : 'en-US')
  pdf.text(`${labels.generatedOn(generatedAt)} | ${doc.document_number}`, pageWidth / 2, footerY + 5, { align: 'center' })

  return pdf
}