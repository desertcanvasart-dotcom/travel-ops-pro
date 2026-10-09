// ============================================
// Fetch an image server-side and inline it as a data: URI
// ============================================
// PDF documents must be SELF-CONTAINED: the renderer's Chromium waits for
// network idle, and inside the deploy container an external <img> request has
// been observed to hang the whole render to its 60s ceiling (the letterhead
// logo took the 日程表 from ~5s to a timeout). Node's own fetch reaches the
// storage host fine — so the server fetches once, caches, and the document
// carries the bytes, exactly like the embedded font.
//
// Failure returns null: a document without its logo beats a document that
// never renders.

const cache = new Map<string, string>()
// A failure is remembered for a few minutes only, so one timeout does not
// leave every document without its logo until the server restarts.
const failedAt = new Map<string, number>()
const RETRY_AFTER_MS = 5 * 60 * 1000

export async function inlineImage(url: string | null | undefined): Promise<string | null> {
  if (!url) return null
  const hit = cache.get(url)
  if (hit) return hit
  const failed = failedAt.get(url)
  if (failed !== undefined && Date.now() - failed < RETRY_AFTER_MS) return null

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const type = res.headers.get('content-type') ?? 'image/png'
    const bytes = Buffer.from(await res.arrayBuffer())
    // A "logo" bigger than 4MB is not a logo; refuse rather than balloon the
    // document past what setContent handles comfortably.
    if (bytes.length > 4 * 1024 * 1024) throw new Error('image too large')
    const dataUri = `data:${type};base64,${bytes.toString('base64')}`
    cache.set(url, dataUri)
    failedAt.delete(url)
    return dataUri
  } catch (err) {
    console.error('inlineImage failed for', url, err)
    failedAt.set(url, Date.now())
    return null
  }
}
