// ============================================
// Guest survey — per-booking PDF with QR
// ============================================
// Stamps a booking's /survey/<token> QR onto the existing ATS questionnaire
// design (public/survey/ats-questionnaire-template.pdf), so the printed sheet a
// guide hands out opens that guest's own survey. The template already carries
// the Japanese caption ("オンラインでのご回答も受け付けております / QR コード貼付欄"),
// so we add only the QR image and the plain-text URL — no CJK font to embed.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import QRCode from 'qrcode'

/** Draw the survey QR + URL onto the last page's blank lower area and return the
 *  new PDF bytes. `templateBytes` is the questionnaire template. */
export async function stampSurveyQr(templateBytes: Uint8Array | ArrayBuffer, surveyUrl: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(templateBytes)
  const pages = pdf.getPages()
  const page = pages[pages.length - 1]
  const width = page.getWidth()

  // QR as PNG (high error correction so it still scans after printing).
  const dataUrl = await QRCode.toDataURL(surveyUrl, { errorCorrectionLevel: 'M', margin: 1, width: 360 })
  const pngBytes = Buffer.from(dataUrl.split(',')[1], 'base64')
  const png = await pdf.embedPng(pngBytes)

  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const size = 132
  const x = (width - size) / 2
  const y = 150 // from the bottom — the lower half of the last page is blank

  page.drawImage(png, { x, y, width: size, height: size })

  // The URL in plain text under the QR, centred (ASCII — Helvetica is fine).
  const urlSize = 9
  const urlWidth = font.widthOfTextAtSize(surveyUrl, urlSize)
  page.drawText(surveyUrl, {
    x: (width - urlWidth) / 2,
    y: y - 16,
    size: urlSize,
    font,
    color: rgb(0.35, 0.35, 0.35),
  })

  return pdf.save()
}
