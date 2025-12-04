import jsPDF from 'jspdf'

interface LineItem {
  description: string
  quantity: number
  unit_price: number
  amount: number
}

interface Invoice {
  id: string
  invoice_number: string
  client_name: string
  client_email: string
  line_items: LineItem[]
  subtotal: number
  tax_rate: number
  tax_amount: number
  discount_amount: number
  total_amount: number
  currency: string
  amount_paid: number
  balance_due: number
  status: string
  issue_date: string
  due_date: string
  notes: string | null
  payment_terms: string | null
  payment_instructions: string | null
}

interface CompanyInfo {
  name: string
  address: string
  city: string
  country: string
  email: string
  phone: string
  website?: string
  taxId?: string
}

// Default company info - customize this for Travel2Egypt
const DEFAULT_COMPANY: CompanyInfo = {
  name: 'Travel2Egypt',
  address: '123 Pyramids Road',
  city: 'Cairo',
  country: 'Egypt',
  email: 'info@travel2egypt.com',
  phone: '+20 123 456 7890',
  website: 'www.travel2egypt.com'
}

const getCurrencySymbol = (currency: string): string => {
  const symbols: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', EGP: 'E£' }
  return symbols[currency] || currency
}

const formatCurrency = (amount: number, currency: string): string => {
  return `${getCurrencySymbol(currency)}${Number(amount).toFixed(2)}`
}

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}

