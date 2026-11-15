// ============================================
// POST /api/public/order-form — the customer's own door into the intake
// ============================================
// The hosted order form (/order) submits structured fields here. No session
// and never will be: the visitor is a customer, not a user. The route
// defends itself instead — a per-IP rate limit, a honeypot field, strict
// field validation with hard length caps — and is exempted from the session
// gate in middleware.ts on those terms.
//
// The same pipeline as the operator's paste page runs underneath
// (lib/intake/process-order.ts): client by email or created, standard
// variation, ONE priced draft quote. Two rules of this door:
//
//  1. The customer NEVER sees the operator's numbers. The pipeline's body
//     carries cost, margin and pricing holes for the operator's preview;
//     what leaves here is received-or-not plus the quote number as a
//     reference — nothing else.
//
//  2. A valid order is NEVER bounced. If the tour code matches no
//     programme, a rate hole stops pricing, or a write fails, the customer
//     still hears "received" — and the managers get a notification whose
//     link opens /intake/order pre-filled with the order rendered in the
//     canonical form-email shape (formatTourUpOrder), so the operator
//     finishes by hand what the pipeline could not.
//
// Since 2026-11-15 the agency website's own buttons open this form (the
// free option: T-UP only changes the link). A button carries the website
// page's id — and, for a programme, the date it was pressed on — so the
// order names its page (pageId). The route reads that page ITSELF
// (lib/intake/website-page) for the code, title and the fare the customer
// was shown; a price from the browser is never used. An optional-tour cart
// is several lines (kind 'optional', items[]), and each line is its own
// order, as the website's emails were. Every order then takes the same
// steps an emailed one takes (takeInWebOrder: intake row, duplicate check,
// pipeline, the managers' notice).
import { NextRequest, NextResponse } from 'next/server'
import { createActorAdminClient } from '@/lib/supabase-actor'
import { getDefaultOrgId } from '@/lib/auth/default-org'
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit'
import { formatTourUpOrder, parseJaDate, type OrderPerson, type TourUpOrder } from '@/lib/intake/tour-up-order'
import { formatAsTupMail } from '@/lib/intake/tup-mail'
import { takeInWebOrder } from '@/lib/intake/web-order-intake'
import { cleanPageId, fetchWebsitePage, websiteOrigin, websitePageUrl, type WebsitePage } from '@/lib/intake/website-page'
import { notifyOrgManagers } from '@/lib/notify-managers'

const supabase = createActorAdminClient()

// ---------- validation ----------
// Caps are generous for a human and hostile to a payload. Every string is
// trimmed; empty collapses to undefined so the formatter can omit the line.

function str(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  if (!t) return undefined
  return t.length > max ? undefined : t
}

function isoDate(v: unknown): string | undefined {
  const s = str(v, 40)
  if (!s) return undefined
  // The form sends YYYY-MM-DD; accept 2026年11月3日 too, same as the parser.
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : parseJaDate(s)
  if (!iso) return undefined
  const d = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? undefined : iso
}

function int(v: unknown, min: number, max: number): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isInteger(n) || n < min || n > max) return undefined
  return n
}

function gender(v: unknown): 'male' | 'female' | undefined {
  return v === 'male' || v === 'female' ? v : undefined
}

