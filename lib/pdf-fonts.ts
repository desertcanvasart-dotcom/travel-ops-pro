// CJK font loader for jsPDF.
//
// NotoSansJP is now the BASE font for ALL locales (not just JA). jsPDF's
// built-in fonts (helvetica/times/courier) are Latin-only, so any Japanese
// character in an English-locale document (e.g. a Japanese supplier/guide
// name on an EN voucher) renders as tofu under helvetica. Noto Sans JP
// renders Latin perfectly too, so using it everywhere closes that gap with
// no downside.
//
// BOTH static weights are loaded so bold stays REAL (jsPDF does NOT synthesize
// faux-bold for embedded TTFs — registering only Regular would flatten every
// bold header/total, a visible regression on EN documents). Regular →
// 'normal', Bold → 'bold'.
//
// Assets (operator-provided, not committed):
//   /public/fonts/NotoSansJP-Regular.ttf
//   /public/fonts/NotoSansJP-Bold.ttf
//   /public/fonts/OFL.txt   (license, covers both weights)
import type { jsPDF } from 'jspdf'

export const JP_FONT_FAMILY = 'NotoSansJP'

const WEIGHTS = {
  normal: { file: '/fonts/NotoSansJP-Regular.ttf', vfs: 'NotoSansJP-Regular.ttf' },
  bold: { file: '/fonts/NotoSansJP-Bold.ttf', vfs: 'NotoSansJP-Bold.ttf' },
} as const

const cache: Record<string, string> = {}

// In-flight downloads, so two PDFs generated at once share one fetch of each
// 5.4 MB file instead of both downloading it.
const inflight: Record<string, Promise<string>> = {}

function fetchFontBase64(file: string): Promise<string> {
  if (cache[file]) return Promise.resolve(cache[file])
  if (!inflight[file]) {
    inflight[file] = downloadFontBase64(file).finally(() => { delete inflight[file] })
  }
  return inflight[file]
}

async function downloadFontBase64(file: string): Promise<string> {
  const res = await fetch(file)
  if (!res.ok) {
    throw new Error(`Japanese font not found at ${file} (HTTP ${res.status}). Drop the Noto Sans JP statics into /public/fonts/. See /public/fonts/README.md.`)
  }
  const bytes = new Uint8Array(await res.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
  }
  cache[file] = btoa(binary)
  return cache[file]
}

// Idempotent per jsPDF doc: registers Regular under 'normal' and Bold under
// 'bold' for the NotoSansJP family. Caller does setFont(JP_FONT_FAMILY, ...).
// Throws if an asset is missing — fail loud, do not silently render boxes.
export async function loadJapaneseFont(pdf: jsPDF): Promise<void> {
  // Both weights download together — they were fetched one after the other,
  // two 5.4 MB files in series before the first PDF of a session could render.
  const [regular, bold] = await Promise.all([
    fetchFontBase64(WEIGHTS.normal.file),
    fetchFontBase64(WEIGHTS.bold.file),
  ])
  pdf.addFileToVFS(WEIGHTS.normal.vfs, regular)
  pdf.addFont(WEIGHTS.normal.vfs, JP_FONT_FAMILY, 'normal')

  pdf.addFileToVFS(WEIGHTS.bold.vfs, bold)
  pdf.addFont(WEIGHTS.bold.vfs, JP_FONT_FAMILY, 'bold')
}

// NotoSansJP is now the base font for every locale. Kept as a function so call
// sites read clearly; the locale arg is ignored (Latin renders fine in NotoSansJP).
export function pickFontFamily(_locale?: string): string {
  return JP_FONT_FAMILY
}
