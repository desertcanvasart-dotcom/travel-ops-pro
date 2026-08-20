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

/**
 * How long to wait for one attempt's content to settle.
 *
 * Deliberately well under the old 60s: the FIRST render on a freshly started
 * container is slow — Chromium's binary is not in the page cache and the
 * document carries a ~7MB inline font — and at 60s that attempt consumed the
 * whole request before failing. A shorter ceiling turns the cold attempt into a
 * fast failure that leaves room to try again warm.
 */
const SETTLE_TIMEOUT_MS = 25_000

export async function renderHtmlToPdf(html: string, page: DocumentPage): Promise<Buffer> {
  // Observed in production the minute after a deploy: the first request timed
  // out at the ceiling and returned a 500, and the very next one rendered in
  // 7s. Whoever taps a document first should not be the one who pays for the
  // container being cold, so one failed attempt is retried — by then Chromium
  // is warm and the retry is the ordinary path.
  try {
    return await renderOnce(html, page)
  } catch (error) {
    console.warn('PDF render failed, retrying once on a warm browser:', error)
    return await renderOnce(html, page)
  }
}

async function renderOnce(html: string, page: DocumentPage): Promise<Buffer> {
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
    // Templates inline everything — including, for Japanese documents, a ~7MB
    // base64 @font-face. 'networkidle0' alone has timed out on that payload;
    // the settled-fonts signal that actually matters is document.fonts.ready
    // (the pattern proven by the b2b quote PDF route). A PDF captured before
    // it resolves silently ships with fallback metrics.
    await tab.setContent(html, {
      waitUntil: ['domcontentloaded', 'networkidle0'],
      timeout: SETTLE_TIMEOUT_MS,
    })
    await tab.evaluateHandle('document.fonts.ready')

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