const EMAIL_RE = /^[A-Za-z0-9._+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/

function person(v: unknown): OrderPerson | null {
  if (!v || typeof v !== 'object') return null
  const p = v as Record<string, unknown>
  const last = str(p.lastNameRomaji, 60)
  const first = str(p.firstNameRomaji, 60)
  if (!last && !first) return null
  return {
    lastNameRomaji: last ?? '',
    firstNameRomaji: first ?? '',
    gender: gender(p.gender),
    birthDate: isoDate(p.birthDate),
  }
}

const MAX_COMPANIONS = 15
const MAX_ITEMS = 10

/** The customer's details — the same for a programme and an optional cart. */
type Common = Omit<TourUpOrder, 'tourCode' | 'tourTitle' | 'departureDate1' | 'departureDate2' | 'departureAirport' | 'adults' | 'children'>

/** What one line of the order names: a programme or one optional tour. */
interface Line {
  pageId: string | null
  tourCode?: string
  tourTitle: string
  departureDate1: string
  departureDate2?: string
  departureAirport?: string
  adults: number
  children: number
  infants: number
}

function readCommon(body: Record<string, unknown>): { common: Common } | { error: string } {
  const email = str(body.email, 120)?.toLowerCase()
  if (!email || !EMAIL_RE.test(email)) return { error: 'メールアドレスをご確認ください。' }
  const lastNameRomaji = str(body.lastNameRomaji, 60)
  const firstNameRomaji = str(body.firstNameRomaji, 60)
  if (!lastNameRomaji || !firstNameRomaji) return { error: 'お名前（ローマ字）をご入力ください。' }

  const companionsRaw = Array.isArray(body.companions) ? body.companions : []
  if (companionsRaw.length > MAX_COMPANIONS) return { error: `同行者は${MAX_COMPANIONS}名までです。` }
  const companions = companionsRaw.map(person).filter((p): p is OrderPerson => p !== null)

  return {
    common: {
      inquiryType: str(body.inquiryType, 20) ?? '申込み',
      contactMethod: body.contactMethod === 'phone' ? 'phone' : body.contactMethod === 'email' ? 'email' : undefined,
      email,
      phone: str(body.phone, 40)?.replace(/[^\d+\-()]/g, '') || undefined,
      lead: {
        lastNameRomaji,
        firstNameRomaji,
        lastNameKanji: str(body.lastNameKanji, 60),
        firstNameKanji: str(body.firstNameKanji, 60),
        lastNameKana: str(body.lastNameKana, 60),
        firstNameKana: str(body.firstNameKana, 60),
        gender: gender(body.gender),
        birthDate: isoDate(body.birthDate),
      },
      postalCode: str(body.postalCode, 10)?.match(/^\d{3}-?\d{4}$/)?.[0],
      prefecture: str(body.prefecture, 10),
      address: str(body.address, 300),
      requests: str(body.requests, 4000),
      companions,
    },
  }
}

const code = (v: unknown) => str(v, 40)?.replace(/\s+/g, '').toUpperCase()

/** The programme line, or the (Japanese) reason it is not one. */
function readTourLine(body: Record<string, unknown>): { line: Line } | { error: string } {
  const pageId = cleanPageId(body.pageId)
  const tourCode = code(body.tourCode)
  if (!tourCode && !pageId) return { error: 'ツアーコードをご入力ください。' }
  const departureDate1 = isoDate(body.departureDate1)
  if (!departureDate1) return { error: '出発日（第1希望）をご入力ください。' }
  const adults = int(body.adults, 1, 15)
  if (adults === undefined) return { error: '参加人数（大人）をご確認ください。' }
  return {
    line: {
      pageId, tourCode, tourTitle: str(body.tourTitle, 200) ?? '',
      departureDate1, departureDate2: isoDate(body.departureDate2), departureAirport: str(body.departureAirport, 40),
      adults, children: int(body.children, 0, 15) ?? 0, infants: int(body.infants, 0, 15) ?? 0,
    },
  }
}

/** The optional-tour cart's lines, or the reason they are not. */
function readOptionalLines(body: Record<string, unknown>): { lines: Line[] } | { error: string } {
  const raw = Array.isArray(body.items) ? body.items : []
  if (raw.length === 0) return { error: 'オプショナルツアーを選択してください。' }
  if (raw.length > MAX_ITEMS) return { error: `一度にお申込みいただけるのは${MAX_ITEMS}件までです。` }
  const lines: Line[] = []
  for (const [i, v] of raw.entries()) {
    const it = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
    const pageId = cleanPageId(it.pageId)
    const tourCode = code(it.tourCode)
    if (!pageId && !tourCode) return { error: `${i + 1}件目のツアーを確認できませんでした。` }
    const date = isoDate(it.date)
    if (!date) return { error: `${i + 1}件目の利用日をご入力ください。` }
    const adults = int(it.adults, 0, 15) ?? 0
    const children = int(it.children, 0, 15) ?? 0
    if (adults + children < 1) return { error: `${i + 1}件目の参加人数をご確認ください。` }
    lines.push({ pageId, tourCode, tourTitle: str(it.tourTitle, 200) ?? '', departureDate1: date, adults, children, infants: int(it.infants, 0, 15) ?? 0 })
  }
  return { lines }
}

/** The fare the website publishes for the party, in the shape the pipeline
 *  reads (lib/pricing/website-price). Children on a programme have no
 *  published per-date fare, so a party with children carries none — the
 *  quote is then priced the old way and the office sets the price. */
function websiteFare(page: WebsitePage | null, line: Line): Pick<TourUpOrder, 'websiteBaseFare1' | 'websiteBaseFare2' | 'websiteSubtotalJpy'> {
  if (!page || page.withdrawn) return {}
  if (page.kind === 'tour') {
    const f1 = page.fares[line.departureDate1]
    const f2 = line.departureDate2 ? page.fares[line.departureDate2] : undefined
    return { websiteBaseFare1: f1 ? { adultJpy: f1 } : undefined, websiteBaseFare2: f2 ? { adultJpy: f2 } : undefined }
  }
  if (!page.adultJpy && line.adults > 0) return {}
  if (line.children > 0 && !page.childJpy) return {}
  const total = line.adults * (page.adultJpy ?? 0) + line.children * (page.childJpy ?? 0)
  return total > 0 ? { websiteSubtotalJpy: total } : {}
}

/** One line as an order: the website page's code, title and fare win. */
async function toOrder(common: Common, line: Line, kind: 'tour' | 'optional', origin: string | null): Promise<TourUpOrder> {
  const page = line.pageId ? await fetchWebsitePage(kind, line.pageId, { origin }) : null
  const websiteUrl = page?.url ?? (line.pageId && origin ? websitePageUrl(origin, kind, line.pageId) : undefined)
  return {
    ...common,
    // The page could not be read and no code was typed: the page's id
    // stands in, and the programme is found by its website page.
    tourCode: page?.code ?? line.tourCode ?? `WEB-${line.pageId}`,
    tourTitle: page?.title ?? line.tourTitle,
    departureDate1: line.departureDate1,
    departureDate2: line.departureDate2,
    departureAirport: line.departureAirport,
    adults: line.adults,
    children: line.children,
    infants: line.infants || undefined,
    productKind: kind,
    websiteUrl,
    ...websiteFare(page, line),
  }
}

/** /intake/order pre-filled with the order as the canonical form document. */
function pasteLink(text: string): string {
  return `/intake/order?text=${encodeURIComponent(Buffer.from(text, 'utf8').toString('base64'))}`
}

const RECEIVED = 'ご注文を承りました。担当者よりご連絡いたします。'

export async function POST(request: NextRequest) {
  try {
    const rate = checkRateLimit(getClientIdentifier(request), 'orderForm')
    if (!rate.success) return rateLimitResponse(rate)

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: '送信内容を読み取れませんでした。' }, { status: 400 })
    }
    // Honeypot: the form renders `website` off-screen and humans never fill
    // it. A bot that does gets a convincing yes and no writes.
    if (typeof body.website === 'string' && body.website.trim()) {
      return NextResponse.json({ success: true, reference: null, message: RECEIVED })
    }

    const kind = body.kind === 'optional' ? 'optional' : 'tour'
    const commonRead = readCommon(body)
    if ('error' in commonRead) return NextResponse.json({ success: false, error: commonRead.error }, { status: 400 })
    const linesRead = kind === 'optional'
      ? readOptionalLines(body)
      : (() => { const r = readTourLine(body); return 'error' in r ? r : { lines: [r.line] } })()
    if ('error' in linesRead) return NextResponse.json({ success: false, error: linesRead.error }, { status: 400 })

    const orgId = await getDefaultOrgId(supabase)
    if (!orgId) {
      console.error('[public/order-form] no default org; order not stored:', commonRead.common.email)
      return NextResponse.json({ success: false, error: 'ただいまご注文を受け付けられません。恐れ入りますが、時間をおいてお試しください。' }, { status: 503 })
    }

    const origin = websiteOrigin()
    const references: string[] = []
    for (const line of linesRead.lines) {
      const order = await toOrder(commonRead.common, line, kind, origin)
      let taken: Awaited<ReturnType<typeof takeInWebOrder>> | null = null
      try {
        taken = await takeInWebOrder(supabase, {
          orgId, order, text: formatAsTupMail(order), receivedAt: new Date().toISOString(),
          subject: kind === 'optional' ? 'ウェブ注文フォーム（オプショナルツアー）' : 'ウェブ注文フォーム', via: 'form',
        })
      } catch (err) {
        console.error('[public/order-form] intake threw:', err)
      }
      if (taken?.quoteNumber) references.push(taken.quoteNumber)
      if (taken && taken.outcome !== 'error') continue

      // Not even recorded (the intake row could not be written). The
      // customer still hears "received"; the managers get the whole order
      // as a pre-filled paste-page link. Rule 2 above.
      const text = formatTourUpOrder(order)
      const notified = await notifyOrgManagers(supabase, orgId, {
        type: 'order_received',
        title: `要対応の新規オーダー: ${order.tourCode}`,
        message: `ウェブ注文フォームより。記録できませんでした（${taken?.reason ?? 'Internal error'}）。リンク先で内容を確認し、手動で取り込んでください。${order.tourCode} / ${order.departureDate1} / ${order.email}`,
        link: pasteLink(text),
      })
      if (notified.created === 0) {
        // Last resort: the order must survive SOMEWHERE the operator can find.
        console.error('[public/order-form] order not recorded AND no manager notified — raw order follows:\n', formatAsTupMail(order))
      }
    }
    return NextResponse.json({ success: true, reference: references.length ? references.join('、') : null, message: RECEIVED })
  } catch (err) {
    console.error('[public/order-form]', err)
    return NextResponse.json({ success: false, error: '送信中にエラーが発生しました。時間をおいてお試しください。' }, { status: 500 })
  }
}
