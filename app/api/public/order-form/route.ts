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
import { NextRequest, NextResponse } from 'next/server'
import { createActorAdminClient } from '@/lib/supabase-actor'
import { getDefaultOrgId } from '@/lib/auth/default-org'
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit'
import { formatTourUpOrder, parseJaDate, type OrderPerson, type TourUpOrder } from '@/lib/intake/tour-up-order'
import { processTourUpOrder } from '@/lib/intake/process-order'
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

const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/

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

/** The submitted fields as a TourUpOrder, or the (Japanese) reason they are not. */
function readOrder(body: Record<string, unknown>): { order: TourUpOrder } | { error: string } {
  const tourCode = str(body.tourCode, 40)?.replace(/\s+/g, '').toUpperCase()
  if (!tourCode) return { error: 'ツアーコードをご入力ください。' }
  const departureDate1 = isoDate(body.departureDate1)
  if (!departureDate1) return { error: '出発日（第1希望）をご入力ください。' }
  const email = str(body.email, 120)?.toLowerCase()
  if (!email || !EMAIL_RE.test(email)) return { error: 'メールアドレスをご確認ください。' }
  const adults = int(body.adults, 1, 15)
  if (adults === undefined) return { error: '参加人数（大人）をご確認ください。' }
  const lastNameRomaji = str(body.lastNameRomaji, 60)
  const firstNameRomaji = str(body.firstNameRomaji, 60)
  if (!lastNameRomaji || !firstNameRomaji) return { error: 'お名前（ローマ字）をご入力ください。' }

  const companionsRaw = Array.isArray(body.companions) ? body.companions : []
  if (companionsRaw.length > MAX_COMPANIONS) return { error: `同行者は${MAX_COMPANIONS}名までです。` }
  const companions = companionsRaw.map(person).filter((p): p is OrderPerson => p !== null)

  return {
    order: {
      inquiryType: str(body.inquiryType, 20) ?? '申込み',
      tourCode,
      tourTitle: str(body.tourTitle, 200) ?? '',
      departureDate1,
      departureDate2: isoDate(body.departureDate2),
      departureAirport: str(body.departureAirport, 40),
      adults,
      children: int(body.children, 0, 15) ?? 0,
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

    const read = readOrder(body)
    if ('error' in read) {
      return NextResponse.json({ success: false, error: read.error }, { status: 400 })
    }
    const { order } = read

    const orgId = await getDefaultOrgId(supabase)
    if (!orgId) {
      console.error('[public/order-form] no default org; order not stored:', order.tourCode, order.email)
      return NextResponse.json({ success: false, error: 'ただいまご注文を受け付けられません。恐れ入りますが、時間をおいてお試しください。' }, { status: 503 })
    }

    const summary = `${order.tourCode} / ${order.departureDate1} / 大人${order.adults}人 子供${order.children}人 / ${order.lead.lastNameRomaji} ${order.lead.firstNameRomaji} <${order.email}>`

    let result: Awaited<ReturnType<typeof processTourUpOrder>> | null = null
    try {
      result = await processTourUpOrder(supabase, { orgId, userId: null, order, dryRun: false })
    } catch (err) {
      console.error('[public/order-form] pipeline threw:', err)
    }

    const quote = result?.body.quote
    if (result?.body.success && quote) {
      await notifyOrgManagers(supabase, orgId, {
        type: 'order_received',
        title: `新規オーダー ${quote.quote_number}: ${order.tourCode}`,
        message: `ウェブ注文フォームより。${summary}`,
        link: `/b2b/quotes/${quote.id}`,
      })
      return NextResponse.json({ success: true, reference: quote.quote_number, message: RECEIVED })
    }

    // The pipeline could not finish (unknown code, unpriceable, write error).
    // The customer still hears "received"; the operator gets the whole order
    // as a pre-filled paste-page link and finishes by hand. Rule 2 above.
    const text = formatTourUpOrder(order)
    const reason = (result?.body.error as string | undefined) ?? 'Internal error'
    const notified = await notifyOrgManagers(supabase, orgId, {
      type: 'order_received',
      title: `要対応の新規オーダー: ${order.tourCode}`,
      message: `ウェブ注文フォームより。自動処理できませんでした（${reason}）。リンク先で内容を確認し、手動で取り込んでください。${summary}`,
      link: pasteLink(text),
    })
    if (notified.created === 0) {
      // Last resort: the order must survive SOMEWHERE the operator can find.
      console.error('[public/order-form] pipeline failed AND no manager notified — raw order follows:\n', text)
    }
    return NextResponse.json({ success: true, reference: null, message: RECEIVED })
  } catch (err) {
    console.error('[public/order-form]', err)
    return NextResponse.json({ success: false, error: '送信中にエラーが発生しました。時間をおいてお試しください。' }, { status: 500 })
  }
}
