// ============================================
// EXCHANGE RATE REFRESH — shared job body
// ============================================
// Fetches current market rates and writes them to BOTH rate tables:
//
//   exchange_rates            upserted — one live row per pair, "what is the
//                             rate now". Backs live display and conversion
//                             fallback.
//   exchange_rate_snapshots   appended — immutable history, "what was the rate
//                             on the day this hotel was paid". Backs the
//                             per-trip P&L and the financial reports.
//
// The history is the point. Without it every money report has to use today's
// rate for a cost paid three months ago, which reports a margin the operator
// never earned.
//
// Extracted from the route handlers so two callers share one implementation:
//   - POST /api/exchange-rates/refresh       (admin UI, session-authenticated)
//   - POST /api/cron/refresh-exchange-rates  (scheduled, CRON_SECRET)
//
// The second exists because middleware.ts gates every /api/* route behind a
// session except a small self-authenticating allowlist, and '/api/cron/' is the
// registered prefix for secret-authenticated jobs.

import { fetchAllExchangeRates } from './exchange-rate-api'
import { buildSnapshotRows } from './currency-service'

/** Don't re-hit the upstream API if the live rates are younger than this. */
const FRESHNESS_HOURS = 1

export interface RefreshResult {
  success: boolean
  skipped: boolean
  message: string
  fetchedAt?: string
  /** Pairs written to the live table. */
  ratesRefreshed: number
  /** Rows appended to the immutable history. 0 means the P&L gained nothing. */
  snapshotsWritten: number
  /** Set when the history write failed — the refresh still counts as success. */
  snapshotError?: string
  rates?: unknown[]
  error?: string
}

/** Minimal shape of the service-role client this job needs. */
type AdminClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

/**
 * Run one refresh cycle.
 *
 * Never throws for an upstream/database problem — returns a result object so
 * both callers can shape their own HTTP response and a cron run can log a
 * precise reason.
 */
export async function refreshExchangeRates(
  supabaseAdmin: AdminClient,
  options: { force?: boolean; apiKey?: string } = {}
): Promise<RefreshResult> {
  const { force = false, apiKey } = options

  try {
    // ---------- Freshness guard ----------
    if (!force) {
      const { data: newest } = await supabaseAdmin
        .from('exchange_rates')
        .select('api_fetched_at')
        .order('api_fetched_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (newest?.api_fetched_at) {
        const lastFetch = new Date(newest.api_fetched_at)
        const hoursSince = (Date.now() - lastFetch.getTime()) / (1000 * 60 * 60)

        if (hoursSince < FRESHNESS_HOURS) {
          return {
            success: true,
            skipped: true,
            message: 'Rates are fresh, no refresh needed',
            fetchedAt: lastFetch.toISOString(),
            ratesRefreshed: 0,
            snapshotsWritten: 0,
          }
        }
      }
    }

    // ---------- Fetch ----------
    const fetchedRates = await fetchAllExchangeRates(apiKey)

    if (fetchedRates.length === 0) {
      return {
        success: false,
        skipped: false,
        message: 'No rates fetched from API',
        ratesRefreshed: 0,
        snapshotsWritten: 0,
        error: 'No rates fetched from API',
      }
    }

    const now = new Date().toISOString()

    // ---------- Live table (upsert on the pair) ----------
    // uq_exchange_rates_pair makes this a single statement instead of a
    // select-then-update per pair.
    const liveRows = fetchedRates.map(rate => ({
      base_currency: rate.base_currency,
      target_currency: rate.target_currency,
      rate: rate.rate,
      source: 'api',
      api_fetched_at: now,
      last_updated_at: now,
      is_active: true,
    }))

    const { error: liveError } = await supabaseAdmin
      .from('exchange_rates')
      .upsert(liveRows, { onConflict: 'base_currency,target_currency' })

    if (liveError) {
      return {
        success: false,
        skipped: false,
        message: 'Failed to write live rates',
        ratesRefreshed: 0,
        snapshotsWritten: 0,
        error: liveError.message || String(liveError),
      }
    }

    // ---------- History (append) ----------
    // Best-effort relative to the live write: the live rates are already
    // updated and useful. But it IS reported, because silent failure here
    // degrades every future margin calculation.
    const snapshotRows = buildSnapshotRows(fetchedRates, now, 'er-api')
    let snapshotsWritten = 0
    let snapshotError: string | undefined

    if (snapshotRows.length > 0) {
      const { error } = await supabaseAdmin
        .from('exchange_rate_snapshots')
        // Same pair at the same instant is the same observation — a double run
        // must not duplicate history (uq_exchange_rate_snapshots_observation).
        .upsert(snapshotRows, {
          onConflict: 'base_currency,target_currency,captured_at',
          ignoreDuplicates: true,
        })

      if (error) {
        snapshotError = error.message || String(error)
        console.error('⚠️ Failed to persist exchange rate snapshots:', error)
      } else {
        snapshotsWritten = snapshotRows.length
      }
    }

    // ---------- Read back ----------
    const { data: updatedRates, error: readError } = await supabaseAdmin
      .from('exchange_rates')
      .select('*')
      .eq('is_active', true)
      .order('base_currency')
      .order('target_currency')

    if (readError) {
      // The write succeeded; only the read-back failed.
      console.error('Error reading back exchange rates:', readError)
    }

    return {
      success: true,
      skipped: false,
      message: `Refreshed ${fetchedRates.length} exchange rates`,
      fetchedAt: now,
      ratesRefreshed: fetchedRates.length,
      snapshotsWritten,
      snapshotError,
      rates: updatedRates || undefined,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Error refreshing exchange rates:', error)
    return {
      success: false,
      skipped: false,
      message: 'Failed to refresh rates',
      ratesRefreshed: 0,
      snapshotsWritten: 0,
      error: message,
    }
  }
}
