import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { RATE_TABLE_CONFIGS, validateImportData, isExampleRow } from '@/lib/bulk-rate-service'
import type { ImportResult, ValidationError } from '@/lib/bulk-rate-service'
import Papa from 'papaparse'
import { validateRatePayload } from '@/lib/rate-validation'
import { batchResolveSuppliers } from '@/lib/suppliers/resolve-supplier'
import { getServerLocale, lookupServerMessage } from '@/lib/i18n/server-messages'

const supabase = createServerClient()

/**
 * POST /api/rates/bulk/import
 * Body: { table: string, csvData: string, dryRun?: boolean }
 *
 * Validates and upserts CSV data into a rate table.
 * Uses service_code (or cruise_code for nile_cruises) as the unique key for matching.
 * If dryRun is true, validates only without inserting.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { table, csvData, dryRun = false } = body

    if (!table || !RATE_TABLE_CONFIGS[table]) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid table. Supported tables: ${Object.keys(RATE_TABLE_CONFIGS).join(', ')}`,
        },
        { status: 400 }
      )
    }

    if (!csvData || typeof csvData !== 'string') {
      return NextResponse.json(
        { success: false, error: 'csvData is required and must be a string' },
        { status: 400 }
      )
    }

    const config = RATE_TABLE_CONFIGS[table]

    // Parse CSV
    const parsed = Papa.parse<Record<string, string>>(csvData, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim(),
    })

    if (parsed.errors.length > 0) {
      const parseErrors = parsed.errors.slice(0, 10).map((e: any) => ({
        row: e.row ? e.row + 2 : 0,
        column: '',
        message: e.message || 'CSV parse error',
      }))
      return NextResponse.json(
        {
          success: false,
          error: 'CSV parsing failed',
          details: parseErrors,
        },
        { status: 400 }
      )
    }

    const rows = parsed.data

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'CSV contains no data rows' },
        { status: 400 }
      )
    }

    // Validate
    const preview = validateImportData(rows, config)

    // Phase 3 durability: supplier resolution. The bulk-import path used to
    // upsert supplier_name verbatim with supplier_id NULL, which is what
    // produced the 102-row NULL spike on 2026-06-23 that started this work.
    // Resolve per-row BEFORE the dry-run preview is returned so unresolved
    // names surface as validation errors in the operator's existing preview,
    // not as silent NULL writes.
    //
    // Rules:
    //   - row has explicit supplier_id → confirm it exists in suppliers, else error
    //   - row has supplier_name (no id) → resolve by lower(btrim(name)); exact-1 → set id; 0 or 2+ → error
    //   - row has neither → pass through (legitimate supplier-less row)
    const parsedRows = preview.parsedValidRows ?? []
    const resolution = await batchResolveSuppliers(parsedRows, supabase)
    const supplierErrors: ValidationError[] = []
    const indicesToDemote = new Set<number>()
    const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().trim()
    const locale = await getServerLocale()

    parsedRows.forEach((row, idx) => {
      const rowNum = idx + 2
      const idValue = typeof row.supplier_id === 'string' ? row.supplier_id.trim() : ''
      const nameValue = typeof row.supplier_name === 'string' ? row.supplier_name : ''

      if (idValue) {
        if (resolution.unknownIds.has(idValue)) {
          supplierErrors.push({ row: rowNum, column: 'supplier_id', message: lookupServerMessage(locale, 'rates.common.errors.supplierIdNotFound', { id: idValue }) })
          indicesToDemote.add(idx)
        }
        return
      }

      if (!nameValue) return

      const normName = norm(nameValue)
      if (resolution.resolvedIdByName.has(normName)) {
        row.supplier_id = resolution.resolvedIdByName.get(normName)
        return
      }
      if (resolution.ambiguousNames.has(normName)) {
        const candidates = resolution.ambiguousNames.get(normName)!
        const idList = candidates.map((c) => `${c.id} (${c.name})`).join(', ')
        supplierErrors.push({ row: rowNum, column: 'supplier_name', message: lookupServerMessage(locale, 'rates.common.errors.supplierNameAmbiguous', { name: nameValue, count: candidates.length, candidates: idList }) })
        indicesToDemote.add(idx)
        return
      }
      if (resolution.noMatchNames.has(normName)) {
        supplierErrors.push({ row: rowNum, column: 'supplier_name', message: lookupServerMessage(locale, 'rates.common.errors.supplierNameNoMatchBulk', { name: nameValue }) })
        indicesToDemote.add(idx)
        return
      }
    })

    if (supplierErrors.length > 0) {
      const demotedCount = indicesToDemote.size
      preview.errors = [...preview.errors, ...supplierErrors].slice(0, 100)
      preview.validRows = Math.max(0, preview.validRows - demotedCount)
      preview.invalidRows = preview.invalidRows + demotedCount
      preview.parsedValidRows = parsedRows.filter((_, idx) => !indicesToDemote.has(idx))
      preview.sampleData = preview.parsedValidRows.slice(0, 5)
    }

    // L7: don't serialize the FULL parsed rows back to the caller in the
    // dry-run response — only the sampleData (first 5) is part of the
    // public preview contract.
    if (dryRun) {
      const { parsedValidRows: _drop, ...publicPreview } = preview
      return NextResponse.json({
        success: true,
        dryRun: true,
        ...publicPreview,
      })
    }

    // If validation failed, don't proceed
    if (preview.invalidRows > 0) {
      const { parsedValidRows: _drop, ...publicPreview } = preview
      return NextResponse.json({
        success: false,
        error: `${preview.invalidRows} row(s) have validation errors. Fix errors or use dry run to see details.`,
        ...publicPreview,
      })
    }

    // L7: reuse the parsed rows from the validator instead of re-parsing
    // the raw strings here. The prior re-parser silently disagreed with
    // parseCell on edge cases (e.g. unrecognized boolean strings — parseCell
    // rejected them at validation, this loop coerced them to false). The
    // validator and the upsert now share ONE parser, so anything that passes
    // validation lands as the exact same record at write time.
    //
    // parsedValidRows has already been filtered for unresolved suppliers above
    // and any resolved-by-name rows now carry the canonical supplier_id.
    const rowsToUpsert: Record<string, any>[] = preview.parsedValidRows || []

    // Rate-entry validation (harness Layer 4): reject the import if any row has
    // a negative / absurd money value, so the engine never reads a bad rate.
    const rateViolations: any[] = []
    rowsToUpsert.forEach((record, idx) => {
      const check = validateRatePayload(record)
      if (!check.ok) rateViolations.push({ row: idx + 1, errors: check.errors })
    })
    if (rateViolations.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid rate values in import', violations: rateViolations.slice(0, 20) },
        { status: 400 }
      )
    }

    // Upsert in batches of 50
    const BATCH_SIZE = 50
    let inserted = 0
    let updated = 0
    const importErrors: any[] = []

    // Determine the unique key column for upsert
    const uniqueKeyColumn = config.uniqueKey[0] // e.g., 'service_code' or 'cruise_code' or 'cost_type'

    // The untouched sample row from a downloaded template. Filling the sheet in
    // underneath it and importing the lot is the obvious mistake to make, so it
    // is skipped rather than inserted as a rate called EXAMPLE-DELETE-THIS-ROW.
    let exampleRowsSkipped = 0

    // Reject rows whose unique key is blank — without a key every such row is
    // inserted as a brand-new record, creating uncontrolled duplicates.
    const keyedRows = rowsToUpsert.filter(r => {
      const key = r[uniqueKeyColumn]
      if (key === undefined || key === null || String(key).trim() === '') {
        importErrors.push({ operation: 'validate', message: `Row missing required ${uniqueKeyColumn}; skipped` })
        return false
      }
      if (isExampleRow(key)) {
        exampleRowsSkipped++
        return false
      }
      return true
    })

    // De-duplicate within the import by unique key (keep the LAST occurrence), so a
    // file containing the same key twice resolves deterministically instead of
    // inserting one copy and then duplicating/failing the other in the same batch.
    const dedupMap = new Map<string, Record<string, any>>()
    for (const r of keyedRows) dedupMap.set(String(r[uniqueKeyColumn]), r)
    const dedupedRows = Array.from(dedupMap.values())

    for (let i = 0; i < dedupedRows.length; i += BATCH_SIZE) {
      const batch = dedupedRows.slice(i, i + BATCH_SIZE)

      // Check which records already exist
      const keyValues = batch
        .map(r => r[uniqueKeyColumn])
        .filter(Boolean)

      let existingKeys = new Set<string>()
      if (keyValues.length > 0) {
        const { data: existing } = await supabase
          .from(table)
          .select(uniqueKeyColumn)
          .in(uniqueKeyColumn, keyValues)

        if (existing) {
          existingKeys = new Set(existing.map((r: any) => r[uniqueKeyColumn]))
        }
      }

      // Split into inserts and updates — purely for counting; the upsert
      // call below handles both in one round-trip.
      const toInsert = batch.filter(r => !r[uniqueKeyColumn] || !existingKeys.has(r[uniqueKeyColumn]))
      const toUpdate = batch.filter(r => r[uniqueKeyColumn] && existingKeys.has(r[uniqueKeyColumn]))

      // M11: collapse N+1 sequential round-trips into 1.
      // The previous code did one INSERT for new rows, then issued an
      // awaited UPDATE per existing row inside a serial for-loop. A re-import
      // of an existing rate table (e.g. 125 transportation_rates rows) made
      // ~125 round-trips and could time out the serverless invocation.
      // A single upsert with onConflict on the unique key column handles
      // inserts AND updates in one PostgREST call: PostgreSQL turns it into
      // INSERT ... ON CONFLICT (key) DO UPDATE SET ...
      if (batch.length > 0) {
        const { error: upsertError } = await supabase
          .from(table)
          .upsert(batch, { onConflict: uniqueKeyColumn })

        if (upsertError) {
          importErrors.push({
            batch: Math.floor(i / BATCH_SIZE) + 1,
            operation: 'upsert',
            message: upsertError.message,
          })
        } else {
          inserted += toInsert.length
          updated += toUpdate.length
        }
      }
    }

    const exampleWarnings = exampleRowsSkipped > 0
      ? [{
          kind: 'example_row_skipped' as const,
          key: 'template',
          message: `Skipped ${exampleRowsSkipped} unedited example row${exampleRowsSkipped === 1 ? '' : 's'} from the downloaded template. Delete that row from the file once you have used it as a guide.`,
        }]
      : []

    const result: ImportResult = {
      totalRows: rows.length,
      validRows: preview.validRows,
      invalidRows: preview.invalidRows,
      inserted,
      updated,
      errors: importErrors,
      warnings: exampleWarnings,
    }

    const success = importErrors.length === 0

    return NextResponse.json({
      success,
      // Surface the real database error so the UI isn't left with a bare
      // "Import failed". The detailed list stays in `errors`.
      ...(success
        ? {}
        : {
            error:
              `Import failed: ${importErrors[0]?.message || 'database error'}` +
              (importErrors.length > 1 ? ` (+${importErrors.length - 1} more)` : ''),
          }),
      ...result,
    })
  } catch (error: any) {
    console.error('[bulk-import] Error:', error)
    return NextResponse.json(
      { success: false, error: `Import failed: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    )
  }
}
