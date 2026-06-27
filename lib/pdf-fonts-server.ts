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
