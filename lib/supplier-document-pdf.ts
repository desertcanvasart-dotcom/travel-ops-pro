// lib/supplier-document-pdf.ts

import jsPDF from 'jspdf'

interface SupplierDocument {
  id: string
  document_type: string
  document_number: string
  supplier_name: string
  supplier_contact_name?: string
  supplier_contact_email?: string
  supplier_contact_phone?: string
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
  services: any[]
  currency: string
  total_cost: number
  payment_terms?: string
  special_requests?: string
  internal_notes?: string
  created_at: string
}

const DOCUMENT_TITLES: Record<string, string> = {
  hotel_voucher: 'HOTEL VOUCHER',
  service_order: 'SERVICE ORDER',
  transport_voucher: 'TRANSPORT VOUCHER',
  activity_voucher: 'ACTIVITY VOUCHER',
  guide_assignment: 'GUIDE ASSIGNMENT',
  cruise_voucher: 'CRUISE VOUCHER'
}

const DOCUMENT_COLORS: Record<string, { r: number, g: number, b: number }> = {
  hotel_voucher: { r: 59, g: 130, b: 246 },      // Blue
  service_order: { r: 139, g: 92, b: 246 },      // Purple
  transport_voucher: { r: 245, g: 158, b: 11 },  // Amber
  activity_voucher: { r: 34, g: 197, b: 94 },    // Green
  guide_assignment: { r: 236, g: 72, b: 153 },   // Pink
  cruise_voucher: { r: 6, g: 182, b: 212 }       // Cyan
}

