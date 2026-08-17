// ============================================
// Noto Sans JP for jsPDF, server-side
// ============================================
// There are three font paths in this app and they are not interchangeable:
//
//   lib/pdf-fonts.ts         jsPDF in the BROWSER — fetches /fonts/*.ttf
//   lib/pdf-fonts-server.ts  puppeteer — returns @font-face CSS to inline
//   this file                jsPDF on the SERVER — reads the TTF off disk
//
// The third did not exist, which is why an invoice rendered by a route came out
// with the customer's name as mojibake: jsPDF's built-in faces are Latin-only,
// and nothing had registered anything else.
//
// BOTH weights are registered. jsPDF does NOT synthesize faux-bold for embedded
// TrueType, so registering Regular alone silently flattens every bold heading
// and total — a visible regression rather than a missing glyph.

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const JP_FONT_FAMILY = 'NotoSansJP'

const FILES = {
  normal: 'NotoSansJP-Regular.ttf',
  bold: 'NotoSansJP-Bold.ttf',
} as const

// ~5MB each, so read once per process rather than per document.
const cache = new Map<string, string>()

async function fontBase64(file: string): Promise<string> {
  const hit = cache.get(file)
  if (hit) return hit
  const buf = await readFile(join(process.cwd(), 'public', 'fonts', file))
  const b64 = buf.toString('base64')
  cache.set(file, b64)
  return b64
}

export interface EmbeddedFont {
  family: string
  files: Array<{ name: string; base64: string; weight: string }>
}

/**
 * Read the font off disk, ready to be registered on a document.
 *
 * Returns null if the files are absent rather than throwing: a missing font
 * should degrade an invoice's glyphs, not fail the request that was trying to
 * hand somebody their bill. Reading is async and registration is not, which is
 * why this returns DATA rather than taking a document — the generators that
 * consume it are synchronous.
 */
export async function loadJapaneseFont(): Promise<EmbeddedFont | null> {
  try {
    const files = await Promise.all(
      Object.entries(FILES).map(async ([weight, name]) => ({
        name,
        weight,
        base64: await fontBase64(name),
      }))
    )
    return { family: JP_FONT_FAMILY, files }
  } catch (error) {
    console.error('Japanese font unavailable, falling back to helvetica:', error)
    return null
  }
}
