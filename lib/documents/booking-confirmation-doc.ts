// ============================================
// The 予約確認書兼請求書, assembled from the trip
// ============================================
// I/O here, layout in the template (lib/documents/types.ts). What one trip
// supplies:
//   - who and when: itinerary client, contact, departure date
//   - the tour: its linked programme (itineraries.template_id) — code, name,
//     and the stays the 日程表 already pairs with hotels (same rows, so the
//     two documents can never list different hotels)
//   - the names: the booking's passengers, romaji as on the passport
//   - the flights: itineraries.flights (lib/itineraries/flights.ts)
//   - the money: ONE invoice for the trip — its lines are the price stack,
//     its type decides 申込金/残金 (lib/invoice-pdf-generator tripCostBreakdown)
//   - the bank and the 備考: the company profile (document_contacts
//     bank_transfer / confirmation_remarks), the 備考 defaulting to the office's
// Anything the office types in the dialog wins over the record.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getTemplate } from './registry'
import { inlineImage } from './inline-image'
import { loadTripStays } from './trip-stays'
import { assembleProgramItinerary, type OrgBranding } from './assemble-program-itinerary'
import { orgHasDocumentTemplate } from './org-templates'
import { getAtsDocumentImage, getJapaneseFontFace } from '@/lib/pdf-fonts-server'
import { customerFacingOrgName } from '@/lib/org-name'
import { formatMoney } from '@/lib/currency-totals'
import { tripCostBreakdown, effectiveDueDate } from '@/lib/invoice-pdf-generator'
import { airlineLegend, normaliseTripFlights } from '@/lib/itineraries/flights'
import {
  ATS_COMPANY_LINE,
  DEFAULT_BANK_LINES,
  DEFAULT_CONFIRMATION_REMARKS,
  type BookingConfirmationContext,
} from './templates/ats-booking-confirmation'
import type { DocumentPage } from './types'

const SLUG = 'ats-booking-confirmation'
const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土']

export class BookingConfirmationError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'BookingConfirmationError'
  }
}

