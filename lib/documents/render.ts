// ============================================
// HTML → PDF
// ============================================
// The I/O half of the document system. Templates produce HTML; this turns one
// into a PDF. Kept separate so a layout can be verified as a string in a unit
// test, and so a template never has a browser as a dependency.
//
// Chromium is launched per render and always closed in a finally — a leaked
// browser process survives the request and the next few will exhaust the
// container's memory rather than failing loudly.

import puppeteer from 'puppeteer'
import type { DocumentPage } from './types'

export async function renderHtmlToPdf(html: string, page: DocumentPage): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none',
    ],
  })

  try {
    const tab = await browser.newPage()
    // 'networkidle0' rather than 'load': templates inline everything, so the
    // only thing left to settle is font layout, and a PDF captured mid-layout
    // silently ships with fallback metrics.
    await tab.setContent(html, { waitUntil: 'networkidle0' })

    const pdf = await tab.pdf({
      format: page.size,
      landscape: page.orientation === 'landscape',
      printBackground: true,
      margin: {
        top: page.margin,
        right: page.margin,
        bottom: page.margin,
        left: page.margin,
      },
    })

    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