export function generateInvoicePDF(
  invoice: Invoice, 
  company: CompanyInfo = DEFAULT_COMPANY
): jsPDF {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 20
  const contentWidth = pageWidth - (margin * 2)
  let y = margin

  // Colors
  const primaryColor: [number, number, number] = [100, 124, 71] // #647C47 - Olive green
  const darkGray: [number, number, number] = [55, 65, 81]
  const mediumGray: [number, number, number] = [107, 114, 128]
  const lightGray: [number, number, number] = [243, 244, 246]

  // ============================================
  // HEADER SECTION
  // ============================================
  
  // Company Name (left)
  doc.setFontSize(24)
  doc.setTextColor(...primaryColor)
  doc.setFont('helvetica', 'bold')
  doc.text(company.name, margin, y)

  // INVOICE label (right)
  doc.setFontSize(28)
  doc.setTextColor(...darkGray)
  doc.text('INVOICE', pageWidth - margin, y, { align: 'right' })

  y += 8

  // Company details
  doc.setFontSize(9)
  doc.setTextColor(...mediumGray)
  doc.setFont('helvetica', 'normal')
  doc.text(company.address, margin, y)
  y += 4
  doc.text(`${company.city}, ${company.country}`, margin, y)
  y += 4
  doc.text(company.email, margin, y)
  y += 4
  doc.text(company.phone, margin, y)
  if (company.website) {
    y += 4
    doc.text(company.website, margin, y)
  }

  y += 15

  // Divider line
  doc.setDrawColor(...primaryColor)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageWidth - margin, y)

  y += 15

  // ============================================
  // INVOICE INFO & CLIENT SECTION
  // ============================================

  const leftColX = margin
  const rightColX = pageWidth / 2 + 10

  // Invoice details (left)
  doc.setFontSize(10)
  doc.setTextColor(...mediumGray)
  doc.setFont('helvetica', 'bold')
  doc.text('Invoice Number:', leftColX, y)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...darkGray)
  doc.text(invoice.invoice_number, leftColX + 35, y)

  // Bill To (right)
  doc.setTextColor(...mediumGray)
  doc.setFont('helvetica', 'bold')
  doc.text('Bill To:', rightColX, y)

  y += 6

  doc.setTextColor(...mediumGray)
  doc.setFont('helvetica', 'bold')
  doc.text('Issue Date:', leftColX, y)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...darkGray)
  doc.text(formatDate(invoice.issue_date), leftColX + 35, y)

  // Client name
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...darkGray)
  doc.text(invoice.client_name, rightColX, y)

  y += 6

  doc.setTextColor(...mediumGray)
  doc.setFont('helvetica', 'bold')
  doc.text('Due Date:', leftColX, y)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...darkGray)
  doc.text(invoice.due_date ? formatDate(invoice.due_date) : '-', leftColX + 35, y)

  // Client email
  if (invoice.client_email) {
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...mediumGray)
    doc.text(invoice.client_email, rightColX, y)
  }

  y += 6

  // Status badge
  doc.setTextColor(...mediumGray)
  doc.setFont('helvetica', 'bold')
  doc.text('Status:', leftColX, y)
  
  const statusColors: Record<string, [number, number, number]> = {
    draft: [107, 114, 128],
    sent: [59, 130, 246],
    viewed: [147, 51, 234],
    partial: [249, 115, 22],
    paid: [34, 197, 94],
    overdue: [239, 68, 68],
    cancelled: [107, 114, 128]
  }
  
  const statusColor = statusColors[invoice.status] || statusColors.draft
  doc.setTextColor(...statusColor)
  doc.setFont('helvetica', 'bold')
  doc.text(invoice.status.toUpperCase(), leftColX + 35, y)

  y += 20

  // ============================================
  // LINE ITEMS TABLE
  // ============================================

  // Table header background
  doc.setFillColor(...primaryColor)
  doc.rect(margin, y, contentWidth, 10, 'F')

  // Table header text
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  
  const colDescription = margin + 3
  const colQty = margin + contentWidth * 0.55
  const colUnitPrice = margin + contentWidth * 0.70
  const colAmount = margin + contentWidth * 0.88

  doc.text('Description', colDescription, y + 7)
  doc.text('Qty', colQty, y + 7, { align: 'center' })
  doc.text('Unit Price', colUnitPrice, y + 7, { align: 'right' })
  doc.text('Amount', colAmount, y + 7, { align: 'right' })

  y += 10

  // Table rows
  doc.setTextColor(...darkGray)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)

  const lineItems = invoice.line_items || []
  
  lineItems.forEach((item, index) => {
    // Alternate row background
    if (index % 2 === 0) {
      doc.setFillColor(...lightGray)
      doc.rect(margin, y, contentWidth, 10, 'F')
    }

    // Truncate long descriptions
    let description = item.description
    if (description.length > 50) {
      description = description.substring(0, 47) + '...'
    }

    doc.setTextColor(...darkGray)
    doc.text(description, colDescription, y + 7)
    doc.text(String(item.quantity), colQty, y + 7, { align: 'center' })
    doc.text(formatCurrency(item.unit_price, invoice.currency), colUnitPrice, y + 7, { align: 'right' })
    doc.setFont('helvetica', 'bold')
    doc.text(formatCurrency(item.amount, invoice.currency), colAmount, y + 7, { align: 'right' })
    doc.setFont('helvetica', 'normal')

    y += 10
  })

  // Table border
  doc.setDrawColor(...mediumGray)
  doc.setLineWidth(0.1)
  doc.rect(margin, y - (lineItems.length * 10) - 10, contentWidth, (lineItems.length * 10) + 10)

  y += 10

  // ============================================
  // TOTALS SECTION
  // ============================================

  const totalsX = margin + contentWidth * 0.55
  const totalsValueX = margin + contentWidth - 3

  // Subtotal
  doc.setFontSize(10)
  doc.setTextColor(...mediumGray)
  doc.setFont('helvetica', 'normal')
  doc.text('Subtotal:', totalsX, y)
  doc.setTextColor(...darkGray)
  doc.text(formatCurrency(invoice.subtotal, invoice.currency), totalsValueX, y, { align: 'right' })
  y += 6

  // Tax (if applicable)
  if (Number(invoice.tax_amount) > 0) {
    doc.setTextColor(...mediumGray)
    doc.text(`Tax (${invoice.tax_rate}%):`, totalsX, y)
    doc.setTextColor(...darkGray)
    doc.text(formatCurrency(invoice.tax_amount, invoice.currency), totalsValueX, y, { align: 'right' })
    y += 6
  }

  // Discount (if applicable)
  if (Number(invoice.discount_amount) > 0) {
    doc.setTextColor(...mediumGray)
    doc.text('Discount:', totalsX, y)
    doc.setTextColor(34, 197, 94) // Green
    doc.text(`-${formatCurrency(invoice.discount_amount, invoice.currency)}`, totalsValueX, y, { align: 'right' })
    y += 6
  }

  // Total line
  doc.setDrawColor(...primaryColor)
  doc.setLineWidth(0.5)
  doc.line(totalsX, y, pageWidth - margin, y)
  y += 8

  // Total
  doc.setFontSize(12)
  doc.setTextColor(...darkGray)
  doc.setFont('helvetica', 'bold')
  doc.text('Total:', totalsX, y)
  doc.setTextColor(...primaryColor)
  doc.text(formatCurrency(invoice.total_amount, invoice.currency), totalsValueX, y, { align: 'right' })
  y += 10

  // Amount Paid
  if (Number(invoice.amount_paid) > 0) {
    doc.setFontSize(10)
    doc.setTextColor(...mediumGray)
    doc.setFont('helvetica', 'normal')
    doc.text('Amount Paid:', totalsX, y)
    doc.setTextColor(34, 197, 94)
    doc.text(formatCurrency(invoice.amount_paid, invoice.currency), totalsValueX, y, { align: 'right' })
    y += 6
  }

  // Balance Due
  if (Number(invoice.balance_due) > 0) {
    doc.setFontSize(11)
    doc.setTextColor(...darkGray)
    doc.setFont('helvetica', 'bold')
    doc.text('Balance Due:', totalsX, y)
    doc.setTextColor(239, 68, 68) // Red
    doc.text(formatCurrency(invoice.balance_due, invoice.currency), totalsValueX, y, { align: 'right' })
    y += 6
  } else if (invoice.status === 'paid') {
    doc.setFontSize(11)
    doc.setTextColor(34, 197, 94) // Green
    doc.setFont('helvetica', 'bold')
    doc.text('PAID IN FULL', totalsValueX, y, { align: 'right' })
    y += 6
  }

  y += 15

  // ============================================
  // PAYMENT TERMS & NOTES
  // ============================================

  if (invoice.payment_terms || invoice.payment_instructions || invoice.notes) {
    // Divider
    doc.setDrawColor(...lightGray)
    doc.setLineWidth(0.5)
    doc.line(margin, y, pageWidth - margin, y)
    y += 10

    if (invoice.payment_terms) {
      doc.setFontSize(9)
      doc.setTextColor(...primaryColor)
      doc.setFont('helvetica', 'bold')
      doc.text('Payment Terms', margin, y)
      y += 5
      doc.setTextColor(...mediumGray)
      doc.setFont('helvetica', 'normal')
      const termsLines = doc.splitTextToSize(invoice.payment_terms, contentWidth)
      doc.text(termsLines, margin, y)
      y += termsLines.length * 4 + 8
    }

    if (invoice.payment_instructions) {
      doc.setFontSize(9)
      doc.setTextColor(...primaryColor)
      doc.setFont('helvetica', 'bold')
      doc.text('Payment Instructions', margin, y)
      y += 5
      doc.setTextColor(...mediumGray)
      doc.setFont('helvetica', 'normal')
      const instructionLines = doc.splitTextToSize(invoice.payment_instructions, contentWidth)
      doc.text(instructionLines, margin, y)
      y += instructionLines.length * 4 + 8
    }

    if (invoice.notes) {
      doc.setFontSize(9)
      doc.setTextColor(...primaryColor)
      doc.setFont('helvetica', 'bold')
      doc.text('Notes', margin, y)
      y += 5
      doc.setTextColor(...mediumGray)
      doc.setFont('helvetica', 'normal')
      const notesLines = doc.splitTextToSize(invoice.notes, contentWidth)
      doc.text(notesLines, margin, y)
      y += notesLines.length * 4 + 8
    }
  }

  // ============================================
  // FOOTER
  // ============================================

  const footerY = doc.internal.pageSize.getHeight() - 15
  
  doc.setFontSize(8)
  doc.setTextColor(...mediumGray)
  doc.setFont('helvetica', 'normal')
  doc.text('Thank you for your business!', pageWidth / 2, footerY, { align: 'center' })
  doc.text(
    `Generated on ${formatDate(new Date().toISOString())}`,
    pageWidth / 2,
    footerY + 4,
    { align: 'center' }
  )

  return doc
}

export function downloadInvoicePDF(invoice: Invoice, company?: CompanyInfo): void {
  const pdf = generateInvoicePDF(invoice, company)
  const filename = `${invoice.invoice_number}_${invoice.client_name.replace(/\s+/g, '_')}.pdf`
  pdf.save(filename)
}