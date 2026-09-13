// ============================================
// POST /api/rates/bulk/periods/import
// ============================================
// Loads a periods spreadsheet — one row per dated block — onto the rates it
// names.
//
// REPLACE, NOT MERGE. Each rate named in the file ends up with exactly the
// periods the file gives it. A contract supersedes the previous contract, and
// merging would interleave last year's windows with this year's with no way to
// tell which the operator meant. Rates NOT named in the file are untouched.
//
// `?dryRun=1` validates and reports what WOULD change without writing, which
// is what the preview step calls. Replacing a rate's periods is not something
// to discover after the fact.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import Papa from 'papaparse'
import { PERIOD_SHEETS, parsePeriodRows, type PeriodRowError } from '@/lib/rates/period-csv'
import { sanitizeSeasons, legacyColumnMirror, seasonsForRow } from '@/lib/rates/rate-seasons'
import { sanitizeSupplements, supplementsForRow, type RateSupplement } from '@/lib/rates/supplements'
import { vocabularyItemsForCurrentOrg } from '@/lib/vocabulary-server'
import { requireRole } from '@/lib/auth/current-org'

export const dynamic = 'force-dynamic'

interface RateChange {
  key: string
  name: string
  before: number
  after: number
  /** Supplements the rate carries before / after — after is null when the
   *  file has no supplement columns and the list is left alone. */
  supplementsBefore: number
  supplementsAfter: number | null
}

export async function POST(request: NextRequest) {
  try {
    // Rates are pricing: same gate the rest of the rate surface uses.
    const denied = await requireRole(['admin', 'manager'])
    if (denied) return denied

    const body = await request.json().catch(() => null)
    const entity: unknown = body?.entity
    const csv = typeof body?.csv === 'string' ? body.csv : ''
    const dryRun = Boolean(body?.dryRun)

    if (entity !== 'accommodation' && entity !== 'cruise') {
      return NextResponse.json({ success: false, error: 'entity must be accommodation or cruise' }, { status: 400 })
    }
    if (!csv.trim()) {
      return NextResponse.json({ success: false, error: 'No CSV supplied' }, { status: 400 })
    }

    const config = PERIOD_SHEETS[entity]
    const parsed = Papa.parse<Record<string, unknown>>(csv, {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h.trim(),
    })

    const { byKey, errors, exampleRows, hasSupplementColumns, supplementsByKey } = parsePeriodRows(config, parsed.data ?? [])
    const rowErrors: PeriodRowError[] = [...errors]

    // The list a rate carries follows the file: a key priced anywhere in the
    // rate's periods is on it, named by the agency's CURRENT word where the
    // vocabulary has one (the header's word otherwise). No supplement
    // columns at all = an older sheet; the list is not touched.
    const vocabulary = hasSupplementColumns
      ? await vocabularyItemsForCurrentOrg(entity === 'accommodation' ? 'hotel_supplement' : 'cruise_supplement')
      : []
    const vocabLabel = new Map(vocabulary.map(v => [v.key, v.label]))
    const supplementsFor = (key: string): RateSupplement[] =>
      sanitizeSupplements((supplementsByKey.get(key) ?? []).map(s => ({ key: s.key, name: vocabLabel.get(s.key) ?? s.name })))

    if (byKey.size === 0) {
      return NextResponse.json({
        success: false,
        error: exampleRows > 0
          ? 'This file only contains the example row from the template. Replace it with your own periods.'
          : 'No usable rows in the file.',
        errors: rowErrors,
      }, { status: 400 })
    }

    const supabase = createServerClient()
    const keys = [...byKey.keys()]

    // Which of these rates actually exist, and what they have today — so the
    // preview can say "6 periods replacing 3" rather than just "6 periods".
    const { data: existing, error: fetchError } = config.table === 'accommodation_rates'
      ? await supabase.from('accommodation_rates').select('*').in('service_code', keys)
      : await supabase.from('nile_cruises').select('*').in('cruise_code', keys)

    if (fetchError) {
      console.error('[periods-import] lookup failed:', fetchError.message)
      return NextResponse.json({ success: false, error: 'Import failed' }, { status: 500 })
    }

    const existingByKey = new Map<string, Record<string, unknown>>()
    for (const row of existing ?? []) {
      existingByKey.set(String(row[config.keyColumn]), row)
    }

    // A key the catalog does not have is an error, never a silent skip: the
    // operator would otherwise believe a contract had loaded.
    const changes: RateChange[] = []
    for (const key of keys) {
      const row = existingByKey.get(key)
      if (!row) {
        rowErrors.push({
          row: 0,
          key,
          message: `No ${entity === 'accommodation' ? 'hotel rate' : 'cruise'} with ${config.keyColumn} "${key}". Create it first, then import its periods.`,
        })
        continue
      }
      changes.push({
        key,
        name: String(row[config.displayColumn] ?? key),
        before: seasonsForRow(row, config.entity).length,
        after: byKey.get(key)!.length,
        supplementsBefore: supplementsForRow(row).length,
        supplementsAfter: hasSupplementColumns ? supplementsFor(key).length : null,
      })
    }

    if (dryRun) {
      return NextResponse.json({
        success: rowErrors.length === 0,
        dryRun: true,
        changes,
        errors: rowErrors,
        exampleRowsSkipped: exampleRows,
      })
    }

    let updated = 0
    for (const change of changes) {
      const seasons = sanitizeSeasons(byKey.get(change.key), config.entity)
      if (!seasons) {
        rowErrors.push({ row: 0, key: change.key, message: 'Periods could not be validated; skipped.' })
        continue
      }

      // The first period is mirrored onto the base columns, same as a save
      // from the rates screen, so readers that price without a travel date
      // keep seeing a real rate.
      const patch = {
        seasons,
        ...legacyColumnMirror(seasons, config.entity),
        ...(hasSupplementColumns ? { supplements: supplementsFor(change.key) } : {}),
      }
      const { error: updateError } = config.table === 'accommodation_rates'
        ? await supabase.from('accommodation_rates').update(patch).eq('service_code', change.key)
        : await supabase.from('nile_cruises').update(patch).eq('cruise_code', change.key)

      if (updateError) {
        rowErrors.push({ row: 0, key: change.key, message: updateError.message })
        continue
      }
      updated++
    }

    return NextResponse.json({
      success: rowErrors.length === 0,
      updated,
      changes,
      errors: rowErrors,
    })
  } catch (error) {
    console.error('[periods-import] failed:', error)
    return NextResponse.json({ success: false, error: 'Import failed' }, { status: 500 })
  }
}
