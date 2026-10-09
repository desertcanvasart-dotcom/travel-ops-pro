// jsPDF + autotable (~300 KB) are loaded when someone actually exports a PDF,
// not with every finance page that offers the button (nine of them imported
// this module, and so the PDF engine, just to render).
import { format } from 'date-fns'
import { currencyDecimals } from './currency-totals'

// ============================================
// TYPES
// ============================================

export interface ExportColumn {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
  format?: (value: unknown) => string
  /**
   * An amount: printed with ITS ROW's currency decimals (row.currency) —
   * ¥15,431, not "15431.00" — and without symbols, so a spreadsheet still
   * reads it as a number. Rows with no currency get two decimals.
   */
  money?: boolean
}

/** One cell's text, as the column formats it (lib/finance-export). */
export function cellText(col: ExportColumn, row: Record<string, unknown>): string {
  const value = row[col.key]
  if (col.money && typeof value === 'number' && Number.isFinite(value)) {
    const code = typeof row.currency === 'string' && row.currency.trim() ? row.currency.trim().toUpperCase() : ''
    const decimals = code ? currencyDecimals(code) : 2
    return value.toFixed(decimals)
  }
  return col.format ? col.format(value) : String(value ?? '')
}

export interface ExportSummaryItem {
  label: string
  value: string
}

export interface PDFExportOptions {
  /** The organisation's name for the header; omitted = none (never a platform brand). */
  brand?: string
  title: string
  subtitle?: string
  summary?: ExportSummaryItem[]
  data: Record<string, unknown>[]
  columns: ExportColumn[]
  filename: string
  orientation?: 'portrait' | 'landscape'
}

// ============================================
// CSV EXPORT
// ============================================

// A cell whose text begins with = + - @ (or a leading tab/CR) is executed as a
// FORMULA by Excel and Google Sheets when the CSV is opened — CSV injection.
// Quote-wrapping does not stop it; the spreadsheet still evaluates "=cmd". Prefix
// such a value with a single quote so it is shown literally and never run.
function csvSafeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

/**
 * The columns, plus the row's currency when the rows carry one and no column
 * shows it. The exports listed bare amounts — 1,200 of what? — on pages where
 * each invoice, payment or expense has its own currency.
 */
export function withCurrencyColumn(data: Record<string, unknown>[], columns: ExportColumn[]): ExportColumn[] {
  if (columns.some(c => c.key === 'currency')) return columns
  const hasCurrency = data.some(r => typeof r.currency === 'string' && r.currency.trim() !== '')
  return hasCurrency ? [...columns, { key: 'currency', label: 'Currency' }] : columns
}

export function exportFinanceCSV(
  data: Record<string, unknown>[],
  columnsIn: ExportColumn[],
  filename: string
) {
  if (data.length === 0) return
  const columns = withCurrencyColumn(data, columnsIn)

  const headers = columns.map(c => c.label)
  const rows = data.map(row =>
    columns.map(col => {
      const formatted = cellText(col, row)
      // Neutralise formula triggers, THEN escape quotes and wrap.
      const safe = csvSafeCell(String(formatted))
      return `"${safe.replace(/"/g, '""')}"`
    })
  )

  const csvContent = [
    headers.map(h => `"${h}"`).join(','),
    ...rows.map(row => row.join(','))
  ].join('\n')

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}-${format(new Date(), 'yyyy-MM-dd')}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ============================================
// PDF EXPORT
// ============================================

