// ============================================
// The agency website's tour pages, read for the hosted order form
// ============================================
// The website's 申込み buttons point at our /order (operator, 2026-11-15:
// the free option Rush offered — only the link changes, T-UP keeps the
// pages). The buttons carry what they always carried: the page's id and,
// for a programme, the chosen date as a unix time (dt, JST midnight). The
// email the website used to send carried the price the customer saw; a link
// does not, and a price in a link is the customer's to edit. So the server
// reads the page itself — the website is the one source for code, title and
// fare — and the order goes down the same pipeline as the email did.
//
//   programme  {origin}/detail.php?id=N&d=ALL&hf=1   every date's adult fare
//              (2名1室, per person) in the calendar, code in p.code
//   optional   {origin}/opt_detail.php?id=N          flat 旅行代金 + 子ども代金
//
// The origin is configuration (ORDER_WEBSITE_ORIGIN), never source: the
// installation is operator-neutral. Only a numeric id is ever put in a URL,
// so the form cannot be made to fetch anything else. Parsers are pure;
// fetchWebsitePage caches for ten minutes so a customer's page load and the
// submit that follows read the website once.

export type WebsitePageKind = 'tour' | 'optional'

export interface WebsitePage {
  kind: WebsitePageKind
  pageId: string
  url: string
  code: string | null
  title: string | null
  /** The page says the tour is no longer published. */
  withdrawn: boolean
  /** Programme: adult fare per person by departure date (YYYY-MM-DD). */
  fares: Record<string, number>
  /** Optional: flat adult and child fare per person. */
  adultJpy?: number
  childJpy?: number
}

/** The website's origin, e.g. https://tour.example.jp — null when unset or not https. */
export function websiteOrigin(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env.ORDER_WEBSITE_ORIGIN?.trim()
  if (!raw) return null
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' ? u.origin : null
  } catch {
    return null
  }
}

/** A page id is digits only — the only thing the form may put in a URL. */
export function cleanPageId(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : ''
  return /^\d{1,10}$/.test(s) ? s : null
}

/** The page's public address (what tour_templates.website_url holds). */
export function websitePageUrl(origin: string, kind: WebsitePageKind, pageId: string): string {
  return kind === 'tour' ? `${origin}/detail.php?id=${pageId}` : `${origin}/opt_detail.php?id=${pageId}`
}

/** The optional-tour list, where a customer goes back to add another. */
export function optionalListUrl(origin: string): string {
  return `${origin}/opt_top.php`
}

/** The calendar's dt (unix seconds at midnight, Japan time) as YYYY-MM-DD. */
export function jstDateFromUnix(dt: unknown): string | null {
  const n = typeof dt === 'number' ? dt : typeof dt === 'string' && /^\d{9,11}$/.test(dt.trim()) ? Number(dt) : NaN
  if (!Number.isFinite(n) || n <= 0) return null
  const d = new Date((n + 9 * 3600) * 1000)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&#44;': ',' }
const decode = (s: string) => s.replace(/&(?:amp|lt|gt|quot|nbsp|#39|#44);/g, m => ENTITIES[m] ?? m)
const text = (html: string) => decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
const yen = (s: string | undefined) => {
  const n = s ? Number(decode(s).replace(/[,，\s]/g, '')) : NaN
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function pageCode(html: string): string | null {
  const m = text(html).match(/ツアーコード\s*[：:]\s*([A-Za-z0-9][A-Za-z0-9_\-]*)/)
  return m ? m[1].toUpperCase() : null
}

function pageTitle(html: string): string | null {
  const h2 = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)
  const t = h2 ? text(h2[1]) : ''
  return t || null
}

const WITHDRAWN = /このツアーの掲載は終了/

/** A programme page (detail.php, best read with d=ALL): code, title, fares. */
export function parseTourPage(html: string, pageId: string, url: string): WebsitePage {
  const fares: Record<string, number> = {}
  // Each bookable day is a link carrying dt, then the day and the fare:
  // <a href="…inq.php?id=N&dt=1795273200&hf=1"><span class="date">22</span><span class="yen">￥364,000<br /></span></a>
  const cell = /dt=(\d{9,11})[^"]*"[^>]*>\s*<span class="date">\d+<\/span>\s*<span class="yen">\s*[￥¥]\s*([\d,]+)/g
  for (const m of html.matchAll(cell)) {
    const date = jstDateFromUnix(m[1])
    const fare = yen(m[2])
    if (date && fare && !(date in fares)) fares[date] = fare
  }
  return { kind: 'tour', pageId, url, code: pageCode(html), title: pageTitle(html), withdrawn: WITHDRAWN.test(html), fares }
}

/** An optional-tour page (opt_detail.php): code, title, flat fares. */
export function parseOptionalPage(html: string, pageId: string, url: string): WebsitePage {
  const adult = html.match(/class="price"[^>]*>\s*旅行代金\s*[：:]\s*<span>\s*([\d,，]+)\s*円/)
  const child = html.match(/class="price2"[^>]*>\s*子(?:ども|供)代金[\s\S]{0,40}?<span>\s*([\d,，]+)\s*円/)
  return {
    kind: 'optional', pageId, url, code: pageCode(html), title: pageTitle(html), withdrawn: WITHDRAWN.test(html), fares: {},
    adultJpy: yen(adult?.[1]), childJpy: yen(child?.[1]),
  }
}

// ---------- fetching ----------

const CACHE_MS = 10 * 60 * 1000
const MAX_BYTES = 3 * 1024 * 1024
const cache = new Map<string, { at: number; page: WebsitePage }>()

/** Test hook. */
export function clearWebsitePageCache() { cache.clear() }

/**
 * The page as the website shows it now, or null when there is no origin
 * configured, the id is not a number, or the website did not answer. Never
 * throws: an order is never refused because the website was slow.
 */
export async function fetchWebsitePage(
  kind: WebsitePageKind,
  pageIdRaw: unknown,
  opts: { origin?: string | null; fetchImpl?: typeof fetch } = {},
): Promise<WebsitePage | null> {
  const origin = opts.origin === undefined ? websiteOrigin() : opts.origin
  const pageId = cleanPageId(pageIdRaw)
  if (!origin || !pageId) return null
  const url = websitePageUrl(origin, kind, pageId)
  const hit = cache.get(url)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.page
  const readUrl = kind === 'tour' ? `${url}&d=ALL&hf=1` : url
  try {
    const res = await (opts.fetchImpl ?? fetch)(readUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; order-form page reader)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const html = await res.text()
    if (html.length > MAX_BYTES) return null
    const page = kind === 'tour' ? parseTourPage(html, pageId, url) : parseOptionalPage(html, pageId, url)
    cache.set(url, { at: Date.now(), page })
    return page
  } catch (e) {
    console.error('[website-page] could not read', readUrl, e instanceof Error ? e.message : e)
    return null
  }
}
