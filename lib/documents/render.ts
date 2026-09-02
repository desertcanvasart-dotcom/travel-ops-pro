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
 * Tuned against production, twice. At 60s a cold attempt consumed the whole
 * request before failing, leaving no room to retry. At 25s it left plenty of
 * room — but roughly half of all renders then took ~32s, the signature of a
 * viable attempt being abandoned at 25s and paying for a retry it did not need.
 * Warm renders finish in 5-8s, so anything reaching 45s is genuinely stuck
 * rather than merely slow, and abandoning it is the right call.
 *
 * Worst case is 45s of waiting plus a ~6s retry. That is the price of the cold
 * container's first document; every render after it is the fast path.
 */
const SETTLE_TIMEOUT_MS = 45_000

export async function renderHtmlToPdf(html: string, page: DocumentPage, footerHtml?: string): Promise<Buffer> {
  // Observed in production the minute after a deploy: the first request timed
  // out at the ceiling and returned a 500, and the very next one rendered in
  // 7s. Whoever taps a document first should not be the one who pays for the
  // container being cold, so one failed attempt is retried — by then Chromium
  // is warm and the retry is the ordinary path.
  try {
    return await renderOnce(html, page, footerHtml)
  } catch (error) {
    console.warn('PDF render failed, retrying once on a warm browser:', error)
    return await renderOnce(html, page, footerHtml)
  }
}

async function renderOnce(html: string, page: DocumentPage, footerHtml?: string): Promise<Buffer> {
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
    // NOT networkidle0. Templates inline everything — the logo is a data URI
    // and the Japanese @font-face is ~7MB of base64 — so there is no network to
    // go idle, and waiting for it buys nothing. In the production container it
    // cost everything: setContent timed out on every 日程表, twice per request,
    // while the identical code rendered in 5-8s locally. The settled signal
    // that actually matters is document.fonts.ready; a PDF captured before it
    // resolves ships with fallback metrics.
    await tab.setContent(html, {
      waitUntil: 'domcontentloaded',
      timeout: SETTLE_TIMEOUT_MS,
    })
    await tab.evaluateHandle('document.fonts.ready')

    // A running footer is drawn by Chromium inside the bottom margin, so the
    // margin has to be tall enough to hold it. The template asks for that
    // height; the content never sees it.
    const footer = footerHtml && page.footerHeight ? { html: footerHtml, height: page.footerHeight } : null
    const pdf = await tab.pdf({
      format: page.size,
      landscape: page.orientation === 'landscape',
      printBackground: true,
      ...(footer
        ? { displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: footer.html }
        : {}),
      margin: {
        top: page.margin,
        right: page.margin,
        bottom: footer ? footer.height : page.margin,
        left: page.margin,
      },
    })

    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