export async function exportFinancePDF(options: PDFExportOptions): Promise<void> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  const { brand, title, subtitle, summary, data, filename, orientation = 'landscape' } = options
  const columns = withCurrencyColumn(data, options.columns)

  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' })
  // Noto Sans JP, as on every other document: client and supplier names in
  // kanji came out as mojibake in Helvetica. Falls back to Helvetica if the
  // font cannot be fetched.
  let FONT = 'helvetica'
  const { japaneseFontData } = await import('./pdf-fonts')
  const fontData = await japaneseFontData()
  if (fontData) {
    for (const f of fontData.files) {
      doc.addFileToVFS(f.name, f.base64)
      doc.addFont(f.name, fontData.family, f.weight)
    }
    FONT = fontData.family
    doc.setFont(FONT, 'normal')
  }
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 15
  let yPos = margin

  // ── Header ──
  doc.setFontSize(8)
  doc.setTextColor(100, 124, 71) // #647C47
  // The organisation's name when the page gives it — it printed "AUTOURA",
  // the platform, on every organisation's finance reports.
  if (brand) doc.text(brand, margin, yPos)
  doc.setTextColor(150)
  doc.text(`Generated: ${format(new Date(), 'MMMM d, yyyy HH:mm')}`, pageWidth - margin, yPos, { align: 'right' })

  yPos += 10

  // ── Title ──
  doc.setFontSize(18)
  doc.setTextColor(30)
  doc.text(title, margin, yPos)
  yPos += 7

  if (subtitle) {
    doc.setFontSize(10)
    doc.setTextColor(120)
    doc.text(subtitle, margin, yPos)
    yPos += 7
  }

  // ── Summary Cards ──
  if (summary && summary.length > 0) {
    yPos += 3
    const cardWidth = (pageWidth - margin * 2 - (summary.length - 1) * 4) / summary.length
    const cardHeight = 18

    summary.forEach((item, i) => {
      const x = margin + i * (cardWidth + 4)

      // Card background
      doc.setFillColor(245, 245, 240)
      doc.roundedRect(x, yPos, cardWidth, cardHeight, 2, 2, 'F')

      // Label
      doc.setFontSize(7)
      doc.setTextColor(130)
      doc.text(item.label, x + 4, yPos + 6)

      // Value
      doc.setFontSize(12)
      doc.setTextColor(30)
      doc.text(item.value, x + 4, yPos + 14)
    })

    yPos += cardHeight + 6
  }

  // ── Separator line ──
  yPos += 2
  doc.setDrawColor(220)
  doc.setLineWidth(0.3)
  doc.line(margin, yPos, pageWidth - margin, yPos)
  yPos += 5

  // ── Data Table ──
  if (data.length > 0) {
    const tableColumns = columns.map(col => ({
      header: col.label,
      dataKey: col.key,
    }))

    const tableRows = data.map(row => {
      const mapped: Record<string, string> = {}
      columns.forEach(col => {
        mapped[col.key] = cellText(col, row)
      })
      return mapped
    })

    const columnStyles: Record<string, { halign: 'left' | 'right' | 'center' }> = {}
    columns.forEach(col => {
      if (col.align) {
        columnStyles[col.key] = { halign: col.align }
      }
    })

    autoTable(doc, {
      startY: yPos,
      columns: tableColumns,
      body: tableRows,
      margin: { left: margin, right: margin },
      styles: { font: FONT },
      headStyles: {
        fillColor: [100, 124, 71],
        textColor: [255, 255, 255],
        fontSize: 7,
        fontStyle: 'bold',
        cellPadding: 3,
      },
      bodyStyles: {
        fontSize: 7,
        cellPadding: 2.5,
        textColor: [50, 50, 50],
      },
      alternateRowStyles: {
        fillColor: [250, 250, 247],
      },
      columnStyles,
      didDrawPage: () => {
        // Footer on every page
        const pageHeight = doc.internal.pageSize.getHeight()
        doc.setFontSize(7)
        doc.setTextColor(180)
        doc.text(
          brand ? `${title} — ${brand}` : title,
          margin,
          pageHeight - 8
        )
        doc.text(
          `Page ${doc.getCurrentPageInfo().pageNumber}`,
          pageWidth - margin,
          pageHeight - 8,
          { align: 'right' }
        )
      },
    })
  } else {
    doc.setFontSize(10)
    doc.setTextColor(150)
    doc.text('No data available for this report.', margin, yPos + 10)
  }

  // ── Save ──
  doc.save(`${filename}-${format(new Date(), 'yyyy-MM-dd')}.pdf`)
}