/** A YYYY-MM-DD read as a calendar date (UTC), or null. */
function day(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const d = new Date(`${String(raw).slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** 「2026年9月29日（火）」, or 「2026年9月29日」 without the weekday. */
export function jaDate(raw: string | null | undefined, withWeekday = false): string {
  const d = day(raw)
  if (!d) return ''
  const base = `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`
  return withWeekday ? `${base}（${WEEKDAYS_JA[d.getUTCDay()]}）` : base
}

/** 「2026/9/29」 — the sheet's own date format (its yyyy/m/d cells). */
export function slashDate(raw: string | null | undefined): string {
  const d = day(raw)
  return d ? `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}` : ''
}

/** Today on the server's calendar as YYYY-MM-DD — the 作成日 default. */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export interface ConfirmationOverrides {
  invoice_id?: string | null
  staff?: string | null
  created_date?: string | null
  representative?: string | null
  rooms?: string | null
  room_type?: string | null
}

type LineItem = { description?: string; quantity?: number | string; unit_price?: number | string; amount?: number | string }

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : 0
}

/** The two payment boxes the sheet always prints. A deposit invoice fills
 *  both; a final one prints what was paid and the balance; a single invoice
 *  — or none — is all balance, as the sheet's own 残金 = 合計 − 申込金 has it.
 *  Deposit + balance = trip price exactly (tripCostBreakdown subtracts). */
export function confirmationPayments(
  invoice: {
    invoice_type?: string | null
    total_amount: number | string
    deposit_percent?: number | null
    full_trip_cost?: number | string | null
    due_date?: string | null
    balance_due_date?: string | null
  } | null,
  currency: string
): { total: number; deposit: BookingConfirmationContext['deposit']; balance: BookingConfirmationContext['balance'] } {
  const money = (n: number) => formatMoney(n, currency)
  const none = { amount: '', due: '' }
  if (!invoice) return { total: 0, deposit: none, balance: { amount: money(0), due: '' } }
  const type = invoice.invoice_type === 'deposit' || invoice.invoice_type === 'final' ? invoice.invoice_type : 'standard'
  if (type === 'standard') {
    const total = num(invoice.total_amount)
    return { total, deposit: none, balance: { amount: money(total), due: slashDate(invoice.due_date) } }
  }
  const b = tripCostBreakdown(invoice, type)
  if (type === 'final') {
    return {
      total: b.fullTripCost,
      deposit: { amount: money(b.depositAmount), due: '' },
      balance: { amount: money(b.balanceAmount), due: slashDate(effectiveDueDate(invoice, 'final')) },
    }
  }
  return {
    total: b.fullTripCost,
    deposit: { amount: money(b.depositAmount), due: slashDate(invoice.due_date) },
    balance: { amount: money(b.balanceAmount), due: slashDate(invoice.balance_due_date) },
  }
}

interface StandardRow {
  label: string
  /** The sheet's printed unit price, used until an invoice line fills the row. */
  unit?: number
  qty?: number
  match: RegExp | null
  /** Print the invoice line's own wording (the airport tax differs by airport). */
  ownLabel?: boolean
}

/** The sheet's nine price rows (A53–A61), in its order and with its standard
 *  unit prices. Row 6 is the sheet's blank row; anything on the invoice that
 *  is none of the others is printed there. */
export const STANDARD_CHARGE_ROWS: StandardRow[] = [
  { label: '海外旅行代金', match: /旅行代金|ツアー代金|tour|package/i },
  { label: '燃油サーチャージ・航空保険料等', unit: 109200, match: /燃油|サーチャージ|fuel|surcharge/i },
  { label: '成田空港使用税', unit: 3160, match: /空港使用税|空港使用料|施設使用料|airport (tax|fee|charge)/i, ownLabel: true },
  { label: '国際観光旅客税', unit: 3000, match: /国際観光旅客税|departure tax/i },
  { label: '海外空港諸税等', unit: 10800, match: /海外空港|空港諸税|overseas/i },
  { label: '', match: null },
  { label: '日本語ガイド・英語ドライバーへのチップ (一組）', qty: 1, match: /(ガイド|ドライバー).*チップ|guide.*tip|driver.*tip/i },
  { label: 'ナイル川クルーズ船チップ', match: /クルーズ.*チップ|cruise.*tip/i },
  { label: '査証（ビザ）実費代　US＄36 現地カード払い', match: /査証|ビザ|visa/i },
]

/** Which row a line belongs to: the specific rows first, the tour price last
 *  ("海外旅行代金" is the catch-all word, so it must not swallow the others). */
const MATCH_ORDER = [1, 2, 3, 4, 6, 7, 8, 0]

/**
 * The sheet's price table from an invoice's lines. Every standard row always
 * prints — with the sheet's unit price and ¥0 until the invoice fills it,
 * exactly as the Excel does before the office types the numbers in.
 */
export function confirmationCharges(
  lines: LineItem[],
  currency: string
): { rows: BookingConfirmationContext['charges']; sum: number } {
  const money = (n: number) => formatMoney(n, currency)
  const filled = new Map<number, LineItem>()
  const extra: LineItem[] = []
  for (const line of lines) {
    const text = String(line.description ?? '')
    const row = MATCH_ORDER.find(i => !filled.has(i) && STANDARD_CHARGE_ROWS[i].match?.test(text))
    if (row === undefined) extra.push(line)
    else filled.set(row, line)
  }
  const has = (v: unknown) => v !== undefined && v !== null && v !== ''
  const fromLine = (l: LineItem, label: string) => ({
    description: label,
    unit_price: has(l.unit_price) ? money(num(l.unit_price)) : '',
    quantity: has(l.quantity) ? String(num(l.quantity)) : '',
    amount: money(num(l.amount)),
  })

  let sum = 0
  const rows: BookingConfirmationContext['charges'] = []
  STANDARD_CHARGE_ROWS.forEach((std, i) => {
    if (std.match === null) {
      // The blank row: the invoice's other lines, or the sheet's empty row.
      if (extra.length === 0) rows.push({ description: '', unit_price: '', quantity: '', amount: '' })
      for (const l of extra) {
        rows.push(fromLine(l, String(l.description ?? '').trim()))
        sum += num(l.amount)
      }
      return
    }
    const line = filled.get(i)
    if (line) {
      rows.push(fromLine(line, std.ownLabel ? String(line.description ?? '').trim() || std.label : std.label))
      sum += num(line.amount)
      return
    }
    rows.push({
      description: std.label,
      unit_price: std.unit ? money(std.unit) : '',
      quantity: std.qty ? String(std.qty) : '',
      amount: money(0),
    })
  })
  return { rows, sum }
}

export async function buildBookingConfirmationHtml(input: {
  supabase: SupabaseClient
  orgId: string
  itineraryId: string
  overrides: ConfirmationOverrides
}): Promise<{ html: string; page: DocumentPage; fileCode: string }> {
  const { supabase, orgId, itineraryId, overrides } = input

  const template = getTemplate(SLUG)
  if (!template) throw new BookingConfirmationError('Template not found', 404)
  if (!(await orgHasDocumentTemplate(supabase, orgId, SLUG))) {
    throw new BookingConfirmationError('This document is not enabled for your organization', 403)
  }

  const { data: trip } = await supabase
    .from('itineraries')
    .select('id, itinerary_code, client_name, client_email, client_phone, trip_name, start_date, currency, template_id, flights')
    .eq('id', itineraryId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!trip) throw new BookingConfirmationError('Trip not found', 404)

  const [programme, org, party, invoice] = await Promise.all([
    trip.template_id
      ? supabase
          .from('tour_templates')
          .select('template_code, template_name, itinerary, hotels')
          .eq('id', trip.template_id)
          .eq('org_id', orgId)
          .maybeSingle()
          .then(r => r.data)
      : Promise.resolve(null),
    supabase
      .from('organizations')
      .select('name, logo_url, company_phone, contact_email, company_website, company_address, document_contacts, offices')
      .eq('id', orgId)
      .maybeSingle()
      .then(r => r.data as (OrgBranding & { document_contacts: Record<string, string> | null }) | null),
    loadBookingParty(supabase, orgId, itineraryId),
    loadInvoice(supabase, orgId, itineraryId, overrides.invoice_id ?? null),
  ])

  // The stays come from the same assembler as the 日程表, so a hotel the trip
  // was sold with prints identically on both documents.
  const stays = programme
    ? assembleProgramItinerary({
        template_code: programme.template_code,
        itinerary: programme.itinerary as never,
        hotels: (programme.hotels as never) ?? null,
        trip_stays: await loadTripStays(supabase, itineraryId, orgId),
        created_date: '',
        font_face_css: '',
        org: null,
        departure: { start_date: trip.start_date, cairo_guide: null, south_guide: null, author: null },
      }).hotel_rows
    : []

  const flights = normaliseTripFlights(trip.flights) ?? []
  const currency = String(invoice?.currency || trip.currency || 'JPY')
  const money = (n: number) => formatMoney(n, currency)

  const lines = (Array.isArray(invoice?.line_items) ? (invoice!.line_items as LineItem[]) : []).filter(
    l => (l.description ?? '').trim() || num(l.amount)
  )
  // The balance date lives on the booking (its payment schedule), not the
  // invoice — the same join /api/invoices/[id] makes.
  const pay = confirmationPayments(invoice ? ({ ...invoice, balance_due_date: party.balance_due_date } as never) : null, currency)
  const charges = confirmationCharges(lines, currency)
  const [logo, seal] = await Promise.all([getAtsDocumentImage('ats-logo.jpeg'), getAtsDocumentImage('ats-seal.jpeg')])

  const contacts = org?.document_contacts ?? {}

  const context: BookingConfirmationContext = {
    font_face_css: await getJapaneseFontFace(),
    // The sheet's own logo and company line, whatever the profile's logo is.
    letterhead: { ...(await documentLetterhead(org)), logo_url: logo, company_name: ATS_COMPANY_LINE },
    seal_url: seal,
    representative: (overrides.representative ?? trip.client_name ?? '').trim().replace(/様$/, ''),
    staff: (overrides.staff ?? '').trim(),
    created_date: slashDate(overrides.created_date || todayISO()),
    phone: (trip.client_phone ?? '').trim(),
    email: (trip.client_email ?? '').trim(),
    departure_date: slashDate(trip.start_date),
    tour_code: programme?.template_code ?? trip.itinerary_code ?? '',
    tour_name: programme?.template_name ?? trip.trip_name ?? '',
    travellers: party.names,
    flights: flights.map(f => {
      const d = day(f.date)
      return {
        date: d ? `${d.getUTCMonth() + 1}/${d.getUTCDate()}` : '',
        weekday: d ? WEEKDAYS_JA[d.getUTCDay()] : '',
        from: f.from,
        to: f.to,
        flight_no: f.flight_no,
        depart: f.depart,
        arrive: f.arrive,
        status: f.status,
      }
    }),
    airline_legend: airlineLegend(flights),
    hotels: stays.map(h => ({
      // The confirmation's own word for a night aboard (the 日程表 says 船中泊).
      city: h.city === '船中泊' ? 'クルーズ船' : h.city ?? '',
      check_in: h.check_in === '/' ? '' : h.check_in,
      check_out: h.check_out === '/' ? '' : h.check_out,
      nights: h.nights ? String(h.nights) : '',
      rooms: (overrides.rooms ?? '').trim(),
      room_type: (overrides.room_type ?? '').trim(),
      hotel: h.hotel,
    })),
    // The company's standing 備考 (Company profile), else the office's own.
    remarks: String(contacts.confirmation_remarks?.trim() ? contacts.confirmation_remarks : DEFAULT_CONFIRMATION_REMARKS)
      .split('\n')
      .map(l => l.trimEnd())
      .filter(l => l.trim()),
    charges: charges.rows,
    // Invoice: the trip price (deposit + balance). None: the rows' ¥0.
    total: money(invoice ? pay.total : charges.sum),
    // The company profile's 振込先, else the sheet's own account.
    bank_lines: (() => {
      const own = String(contacts.bank_transfer ?? '')
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean)
      return own.length ? own : DEFAULT_BANK_LINES
    })(),
    deposit: pay.deposit,
    balance: pay.balance,
  }

  return {
    html: template.render(context),
    page: template.page,
    fileCode: context.tour_code || 'booking',
  }
}

/** The company letterhead every ATS document prints: logo (inlined — the
 *  renderer fetches nothing), name, offices, email and website. */
export async function documentLetterhead(org: OrgBranding | null): Promise<BookingConfirmationContext['letterhead']> {
  return {
    logo_url: await inlineImage(org?.logo_url ?? null),
    company_name: customerFacingOrgName(org?.name ?? undefined),
    offices: (org?.offices ?? [])
      .map(o => ({
        label: (o.label ?? '').trim(),
        postal_code: (o.postal_code ?? '').trim(),
        address: (o.address ?? '').trim(),
        tel: (o.tel ?? '').trim(),
        fax: (o.fax ?? '').trim(),
      }))
      .filter(o => o.label || o.address || o.tel),
    lines: [org?.company_address, org?.company_phone].map(l => (l ?? '').trim()).filter(Boolean),
    email: (org?.contact_email ?? '').trim(),
    website: (org?.company_website ?? '').trim(),
  }
}

/** The trip's live booking: its travellers' romaji names as the passport
 *  reads them — FAMILY GIVEN, upper case, lead traveller first — and its
 *  balance date. No booking = an empty grid the office fills by hand. */
async function loadBookingParty(
  supabase: SupabaseClient,
  orgId: string,
  itineraryId: string
): Promise<{ names: string[]; balance_due_date: string | null }> {
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, cancelled_at, balance_due_date')
    .eq('itinerary_id', itineraryId)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  const booking = (bookings ?? []).find(b => !b.cancelled_at) ?? null
  if (!booking) return { names: [], balance_due_date: null }

  const { data: pax } = await supabase
    .from('booking_passengers')
    .select('first_name, last_name, is_lead_passenger, created_at')
    .eq('booking_id', booking.id)
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })
  const names = [...(pax ?? [])]
    .sort((a, b) => Number(!!b.is_lead_passenger) - Number(!!a.is_lead_passenger))
    .map(p => `${(p.last_name ?? '').trim()} ${(p.first_name ?? '').trim()}`.trim().toUpperCase())
    .filter(Boolean)
  return { names, balance_due_date: (booking.balance_due_date as string | null) ?? null }
}

/** The invoice named in the dialog, else the trip's newest that is not
 *  cancelled. A draft counts — the office prints the confirmation before it
 *  marks the invoice sent. */
async function loadInvoice(supabase: SupabaseClient, orgId: string, itineraryId: string, invoiceId: string | null) {
  let query = supabase
    .from('invoices')
    .select('id, invoice_type, line_items, total_amount, currency, deposit_percent, full_trip_cost, due_date, status, created_at')
    .eq('itinerary_id', itineraryId)
    .eq('org_id', orgId)
  if (invoiceId) query = query.eq('id', invoiceId)
  const { data } = await query.order('created_at', { ascending: false })
  return (data ?? []).find(i => i.status !== 'cancelled') ?? null
}
