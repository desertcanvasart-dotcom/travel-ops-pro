import { jsPDF } from 'jspdf'
import { formatMoney } from '@/lib/currency-totals'

interface ReceiptData {
  receiptNumber: string
  invoiceNumber: string
  clientName: string
  clientEmail: string
  paymentDate: string
  paymentMethod: string
  amount: number
  currency: string
  transactionRef: string | null
  notes: string | null
}

interface Invoice {
  invoice_number: string
  client_name: string
  total_amount: number
  currency: string
}

/**
 * The operator's own name and footer line.
 *
 * Runs in the BROWSER (jsPDF), where process.env holds only NEXT_PUBLIC_*
 * variables, so it cannot look the operator up. The caller passes it — the
 * same way the invoice letterhead already works. Blank prints nothing, which
 * is right: a receipt naming the wrong company is worse than one naming none.
 */
export interface ReceiptBrand {
  name?: string
  footer?: string
}

export function generateReceiptPDF(
  receipt: ReceiptData,
  invoice: Invoice,
  brand: ReceiptBrand = {},
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 20
  let y = margin

  // Header
  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(100, 124, 71)
  if (brand.name) doc.text(brand.name, margin, y + 8)

  doc.setFontSize(20)
  doc.setTextColor(40, 40, 40)
  doc.text('PAYMENT RECEIPT', pageWidth - margin, y + 8, { align: 'right' })

  y += 25

  // Receipt info
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text(`Receipt #: ${receipt.receiptNumber}`, margin, y)
  doc.text(`Date: ${new Date(receipt.paymentDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, pageWidth - margin, y, { align: 'right' })

  y += 15

  // Divider
  doc.setDrawColor(100, 124, 71)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageWidth - margin, y)

  y += 15

  // Client info
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(40, 40, 40)
  doc.text('Received From:', margin, y)

  y += 8
  doc.setFont('helvetica', 'normal')
  doc.text(receipt.clientName, margin, y)
  
  if (receipt.clientEmail) {
    y += 6
    doc.setFontSize(10)
    doc.setTextColor(100, 100, 100)
    doc.text(receipt.clientEmail, margin, y)
  }

  y += 20

  // Payment details box
  doc.setFillColor(248, 250, 245)
  doc.roundedRect(margin, y, pageWidth - 2 * margin, 50, 3, 3, 'F')

  y += 10
  doc.setFontSize(11)
  doc.setTextColor(40, 40, 40)
  
  doc.setFont('helvetica', 'bold')
  doc.text('Payment Details', margin + 10, y)

  y += 10
  doc.setFont('helvetica', 'normal')
  doc.text(`Invoice: ${receipt.invoiceNumber}`, margin + 10, y)
  
  y += 7
  const methodLabel = receipt.paymentMethod.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
  doc.text(`Payment Method: ${methodLabel}`, margin + 10, y)

  if (receipt.transactionRef) {
    y += 7
    doc.text(`Transaction Ref: ${receipt.transactionRef}`, margin + 10, y)
  }

  y += 25

  // Amount
  
  doc.setFillColor(100, 124, 71)
  doc.roundedRect(margin, y, pageWidth - 2 * margin, 25, 3, 3, 'F')

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('AMOUNT RECEIVED', margin + 10, y + 10)
  
  doc.setFontSize(18)
  // A receipt states what was actually received, so the amount must be
  // printed in that currency's own units — ¥370,873, never ¥370873.00.
  doc.text(formatMoney(Number(receipt.amount), receipt.currency), pageWidth - margin - 10, y + 15, { align: 'right' })

  y += 40

  // Notes
  if (receipt.notes) {
    doc.setFontSize(10)
    doc.setTextColor(100, 100, 100)
    doc.setFont('helvetica', 'normal')
    doc.text('Notes:', margin, y)
    y += 6
    doc.text(receipt.notes, margin, y)
    y += 15
  }

  // Thank you
  y += 10
  doc.setFontSize(11)
  doc.setTextColor(100, 124, 71)
  doc.setFont('helvetica', 'bold')
  doc.text('Thank you for your payment!', pageWidth / 2, y, { align: 'center' })

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 15
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.3)
  doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5)

  doc.setFontSize(8)
  doc.setTextColor(150, 150, 150)
  doc.setFont('helvetica', 'normal')
  if (brand.footer) doc.text(brand.footer, pageWidth / 2, footerY, { align: 'center' })

  return doc
}

export function downloadReceiptPDF(receipt: ReceiptData, invoice: Invoice, brand: ReceiptBrand = {}) {
  const doc = generateReceiptPDF(receipt, invoice, brand)
  doc.save(`Receipt-${receipt.receiptNumber}.pdf`)
}