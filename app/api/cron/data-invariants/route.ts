// ============================================
// API: /api/cron/data-invariants — nightly data-integrity sweep
// ============================================
// Every check below maps to a data-drift bug the 2026 audits actually found
// (silently, sometimes months late). This makes the invariants a nightly
// alarm instead of an annual archaeology project.
//
// Bearer-auth like the other crons (CRON_SECRET; open when unset, matching
// convention). Schedule it nightly on the deploy host, e.g.:
//   15 3 * * * curl -s -H "Authorization: Bearer $CRON_SECRET" \
//     https://autoura.net/api/cron/data-invariants
//
// Volumes are small (single-operator dataset), so checks run in TypeScript
// over narrow column selections — no SQL RPC/migration required. If a table
// ever outgrows in-memory checking, move that check into an RPC.
//
// Response: 200 { ok, violations, warnings, scanned } — ok:false when any
// violation exists (the cron log + optional email are the alerting channel;
// a 500 would read as "endpoint broken", not "data broken").
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmailInternal } from '@/lib/email-send'

export const dynamic = 'force-dynamic'

const EPSILON = 0.01 // money comparisons

type Finding = { check: string; table: string; id?: string; detail: string }

function money(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Natural keys mirror the route-level dedup rules (PR #37 + the 20260702
// unique-index migration). transportation_rates has NO DB unique index (its
// key is conditional), so this nightly check is that table's only global
// duplicate detection.
function guideRateKey(r: any): string {
  return [r.supplier_id ?? 'null', r.guide_language, r.guide_type, r.tour_duration, r.city ?? ''].join('|')
}
function activityRateKey(r: any): string {
  return [r.supplier_id ?? 'null', String(r.activity_name ?? '').toLowerCase(), r.city ?? ''].join('|')
}
function transportRateKey(r: any): string {
  const intercity = r.service_type === 'intercity' || r.service_type === 'intercity_with_sightseeing'
  const scope = intercity
    ? [String(r.origin_city ?? '').toLowerCase(), String(r.destination_city ?? '').toLowerCase()]
    : [String(r.city ?? '').toLowerCase(), r.duration ?? '', r.area ?? '']
  // service_code IS part of the real identity: live data legitimately holds
  // many rows per city/service_type distinguished only by service_code
  // (e.g. 15 named Aswan city-tour routes). The POST /api/rates/transportation
  // dedup key uses this same shape — keep the two in sync.
  return [r.supplier_id ?? 'null', r.service_type, String(r.service_code ?? '').toLowerCase(), ...scope].join('|')
}

function findDuplicates(rows: any[], keyFn: (r: any) => string): Map<string, any[]> {
  const byKey = new Map<string, any[]>()
  for (const r of rows) {
    const k = keyFn(r)
    byKey.set(k, [...(byKey.get(k) ?? []), r])
  }
  return new Map([...byKey].filter(([, v]) => v.length > 1))
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const violations: Finding[] = []
  const warnings: Finding[] = []

  const [itins, days, services, invoices, invoicePayments, guideRates, activityRates, transportRates] =
    await Promise.all([
      supabase.from('itineraries').select('id, org_id, total_cost, supplier_cost, total_paid, total_days, start_date, end_date, status'),
      supabase.from('itinerary_days').select('id, itinerary_id, day_number'),
      supabase.from('itinerary_services').select('id, itinerary_day_id'),
      supabase.from('invoices').select('id, invoice_number, status, total_amount, amount_paid, balance_due'),
      supabase.from('invoice_payments').select('id, invoice_id, amount'),
      supabase.from('guide_rates').select('id, supplier_id, guide_language, guide_type, tour_duration, city'),
      supabase.from('activity_rates').select('id, supplier_id, activity_name, city'),
      supabase.from('transportation_rates').select('id, supplier_id, service_type, service_code, city, origin_city, destination_city, duration, area'),
    ])

  const readErrors = [itins, days, services, invoices, invoicePayments, guideRates, activityRates, transportRates]
    .map((r, i) => ({ i, error: r.error }))
    .filter((r) => r.error)
  if (readErrors.length) {
    // Can't assert invariants over data we failed to read — that's an
    // infrastructure failure, so 500 (unlike data violations, which are 200).
    console.error('data-invariants: table reads failed:', readErrors.map((r) => r.error?.message))
    return NextResponse.json(
      { ok: false, error: 'One or more table reads failed', details: readErrors.map((r) => r.error?.message) },
      { status: 500 }
    )
  }

  // ── Itineraries ────────────────────────────────────────────────────────────
  const itinIds = new Set<string>()
  for (const it of itins.data ?? []) {
    itinIds.add(it.id)
    if (!it.org_id) {
      violations.push({ check: 'itinerary_org_id_null', table: 'itineraries', id: it.id, detail: 'org_id is NULL — invisible to org-scoped reads (RLS + API filters)' })
    }
    const cost = money(it.supplier_cost)
    const price = money(it.total_cost)
    if (cost > EPSILON && price > EPSILON && price < cost - EPSILON) {
      violations.push({ check: 'itinerary_price_below_cost', table: 'itineraries', id: it.id, detail: `total_cost (client price) ${price} < supplier_cost ${cost} — margin inversion` })
    }
    if (price > EPSILON && money(it.total_paid) > price + EPSILON) {
      warnings.push({ check: 'itinerary_overpaid', table: 'itineraries', id: it.id, detail: `total_paid ${money(it.total_paid)} exceeds total_cost ${price}` })
    }
    if (it.start_date && it.end_date) {
      const span = Math.round((Date.parse(it.end_date) - Date.parse(it.start_date)) / 86_400_000) + 1
      if (span < 1) {
        violations.push({ check: 'itinerary_dates_inverted', table: 'itineraries', id: it.id, detail: `end_date ${it.end_date} before start_date ${it.start_date}` })
      } else if (Number(it.total_days) && span !== Number(it.total_days)) {
        warnings.push({ check: 'itinerary_daycount_drift', table: 'itineraries', id: it.id, detail: `date span is ${span} days but total_days=${it.total_days} (stale end_date bug class)` })
      }
    }
  }

  // ── Days: orphans + duplicate day numbers ──────────────────────────────────
  const dayIds = new Set<string>()
  const dayNumSeen = new Set<string>()
  for (const d of days.data ?? []) {
    dayIds.add(d.id)
    if (!itinIds.has(d.itinerary_id)) {
      violations.push({ check: 'day_orphaned', table: 'itinerary_days', id: d.id, detail: `itinerary_id ${d.itinerary_id} does not exist` })
    }
    const key = `${d.itinerary_id}#${d.day_number}`
    if (dayNumSeen.has(key)) {
      violations.push({ check: 'day_number_duplicate', table: 'itinerary_days', id: d.id, detail: `duplicate day_number ${d.day_number} within itinerary ${d.itinerary_id}` })
    }
    dayNumSeen.add(key)
  }

  // ── Services: orphans ──────────────────────────────────────────────────────
  for (const s of services.data ?? []) {
    if (!dayIds.has(s.itinerary_day_id)) {
      violations.push({ check: 'service_orphaned', table: 'itinerary_services', id: s.id, detail: `itinerary_day_id ${s.itinerary_day_id} does not exist` })
    }
  }

  // ── Invoices: internal arithmetic + payment reconciliation ────────────────
  const paymentsByInvoice = new Map<string, number>()
  for (const p of invoicePayments.data ?? []) {
    paymentsByInvoice.set(p.invoice_id, (paymentsByInvoice.get(p.invoice_id) ?? 0) + money(p.amount))
  }
  for (const inv of invoices.data ?? []) {
    const expectedBalance = money(inv.total_amount) - money(inv.amount_paid)
    if (Math.abs(money(inv.balance_due) - expectedBalance) > EPSILON) {
      violations.push({ check: 'invoice_balance_mismatch', table: 'invoices', id: inv.id, detail: `${inv.invoice_number}: balance_due ${money(inv.balance_due)} ≠ total_amount − amount_paid = ${expectedBalance.toFixed(2)}` })
    }
    if (inv.status === 'paid' && money(inv.balance_due) > EPSILON) {
      violations.push({ check: 'invoice_paid_with_balance', table: 'invoices', id: inv.id, detail: `${inv.invoice_number}: status=paid but balance_due=${money(inv.balance_due)}` })
    }
    const recorded = paymentsByInvoice.get(inv.id)
    if (recorded !== undefined && Math.abs(recorded - money(inv.amount_paid)) > EPSILON) {
      violations.push({ check: 'invoice_payments_sum_mismatch', table: 'invoices', id: inv.id, detail: `${inv.invoice_number}: Σ invoice_payments ${recorded.toFixed(2)} ≠ amount_paid ${money(inv.amount_paid)}` })
    }
  }

  // ── Rate tables: duplicate natural keys ────────────────────────────────────
  for (const [rows, keyFn, table] of [
    [guideRates.data ?? [], guideRateKey, 'guide_rates'],
    [activityRates.data ?? [], activityRateKey, 'activity_rates'],
    [transportRates.data ?? [], transportRateKey, 'transportation_rates'],
  ] as const) {
    for (const [key, dupes] of findDuplicates([...rows], keyFn)) {
      violations.push({ check: 'rate_duplicate_natural_key', table, detail: `${dupes.length} rows share natural key [${key}]: ids ${dupes.map((d: any) => d.id).join(', ')}` })
    }
  }

  const scanned = {
    itineraries: itins.data?.length ?? 0,
    itinerary_days: days.data?.length ?? 0,
    itinerary_services: services.data?.length ?? 0,
    invoices: invoices.data?.length ?? 0,
    invoice_payments: invoicePayments.data?.length ?? 0,
    guide_rates: guideRates.data?.length ?? 0,
    activity_rates: activityRates.data?.length ?? 0,
    transportation_rates: transportRates.data?.length ?? 0,
  }

  const ok = violations.length === 0
  if (!ok) {
    console.error(`data-invariants: ${violations.length} violation(s):`, violations)
    // Best-effort nightly alert; never let email failure mask the report.
    if (process.env.BUSINESS_EMAIL) {
      try {
        await sendEmailInternal({
          to: process.env.BUSINESS_EMAIL,
          subject: `⚠️ Data invariants: ${violations.length} violation(s) found`,
          html: `<p>The nightly data-integrity sweep found ${violations.length} violation(s):</p><ul>${violations
            .map((v) => `<li><b>${v.check}</b> (${v.table}${v.id ? ` ${v.id}` : ''}): ${v.detail}</li>`)
            .join('')}</ul><p>Warnings: ${warnings.length}. Full report in the cron response/log.</p>`,
        })
      } catch (e) {
        console.error('data-invariants: alert email failed:', e)
      }
    }
  }

  return NextResponse.json({ ok, violations, warnings, scanned, checkedAt: new Date().toISOString() })
}
