// ============================================
// FX FOR MONEY REPORTS — the shared loading + conversion layer
// ============================================
// lib/fx-conversion.ts is pure (it knows nothing about the database). This file
// is the thin bridge every money report uses so they all behave identically:
//
//   1. load the rate history once per request (loadFxIndex)
//   2. convert each line at the rate on ITS OWN transaction date
//   3. when a line cannot be converted, EXCLUDE it, record an FxHole, and mark
//      the report incomplete — never convert at face value
//
// Step 3 is the whole point. Summing 1,000 EGP into a EUR total as "1,000"
// overstates cost by ~56x; excluding it silently understates cost and overstates
// margin. Only the third option — exclude AND say so — leaves the operator able
// to trust the number they see.

import {
  buildFxIndex,
  convertOnDate,
  emptyFxSummary,
  tallyFx,
  type FxHole,
  type FxIndex,
  type FxSummary,
} from './fx-conversion'

/** Minimal client shape: works with the service-role or an RLS-scoped client. */
type DbClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

/**
 * Load the rate history into an in-memory index.
 *
 * The whole table is loaded rather than one query per pair: 5 currencies give 8
 * stored pairs, so a daily capture is ~2,900 rows a year and one round trip
 * beats N. The 20,000-row cap is a runaway guard, not a window — at that volume
 * it holds roughly seven years.
 *
 * The rows come back newest-first, so if the cap ever truncates it drops the
 * OLDEST history. That would silently turn old trips into FX holes rather than
 * wrong numbers — visible in the report's own `fx_holes`, which is the failure
 * mode to prefer, but raise the cap (or window the query) before it bites.
 */
export async function loadFxIndex(supabase: DbClient): Promise<FxIndex> {
  const { data, error } = await supabase
    .from('exchange_rate_snapshots')
    .select('base_currency, target_currency, rate, captured_at, source')
    .order('captured_at', { ascending: false })
    .limit(20000)
  if (error) {
    // A missing/unreadable history is not fatal: every foreign-currency line
    // becomes a hole and the report says so. That is strictly better than
    // failing the page, and far better than silently summing raw amounts.
    console.warn('⚠️ Could not load exchange rate history:', error.message || error)
    return buildFxIndex([])
  }

  return buildFxIndex(data || [])
}

export interface ConvertedLine {
  /** Converted amount in the reporting currency, or null when unconvertible. */
  amount: number | null
  hole: FxHole | null
}

/**
 * Convert one report line, tallying the basis and building a hole on failure.
 *
 * `fx` is mutated (tally) so a caller can fold a whole list in one pass.
 */
export function convertLine(
  index: FxIndex,
  fx: FxSummary,
  input: {
    amount: unknown
    fromCurrency: string | null | undefined
    toCurrency: string
    date: string | Date | null | undefined
    kind: FxHole['kind']
    reference: string
  },
  /**
   * Optional last resort: a resolver for today's rate, used only when no
   * snapshot old enough exists. Such a line is tallied as 'live' and makes the
   * report non-authoritative (all_historical false) without becoming a hole.
   * Omit it to require historical rates outright.
   */
  liveRate?: (from: string, to: string) => number | null
): ConvertedLine {
  const amount = Number(input.amount)
  const from = (input.fromCurrency || input.toCurrency || 'EUR').toUpperCase()
  const to = (input.toCurrency || 'EUR').toUpperCase()

  if (!Number.isFinite(amount)) {
    // Not a money problem — a missing/garbage number. Treat as zero, not as a
    // hole: there is nothing to convert.
    return { amount: 0, hole: null }
  }

  const conversion = convertOnDate(index, amount, from, to, input.date ?? null, liveRate)
  tallyFx(fx, conversion.basis)

  if (conversion.amount === null) {
    return {
      amount: null,
      hole: {
        kind: input.kind,
        reference: input.reference,
        amount,
        fromCurrency: from,
        toCurrency: to,
        date: typeof input.date === 'string' ? input.date : input.date?.toISOString() ?? null,
        message: `No ${from}/${to} exchange rate on file for ${
          input.date ? String(input.date).slice(0, 10) : 'this date'
        } — excluded from the total.`,
      },
    }
  }

  return { amount: conversion.amount, hole: null }
}

/**
 * The accuracy block every money report returns alongside its numbers, so the
 * UI can render one consistent warning instead of each page inventing its own.
 */
export interface FxReportMeta {
  reporting_currency: string
  fx: FxSummary
  /** Lines excluded from the totals, with the reason. */
  fx_holes: FxHole[]
  /** False when at least one line is missing or approximated. */
  complete: boolean
}

export function buildFxMeta(
  reportingCurrency: string,
  fx: FxSummary,
  holes: FxHole[]
): FxReportMeta {
  return {
    reporting_currency: reportingCurrency.toUpperCase(),
    fx,
    fx_holes: holes,
    complete: holes.length === 0 && fx.unconverted === 0,
  }
}

export { emptyFxSummary, type FxHole, type FxSummary, type FxIndex }
