// ============================================
// CONTRACT PDF GENERATOR (browser and server)
// ============================================
// Prints the contract as the page shows it (lib/contract-document): the
// payment terms, inclusions, exclusions, cancellation terms, force majeure,
// terms and conditions and special notes the operator set, in the page's
// language. It printed a fixed "10% deposit… upon arrival", its own lists, no
// cancellation terms and no conditions.
//
// jsPDF with Noto Sans JP when the caller supplies it (lib/pdf-fonts.ts in the
// browser, lib/pdf-fonts-node.ts on the server). This was pdf-lib with its
// standard Helvetica, which cannot encode anything outside Latin-1 and threw
// on a contract translated into Japanese or Russian.

import { jsPDF } from 'jspdf'
import { contractPrice } from '@/lib/contract-facts'
import { ENGLISH_CONTRACT_LABELS, type ContractDocument } from '@/lib/contract-document'

interface ContractData {
  /**
   * The operator's own identity, supplied by the caller.
   *
   * Not read from process.env here: app/documents/contract/[id]/page.tsx calls
   * this in the BROWSER, where only NEXT_PUBLIC_* variables exist. Blank fields
   * print nothing — a contract naming the wrong company is worse than one
   * naming none.
   */
  provider?: { name?: string; website?: string; email?: string; location?: string }

  contractNumber: string
  contractDate: string
  clientName: string
  clientEmail?: string
  numTravelers: number
  tourName: string
  startDate: string
  endDate: string
  destinations: string
  /** null = no price yet: prints "To be confirmed". */
  totalCost: number | null
  currency: string
  /** The contract as the page shows it; each part left out is left out. */
  document?: ContractDocument
}

export interface ContractPdfOptions {
  /** A typeface to embed (Noto Sans JP), passed as data — see
   *  InvoicePdfOptions. Without it the built-in helvetica is Latin-only. */
  font?: {
    family: string
    files: Array<{ name: string; base64: string; weight: string }>
  } | null
}

const BRAND: [number, number, number] = [100, 124, 71]

