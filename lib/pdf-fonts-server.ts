// Server-side Noto Sans JP loader for puppeteer routes.
//
// NotoSansJP is the base font for ALL locales in the puppeteer PDFs (b2b quote,
// tour export). The deploy container likely doesn't ship a CJK system font, so
// Japanese characters would otherwise tofu. This embeds the font directly into
// the HTML via @font-face — no network fetch, no system-font dependency.
//
// ONE Regular face, declared `font-weight: 400`. Bold (700) is left to the
// browser's synthetic-bold (font-synthesis is on by default in Chromium), so
// headers/totals still render bold WITHOUT embedding a second ~7MB font inline.
// (Embedding a second face doubled the inline base64 to ~14MB and timed out
// puppeteer's setContent — a real risk on the live routes. Synthetic bold keeps
// the payload at the proven ~7MB. NOTE: the jsPDF path is different — jsPDF
// cannot synthesize faux-bold, so lib/pdf-fonts.ts DOES load a real Bold file.)
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

let cachedBase64: string | null = null

async function loadFontBase64(): Promise<string> {
  if (cachedBase64) return cachedBase64
  const path = join(process.cwd(), 'public', 'fonts', 'NotoSansJP-Regular.ttf')
  const buf = await readFile(path)
  cachedBase64 = buf.toString('base64')
  return cachedBase64
}

// Returns @font-face CSS registering NotoSansJP at weight 400. Drop into the
// puppeteer HTML <style>; reference as `font-family: 'NotoSansJP', ...` with
// normal CSS font-weights — 700 is synthesized by the browser.
export async function getJapaneseFontFace(): Promise<string> {
  const base64 = await loadFontBase64()
  return `@font-face {
  font-family: 'NotoSansJP';
  src: url(data:font/ttf;charset=utf-8;base64,${base64}) format('truetype');
  font-weight: 400;
  font-style: normal;
  font-display: block;
}`
}

let cachedTipsArabic: string | null = null

// The 日程表's tips card says "tips were paid in Japan" in Arabic for the
// driver who asks. The server ships no Arabic font and the Japanese one has no
// Arabic glyphs, so the one sentence is an image (public/documents/
// tips-paid-ar.png, rendered once from a system Arabic face) — 32KB, against
// the megabytes a second embedded font would add to every render.
export async function getTipsArabicImage(): Promise<string> {
  if (cachedTipsArabic) return cachedTipsArabic
  const buf = await readFile(join(process.cwd(), 'public', 'documents', 'tips-paid-ar.png'))
  cachedTipsArabic = `data:image/png;base64,${buf.toString('base64')}`
  return cachedTipsArabic
}

const atsImages = new Map<string, string>()

// The ATS sheet's own logo and company seal (public/documents/ats-logo.jpeg,
// ats-seal.jpeg — taken from 予約確認書兼請求書_ATS.xlsx) as data URIs: the
// renderer fetches nothing. A missing file prints without it rather than
// failing the document.
export async function getAtsDocumentImage(file: 'ats-logo.jpeg' | 'ats-seal.jpeg'): Promise<string | null> {
  const hit = atsImages.get(file)
  if (hit) return hit
  try {
    const buf = await readFile(join(process.cwd(), 'public', 'documents', file))
    const uri = `data:image/jpeg;base64,${buf.toString('base64')}`
    atsImages.set(file, uri)
    return uri
  } catch {
    return null
  }
}
