import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

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

const COLORS = {
  primary: [41, 98, 255], // Blue
  secondary: [99, 102, 241],
  text: [31, 41, 55],
  textLight: [107, 114, 128],
  border: [229, 231, 235],
  success: [34, 197, 94]
}

export function generateItineraryPDF(itinerary: Itinerary, days: Day[]) {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  let yPos = 20

  // Helper function to check if new page needed
  const checkPageBreak = (neededSpace: number) => {
    if (yPos + neededSpace > pageHeight - 20) {
      doc.addPage()
      yPos = 20
      return true
    }
    return false
  }

  // ============================================
  // HEADER SECTION
  // ============================================
  
  // Company Logo Circle
  doc.setFillColor(COLORS.primary[0], COLORS.primary[1], COLORS.primary[2])
  doc.circle(20, yPos + 5, 8, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('T2E', 20, yPos + 8, { align: 'center' })

  // Company Name
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2])
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('TRAVEL TO EGYPT', 35, yPos + 5)
  
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(COLORS.textLight[0], COLORS.textLight[1], COLORS.textLight[2])
  doc.text('Professional Itinerary & Quote', 35, yPos + 11)

  // Quote Number and Date (right aligned)
  doc.setFontSize(9)
  doc.setTextColor(COLORS.textLight[0], COLORS.textLight[1], COLORS.textLight[2])
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  
  doc.text(`Quote: ${itinerary.itinerary_code}`, pageWidth - 20, yPos + 3, { align: 'right' })
  doc.text(`Date: ${today}`, pageWidth - 20, yPos + 8, { align: 'right' })
  doc.text(`Valid until: ${validUntil}`, pageWidth - 20, yPos + 13, { align: 'right' })

  yPos += 25

  // Divider
  doc.setDrawColor(COLORS.border[0], COLORS.border[1], COLORS.border[2])
  doc.setLineWidth(0.5)
  doc.line(20, yPos, pageWidth - 20, yPos)
  yPos += 10

  // ============================================
  // CLIENT INFORMATION
  // ============================================
  
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2])
  doc.text('CLIENT INFORMATION', 20, yPos)
  yPos += 8

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(COLORS.textLight[0], COLORS.textLight[1], COLORS.textLight[2])
  
  doc.text(`Name: ${itinerary.client_name}`, 20, yPos)
  yPos += 5
  doc.text(`Email: ${itinerary.client_email}`, 20, yPos)
  yPos += 5
  if (itinerary.client_phone) {
    doc.text(`Phone: ${itinerary.client_phone}`, 20, yPos)
    yPos += 5
  }
  doc.text(`Travel Date: ${new Date(itinerary.start_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 20, yPos)
  yPos += 10

  // ============================================
  // TOUR OVERVIEW
  // ============================================
  
  checkPageBreak(40)
  
  // Tour name in colored box
  doc.setFillColor(COLORS.primary[0], COLORS.primary[1], COLORS.primary[2])
  doc.roundedRect(20, yPos, pageWidth - 40, 15, 3, 3, 'F')
  
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(itinerary.trip_name.toUpperCase(), pageWidth / 2, yPos + 6, { align: 'center' })
  
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  const tourDetails = `${itinerary.total_days} ${itinerary.total_days === 1 ? 'Day' : 'Days'} | ${itinerary.num_adults} ${itinerary.num_adults === 1 ? 'Adult' : 'Adults'}${itinerary.num_children > 0 ? ` | ${itinerary.num_children} ${itinerary.num_children === 1 ? 'Child' : 'Children'}` : ''}`
  doc.text(tourDetails, pageWidth / 2, yPos + 11, { align: 'center' })
  
  yPos += 25

  // ============================================
  // DETAILED ITINERARY
  // ============================================
  
  checkPageBreak(20)
  
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2])
  doc.text('DETAILED ITINERARY', 20, yPos)
  yPos += 10

  // Loop through each day
  days.forEach((day) => {
    checkPageBreak(50)

    // Day header
    doc.setFillColor(248, 250, 252)
    doc.roundedRect(20, yPos, pageWidth - 40, 10, 2, 2, 'F')
    
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(COLORS.primary[0], COLORS.primary[1], COLORS.primary[2])
    doc.text(`Day ${day.day_number} - ${day.title}`, 25, yPos + 6.5)
    
    yPos += 12

    // Day description
    if (day.description) {
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(COLORS.textLight[0], COLORS.textLight[1], COLORS.textLight[2])
      const descLines = doc.splitTextToSize(day.description, pageWidth - 50)
      doc.text(descLines, 25, yPos)
      yPos += descLines.length * 4 + 2
    }

    // Services for this day
    if (day.services && day.services.length > 0) {

    }



    yPos += 8
  })

  // ============================================
  // PRICING SUMMARY
  // ============================================
  
  checkPageBreak(60)
  
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2])
  doc.text('PRICING SUMMARY', 20, yPos)
  yPos += 10

  // Services table
  const serviceRows: any[] = []
  days.forEach((day) => {
    day.services.forEach((service) => {
      serviceRows.push([
        service.service_name,
        service.quantity,
        `${itinerary.currency} ${(service.total_cost / service.quantity).toFixed(2)}`,
        `${itinerary.currency} ${service.total_cost.toFixed(2)}`
      ])
    })
  })

  autoTable(doc, {
    startY: yPos,
    head: [['Service', 'Qty', 'Rate', 'Total']],
    body: serviceRows,
    theme: 'striped',
    headStyles: {
      fillColor: COLORS.primary as [number, number, number],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 10
    },
    styles: {
      fontSize: 9,
      cellPadding: 3
    },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 35, halign: 'right' },
      3: { cellWidth: 35, halign: 'right' }
    },
    margin: { left: 20, right: 20 }
  })

  yPos = (doc as any).lastAutoTable.finalY + 10

  // Total box
  doc.setFillColor(COLORS.primary[0], COLORS.primary[1], COLORS.primary[2])
  doc.roundedRect(pageWidth - 90, yPos, 70, 20, 2, 2, 'F')
  
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('TOTAL PRICE', pageWidth - 55, yPos + 7, { align: 'center' })
  
  doc.setFontSize(16)
  doc.text(`${itinerary.currency} ${itinerary.total_cost.toFixed(2)}`, pageWidth - 55, yPos + 15, { align: 'center' })

  // Per person
  const perPerson = itinerary.total_cost / (itinerary.num_adults + itinerary.num_children)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(COLORS.textLight[0], COLORS.textLight[1], COLORS.textLight[2])
  doc.text(`Per person: ${itinerary.currency} ${perPerson.toFixed(2)}`, pageWidth - 55, yPos + 28, { align: 'center' })

  yPos += 40

  // ============================================
  // TERMS & CONDITIONS
  // ============================================
  
  checkPageBreak(80)
  
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2])
  doc.text('PAYMENT & CANCELLATION', 20, yPos)
  yPos += 8

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(COLORS.textLight[0], COLORS.textLight[1], COLORS.textLight[2])
  
  const terms = [
    'Payment Terms:',
    '• 30% deposit required to confirm booking',
    '• Balance due 7 days before travel date',
    '• Accepted: Bank transfer, PayPal, Credit card',
    '',
    'Cancellation Policy:',
    '• 15+ days before travel: Full refund minus 10% admin fee',
    '• 7-14 days before travel: 50% refund',
    '• Less than 7 days: No refund',
    '',
    'Exclusions:',
    '• Personal expenses and optional activities',
    '• Travel insurance (highly recommended)',
    '• Gratuities for guide and driver (optional but appreciated)'
  ]

  terms.forEach(line => {
    checkPageBreak(5)
    doc.text(line, 20, yPos)
    yPos += 4
  })

  yPos += 10

  // ============================================
  // FOOTER / CONTACT
  // ============================================
  
  checkPageBreak(30)
  
  doc.setDrawColor(COLORS.border[0], COLORS.border[1], COLORS.border[2])
  doc.setLineWidth(0.5)
  doc.line(20, yPos, pageWidth - 20, yPos)
  yPos += 8

  doc.setFillColor(248, 250, 252)
  doc.roundedRect(20, yPos, pageWidth - 40, 25, 2, 2, 'F')

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(COLORS.primary[0], COLORS.primary[1], COLORS.primary[2])
  doc.text('TRAVEL TO EGYPT', pageWidth / 2, yPos + 6, { align: 'center' })
  
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(COLORS.textLight[0], COLORS.textLight[1], COLORS.textLight[2])
  doc.text('Email: info@travel2egypt.org', pageWidth / 2, yPos + 11, { align: 'center' })
  doc.text('Website: www.travel2egypt.org', pageWidth / 2, yPos + 16, { align: 'center' })
  doc.text('We look forward to showing you the wonders of Egypt!', pageWidth / 2, yPos + 21, { align: 'center' })

  return doc
}