export async function generateContractPDF(data: ContractData, options: ContractPdfOptions = {}): Promise<Uint8Array> {
  const doc = data.document ?? {}
  const L = { ...ENGLISH_CONTRACT_LABELS, ...doc.labels }

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let FONT = 'helvetica'
  if (options.font) {
    for (const file of options.font.files) {
      pdf.addFileToVFS(file.name, file.base64)
      pdf.addFont(file.name, options.font.family, file.weight)
    }
    FONT = options.font.family
  }

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 18
  const contentWidth = pageWidth - margin * 2
  const bottom = pageHeight - 18
  let y = 22

  const ensureSpace = (needed: number) => {
    if (y + needed > bottom) {
      pdf.addPage()
      y = 20
    }
  }
  const fmtDate = (d: string, opts?: Intl.DateTimeFormatOptions) => {
    const t = new Date(d)
    return Number.isNaN(t.getTime()) ? '' : t.toLocaleDateString('en-GB', opts)
  }

  const heading = (text: string) => {
    ensureSpace(16)
    pdf.setFont(FONT, 'bold')
    pdf.setFontSize(11)
    pdf.setTextColor(...BRAND)
    pdf.text(text.toUpperCase(), margin, y)
    pdf.setDrawColor(230, 230, 230)
    pdf.setLineWidth(0.3)
    pdf.line(margin, y + 2, pageWidth - margin, y + 2)
    y += 8
  }
  const line = (label: string, value: string, muted = false) => {
    if (!value) return
    const wrapped = pdf.splitTextToSize(value, contentWidth - 42) as string[]
    ensureSpace(wrapped.length * 5 + 1)
    pdf.setFont(FONT, 'bold')
    pdf.setFontSize(9.5)
    pdf.setTextColor(110, 110, 110)
    pdf.text(label, margin, y)
    pdf.setFont(FONT, 'normal')
    const shade = muted ? 100 : 30
    pdf.setTextColor(shade, shade, shade)
    pdf.text(wrapped, margin + 42, y)
    y += wrapped.length * 5 + 1
  }
  const paragraph = (text: string) => {
    pdf.setFont(FONT, 'normal')
    pdf.setFontSize(9.5)
    pdf.setTextColor(30, 30, 30)
    for (const para of text.split('\n').filter(p => p.trim())) {
      const wrapped = pdf.splitTextToSize(para, contentWidth) as string[]
      ensureSpace(wrapped.length * 5)
      pdf.text(wrapped, margin, y)
      y += wrapped.length * 5 + 1
    }
    y += 4
  }
  const bullets = (items: string[]) => {
    pdf.setFont(FONT, 'normal')
    pdf.setFontSize(9.5)
    pdf.setTextColor(30, 30, 30)
    for (const item of items) {
      const wrapped = pdf.splitTextToSize(item, contentWidth - 6) as string[]
      ensureSpace(wrapped.length * 5)
      pdf.text('•', margin + 1, y)
      pdf.text(wrapped, margin + 6, y)
      y += wrapped.length * 5
    }
    y += 5
  }

  // Title
  pdf.setFont(FONT, 'bold')
  pdf.setFontSize(18)
  pdf.setTextColor(...BRAND)
  pdf.text(L.title, pageWidth / 2, y, { align: 'center' })
  y += 8
  pdf.setFont(FONT, 'normal')
  pdf.setFontSize(9.5)
  pdf.setTextColor(90, 90, 90)
  pdf.text(`${data.contractNumber}  ·  ${fmtDate(data.contractDate, { day: 'numeric', month: 'long', year: 'numeric' })}`, pageWidth / 2, y, { align: 'center' })
  y += 12

  // Parties
  heading(L.parties)
  line(L.serviceProvider, data.provider?.name || '')
  line('', [data.provider?.location, data.provider?.website].filter(Boolean).join(' · '), true)
  y += 2
  line(L.client, data.clientName)
  if (data.clientEmail) line('', data.clientEmail, true)
  line(L.travellers, String(data.numTravelers || ''))
  y += 4

  // Tour details
  heading(L.tourDetails)
  line(L.tour, doc.tourName?.trim() || data.tourName)
  line(L.dates, [fmtDate(data.startDate), fmtDate(data.endDate)].filter(Boolean).join(' – '))
  line(L.destinations, doc.destinations?.trim() || data.destinations)
  y += 4

  // Financial terms
  heading(L.financialTerms)
  const total = doc.totalCost !== undefined ? doc.totalCost : data.totalCost
  ensureSpace(10)
  pdf.setFont(FONT, 'bold')
  pdf.setFontSize(9.5)
  pdf.setTextColor(110, 110, 110)
  pdf.text(L.totalPrice, margin, y)
  pdf.setFontSize(13)
  pdf.setTextColor(...BRAND)
  pdf.text(contractPrice(total, data.currency), margin + 42, y + 0.5)
  y += 7
  if (doc.paymentTerms?.trim()) line(L.paymentTerms, doc.paymentTerms)
  y += 4

  if (doc.inclusions?.length) { heading(L.inclusions); bullets(doc.inclusions) }
  if (doc.exclusions?.length) { heading(L.exclusions); bullets(doc.exclusions) }

  const cancellation = (doc.cancellationLines ?? []).filter(l => l.trim())
  if (cancellation.length) {
    heading(L.cancellationPolicy)
    if (doc.cancellationIntro?.trim()) paragraph(doc.cancellationIntro)
    bullets(cancellation)
  }
  if (doc.flightCancellation?.trim()) { heading(L.flightCancellation); paragraph(doc.flightCancellation) }
  if (doc.noShowPolicy?.trim()) { heading(L.noShowPolicy); paragraph(doc.noShowPolicy) }
  if (doc.forceMajeure?.trim()) { heading(L.forceMajeure); paragraph(doc.forceMajeure) }

  if (doc.termsSections?.length) {
    heading(L.termsAndConditions)
    doc.termsSections.forEach((section, i) => {
      ensureSpace(12)
      pdf.setFont(FONT, 'bold')
      pdf.setFontSize(9.5)
      pdf.setTextColor(30, 30, 30)
      pdf.text(`${i + 1}. ${section.title}`, margin, y)
      y += 5
      if (section.text.length > 1) bullets(section.text)
      else paragraph(section.text[0])
    })
  }

  if (doc.specialNotes?.trim()) { heading(L.specialNotes); paragraph(doc.specialNotes) }

  // Signatures
  heading(L.signatures)
  ensureSpace(30)
  y += 12
  const sigWidth = (contentWidth - 16) / 2
  pdf.setDrawColor(170, 170, 170)
  pdf.line(margin, y, margin + sigWidth, y)
  pdf.line(pageWidth - margin - sigWidth, y, pageWidth - margin, y)
  pdf.setFont(FONT, 'normal')
  pdf.setFontSize(8.5)
  pdf.setTextColor(110, 110, 110)
  pdf.text(data.provider?.name ? `${L.serviceProvider} — ${data.provider.name}` : L.serviceProvider, margin, y + 5)
  pdf.text(L.client, pageWidth - margin - sigWidth, y + 5)
  pdf.text(`${L.date}: ______________`, margin, y + 11)
  pdf.text(`${L.date}: ______________`, pageWidth - margin - sigWidth, y + 11)
  y += 20

  if (doc.governingNote?.trim()) {
    const note = pdf.splitTextToSize(doc.governingNote, contentWidth) as string[]
    ensureSpace(note.length * 4.5)
    pdf.setFontSize(8.5)
    pdf.text(note, margin, y)
  }

  // Footer on every page
  const footer = [data.provider?.name, data.provider?.website, data.provider?.email].filter(Boolean).join(' | ')
  const pages = pdf.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p)
    pdf.setFont(FONT, 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(140, 140, 140)
    if (footer) pdf.text(footer, margin, pageHeight - 10)
    pdf.text(`${data.contractNumber} · ${p}/${pages}`, pageWidth - margin, pageHeight - 10, { align: 'right' })
  }

  return new Uint8Array(pdf.output('arraybuffer'))
}