export function generateSupplierDocumentPDF(doc: SupplierDocument): jsPDF {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 15
  const contentWidth = pageWidth - (margin * 2)
  
  let y = margin
  
  const color = DOCUMENT_COLORS[doc.document_type] || DOCUMENT_COLORS.service_order
  const title = DOCUMENT_TITLES[doc.document_type] || 'SERVICE DOCUMENT'

  // ==================== HEADER ====================
  
  // Company name
  pdf.setFontSize(20)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(color.r, color.g, color.b)
  pdf.text('TRAVEL2EGYPT', margin, y + 7)
  
  // Document type badge
  const badgeWidth = 50
  const badgeX = pageWidth - margin - badgeWidth
  pdf.setFillColor(color.r, color.g, color.b)
  pdf.roundedRect(badgeX, y, badgeWidth, 10, 2, 2, 'F')
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(255, 255, 255)
  pdf.text(title, badgeX + badgeWidth / 2, y + 6.5, { align: 'center' })
  
  y += 12
  
  // Document number and date
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(50, 50, 50)
  pdf.text(doc.document_number, margin, y + 5)
  
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(100, 100, 100)
  const issueDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  pdf.text(`Issued: ${issueDate}`, pageWidth - margin, y + 5, { align: 'right' })
  
  y += 12
  
  // Divider line
  pdf.setDrawColor(color.r, color.g, color.b)
  pdf.setLineWidth(0.5)
  pdf.line(margin, y, pageWidth - margin, y)
  
  y += 8

  // ==================== SUPPLIER INFO ====================
  
  pdf.setFillColor(248, 250, 252)
  pdf.roundedRect(margin, y, contentWidth, 28, 3, 3, 'F')
  
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(color.r, color.g, color.b)
  pdf.text('TO:', margin + 4, y + 6)
  
  pdf.setFontSize(12)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(30, 30, 30)
  pdf.text(doc.supplier_name, margin + 4, y + 13)
  
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(80, 80, 80)
  
  let supplierY = y + 18
  if (doc.supplier_address) {
    pdf.text(doc.supplier_address, margin + 4, supplierY)
    supplierY += 4
  }
  if (doc.supplier_contact_phone) {
    pdf.text(`Tel: ${doc.supplier_contact_phone}`, margin + 4, supplierY)
  }
  if (doc.supplier_contact_email) {
    pdf.text(`Email: ${doc.supplier_contact_email}`, margin + contentWidth / 2, y + 18)
  }
  
  y += 35

  // ==================== GUEST INFO ====================
  
  pdf.setFillColor(255, 255, 255)
  pdf.setDrawColor(200, 200, 200)
  pdf.setLineWidth(0.3)
  pdf.roundedRect(margin, y, contentWidth, 22, 3, 3, 'S')
  
  // Guest name
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(100, 100, 100)
  pdf.text('GUEST NAME', margin + 4, y + 5)
  
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(30, 30, 30)
  pdf.text(doc.client_name, margin + 4, y + 12)
  
  if (doc.client_nationality) {
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(100, 100, 100)
    pdf.text(`Nationality: ${doc.client_nationality}`, margin + 4, y + 17)
  }
  
  // PAX
  const paxX = pageWidth - margin - 40
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(100, 100, 100)
  pdf.text('PAX', paxX, y + 5)
  
  pdf.setFontSize(14)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(color.r, color.g, color.b)
  const totalPax = doc.num_adults + (doc.num_children || 0)
  pdf.text(totalPax.toString(), paxX, y + 13)
  
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(100, 100, 100)
  let paxText = `${doc.num_adults} Adult${doc.num_adults !== 1 ? 's' : ''}`
  if (doc.num_children > 0) {
    paxText += `, ${doc.num_children} Child${doc.num_children !== 1 ? 'ren' : ''}`
  }
  pdf.text(paxText, paxX, y + 18)
  
  y += 28

  // ==================== DATES SECTION ====================
  
  if (doc.document_type === 'hotel_voucher' || doc.document_type === 'cruise_voucher') {
    // Hotel/Cruise: Check-in / Check-out
    const boxWidth = contentWidth / 2 - 2
    
    // Check-in box
    pdf.setFillColor(color.r, color.g, color.b)
    pdf.setFillColor(color.r + 40 > 255 ? 255 : color.r + 40, color.g + 40 > 255 ? 255 : color.g + 40, color.b + 40 > 255 ? 255 : color.b + 40)
    pdf.roundedRect(margin, y, boxWidth, 18, 3, 3, 'F')
    
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(color.r, color.g, color.b)
    pdf.text('CHECK-IN', margin + 4, y + 5)
    
    pdf.setFontSize(12)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(30, 30, 30)
    const checkIn = doc.check_in ? new Date(doc.check_in).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '-'
    pdf.text(checkIn, margin + 4, y + 13)
    
    // Check-out box
    pdf.roundedRect(margin + boxWidth + 4, y, boxWidth, 18, 3, 3, 'F')
    
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(color.r, color.g, color.b)
    pdf.text('CHECK-OUT', margin + boxWidth + 8, y + 5)
    
    pdf.setFontSize(12)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(30, 30, 30)
    const checkOut = doc.check_out ? new Date(doc.check_out).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '-'
    pdf.text(checkOut, margin + boxWidth + 8, y + 13)
    
    // Calculate nights
    if (doc.check_in && doc.check_out) {
      const nights = Math.ceil((new Date(doc.check_out).getTime() - new Date(doc.check_in).getTime()) / (1000 * 60 * 60 * 24))
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(color.r, color.g, color.b)
      pdf.text(`${nights} NIGHT${nights !== 1 ? 'S' : ''}`, pageWidth - margin, y + 10, { align: 'right' })
    }
    
    y += 24
    
  } else {
    // Other documents: Service date with optional pickup info
    pdf.setFillColor(248, 250, 252)
    pdf.roundedRect(margin, y, contentWidth, 18, 3, 3, 'F')
    
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(color.r, color.g, color.b)
    pdf.text('SERVICE DATE', margin + 4, y + 5)
    
    pdf.setFontSize(12)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(30, 30, 30)
    const serviceDate = doc.service_date ? new Date(doc.service_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '-'
    pdf.text(serviceDate, margin + 4, y + 13)
    
    if (doc.pickup_time) {
      pdf.setFontSize(10)
      pdf.text(`Pickup: ${doc.pickup_time}`, pageWidth - margin - 4, y + 13, { align: 'right' })
    }
    
    y += 24
    
    // Pickup/Dropoff locations for transport
    if (doc.document_type === 'transport_voucher' && (doc.pickup_location || doc.dropoff_location)) {
      pdf.setDrawColor(200, 200, 200)
      pdf.roundedRect(margin, y, contentWidth, 16, 3, 3, 'S')
      
      if (doc.pickup_location) {
        pdf.setFontSize(8)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(100, 100, 100)
        pdf.text('PICKUP:', margin + 4, y + 6)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(30, 30, 30)
        pdf.text(doc.pickup_location, margin + 24, y + 6)
      }
      
      if (doc.dropoff_location) {
        pdf.setFontSize(8)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(100, 100, 100)
        pdf.text('DROPOFF:', margin + 4, y + 12)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(30, 30, 30)
        pdf.text(doc.dropoff_location, margin + 28, y + 12)
      }
      
      y += 22
    }
  }

  // ==================== SERVICES TABLE ====================
  
  if (doc.services && doc.services.length > 0) {
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(color.r, color.g, color.b)
    pdf.text('SERVICES INCLUDED', margin, y + 5)
    y += 10
    
    // Table header
    pdf.setFillColor(color.r, color.g, color.b)
    pdf.roundedRect(margin, y, contentWidth, 8, 2, 2, 'F')
    
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(255, 255, 255)
    pdf.text('Date', margin + 4, y + 5.5)
    pdf.text('Service', margin + 35, y + 5.5)
    pdf.text('Qty', pageWidth - margin - 30, y + 5.5, { align: 'right' })
    
    y += 10
    
    // Table rows
    doc.services.forEach((service, idx) => {
      const isOdd = idx % 2 === 0
      if (isOdd) {
        pdf.setFillColor(248, 250, 252)
        pdf.rect(margin, y, contentWidth, 8, 'F')
      }
      
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(80, 80, 80)
      
      const svcDate = service.date ? new Date(service.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'
      pdf.text(svcDate, margin + 4, y + 5.5)
      
      pdf.setTextColor(30, 30, 30)
      const svcName = service.service_name || service.service_type || 'Service'
      pdf.text(svcName.substring(0, 50), margin + 35, y + 5.5)
      
      pdf.text((service.quantity || 1).toString(), pageWidth - margin - 30, y + 5.5, { align: 'right' })
      
      y += 8
      
      // Check for page break
      if (y > pageHeight - 60) {
        pdf.addPage()
        y = margin
      }
    })
    
    y += 5
  }

  // ==================== SPECIAL REQUESTS ====================
  
  if (doc.special_requests) {
    pdf.setFillColor(255, 251, 235)
    pdf.setDrawColor(245, 158, 11)
    pdf.setLineWidth(0.5)
    pdf.roundedRect(margin, y, contentWidth, 20, 3, 3, 'FD')
    
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(180, 83, 9)
    pdf.text('SPECIAL REQUESTS:', margin + 4, y + 6)
    
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(80, 80, 80)
    const lines = pdf.splitTextToSize(doc.special_requests, contentWidth - 8)
    pdf.text(lines.slice(0, 2), margin + 4, y + 12)
    
    y += 26
  }

  // ==================== PAYMENT TERMS ====================
  
  pdf.setDrawColor(200, 200, 200)
  pdf.roundedRect(margin, y, contentWidth / 2 - 2, 16, 3, 3, 'S')
  
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(100, 100, 100)
  pdf.text('PAYMENT TERMS', margin + 4, y + 5)
  
  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(30, 30, 30)
  const paymentTerms = doc.payment_terms?.replace('_', ' ').toUpperCase() || 'AS AGREED'
  pdf.text(paymentTerms, margin + 4, y + 12)
  
  // Total cost
  pdf.setFillColor(color.r, color.g, color.b)
  pdf.roundedRect(margin + contentWidth / 2 + 2, y, contentWidth / 2 - 2, 16, 3, 3, 'F')
  
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(255, 255, 255)
  pdf.text('TOTAL', margin + contentWidth / 2 + 6, y + 5)
  
  pdf.setFontSize(14)
  pdf.setFont('helvetica', 'bold')
  pdf.text(`${doc.currency} ${doc.total_cost.toFixed(2)}`, pageWidth - margin - 4, y + 12, { align: 'right' })
  
  y += 25

  // ==================== SIGNATURE SECTION ====================
  
  pdf.setDrawColor(200, 200, 200)
  pdf.setLineWidth(0.3)
  pdf.line(margin, y + 15, margin + 60, y + 15)
  
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(100, 100, 100)
  pdf.text('Authorized Signature', margin, y + 20)
  
  pdf.line(pageWidth - margin - 60, y + 15, pageWidth - margin, y + 15)
  pdf.text('Supplier Confirmation', pageWidth - margin - 60, y + 20)

  // ==================== FOOTER ====================
  
  const footerY = pageHeight - 15
  
  pdf.setDrawColor(color.r, color.g, color.b)
  pdf.setLineWidth(0.3)
  pdf.line(margin, footerY - 8, pageWidth - margin, footerY - 8)
  
  pdf.setFontSize(8)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(100, 100, 100)
  pdf.text('Travel2Egypt | www.travel2egypt.com | info@travel2egypt.com | +20 xxx xxx xxx', pageWidth / 2, footerY, { align: 'center' })

  return pdf
}