import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { RATE_TABLE_CONFIGS, validateImportData, isExampleRow, transportationConfigFor, vehicleColumnSpecsFor } from '@/lib/bulk-rate-service'
import { stripVehicleFields, vehiclesFromFlatRow } from '@/lib/rates/vehicle-bands'
import { vocabularyItemsForCurrentOrg } from '@/lib/vocabulary-server'
import type { ImportResult, ValidationError } from '@/lib/bulk-rate-service'
import Papa from 'papaparse'
import { validateRatePayload } from '@/lib/rate-validation'
import { batchResolveSuppliers } from '@/lib/suppliers/resolve-supplier'
import { resolveRateProperties } from '@/lib/suppliers/resolve-property'
import { getServerLocale, lookupServerMessage } from '@/lib/i18n/server-messages'

const supabase = createServerClient()

/** The Add forms' defaults for a rate with no validity dates entered
 *  (app/api/rates/transportation, app/api/rates/entrance-fees). */
const OPEN_ENDED_VALID_TO = '2099-12-31'
const todayIso = () => new Date().toISOString().slice(0, 10)

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

    // The transportation sheet carries a column-set per vehicle in the
    // agency's vocabulary (a 4x4 defined in Settings has its own columns);
    // every other table's sheet is fixed.
    const vehicleSpecs = table === 'transportation_rates'
      ? vehicleColumnSpecsFor(await vocabularyItemsForCurrentOrg('vehicle_type'))
      : null
    const config = vehicleSpecs ? transportationConfigFor(vehicleSpecs) : RATE_TABLE_CONFIGS[table]

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
    // The untouched sample row from a downloaded template, dropped HERE —
    // before any resolver looks at it. Filling the sheet in underneath the
    // example and importing the lot is the obvious mistake to make, and the
    // importer has always meant to skip it; it just used to skip it much
    // further down, after supplier resolution had already judged it.
    //
    // That ordering was a live bug. The sample names a supplier called
    // "Example Name", which resolves to nothing, so the row was demoted as a
    // validation error and the whole import returned "1 row(s) have validation
    // errors" instead of the intended "example row skipped" — for every table
    // whose sheet carries supplier_name. Now it never reaches the resolver,
    // and no resolver added later can trip over it either.
    const uniqueKeyColumn = config.uniqueKey[0] // 'service_code' | 'cruise_code' | 'cost_type'
    let exampleRowsSkipped = 0
    const parsedRows = (preview.parsedValidRows ?? []).filter(r => {
      if (!isExampleRow(r[uniqueKeyColumn])) return true
      exampleRowsSkipped++
      return false
    })
    if (exampleRowsSkipped > 0) {
      preview.parsedValidRows = parsedRows
      preview.validRows -= exampleRowsSkipped
      preview.sampleData = parsedRows.slice(0, 5)
    }

    const resolution = await batchResolveSuppliers(parsedRows, supabase)
    const supplierErrors: ValidationError[] = []
    const indicesToDemote = new Set<number>()
    const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().trim()
    const locale = await getServerLocale()

    parsedRows.forEach((row, idx) => {
      const rowNum = idx + 2
      const idValue = typeof row.supplier_id === 'string' ? row.supplier_id.trim() : ''
      const nameValue = typeof row.supplier_name === 'string' ? row.supplier_name : ''
      const codeValue = typeof row.supplier_code === 'string' ? row.supplier_code.trim() : ''

      // supplier_code wins — it is the portable cross-install key. A code that
      // matches no supplier here errors and demotes the row (suppliers must be
      // migrated before their rates), rather than silently importing unlinked.
      if (codeValue) {
        const rid = resolution.resolvedIdByCode.get(norm(codeValue))
        if (rid) {
          row.supplier_id = rid
        } else {
          supplierErrors.push({ row: rowNum, column: 'supplier_code', message: lookupServerMessage(locale, 'rates.common.errors.supplierCodeNotFound', { code: codeValue }) })
          indicesToDemote.add(idx)
        }
        return
      }

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

    // supplier_code is virtual — no rate table has the column. It has done its
    // job (resolving supplier_id above); strip it from every row so the upsert
    // never sends an unknown column. Done on parsedRows, which the kept rows
    // share by reference.
    for (const row of parsedRows) delete (row as Record<string, unknown>).supplier_code

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

    // Transportation: fold each row's vehicle cells into its `vehicles` list
    // (the row's whole list — a sheet row replaces) and drop the cells — the
    // table has no per-vehicle columns, so none may reach the upsert.
    if (vehicleSpecs) {
      for (const row of rowsToUpsert) {
        const list = vehiclesFromFlatRow(row, vehicleSpecs)
        if (!list) {
          return NextResponse.json(
            { success: false, error: `Row ${String(row[config.uniqueKey[0]] ?? '')}: a vehicle capacity band must run from a minimum to a maximum of at least the same size` },
            { status: 400 }
          )
        }
        stripVehicleFields(row, vehicleSpecs.map(s => s.key))
        row.vehicles = list
      }
    }

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

    // Reject rows whose unique key is blank — without a key every such row is
    // inserted as a brand-new record, creating uncontrolled duplicates. The
    // template's example row is already gone by now (dropped before supplier
    // resolution, above).
    const keyedRows = rowsToUpsert.filter(r => {
      const key = r[uniqueKeyColumn]
      if (key === undefined || key === null || String(key).trim() === '') {
        importErrors.push({ operation: 'validate', message: `Row missing required ${uniqueKeyColumn}; skipped` })
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

    // The property link. A CSV carries the property as its NAME under its
    // supplier (the supplier_properties unique key), never as property_id — a
    // foreign install's UUID is meaningless. Resolve it back here, through the
    // SAME function the rate forms' create/update routes use, so a sheet and a
    // form can never place the same rate on different properties.
    //
    // Before this, property_id was not a CSV column at all: export → delete →
    // re-import silently unlinked every hotel, cruise, train and sleeper rate
    // from the property it prices. The denormalised name survived, so nothing
    // on screen changed.
    //
    // Placed HERE, after the dry-run return and after the unkeyed and example
    // rows are dropped, because resolution find-or-CREATES the property: a dry
    // run must write nothing, and the template's untouched sample row must not
    // leave a ship called "Example Name" behind. Nothing here can fail a row —
    // an unresolvable property leaves property_id null, exactly what the row
    // had before — so there is nothing for the preview to report either.
    const propertyLink = config.propertyLink
    if (propertyLink) {
      const resolutions = await resolveRateProperties(
        supabase,
        dedupedRows.map(row => ({
          propertyType: propertyLink.propertyType,
          supplierId: row.supplier_id as string | undefined,
          name: row[propertyLink.nameColumn] as string | undefined,
          propertyId: row.property_id as string | undefined,
        })),
      )
      dedupedRows.forEach((row, i) => {
        row.property_id = resolutions[i].property_id
        // The property's canonical spelling wins, so the row and the property
        // cannot disagree — but only where the rate table actually stores the
        // name. A virtual column is stripped below instead.
        const canonical = resolutions[i].name
        if (canonical && !propertyLink.virtual) row[propertyLink.nameColumn] = canonical
      })
      // A virtual name column exists only on the sheet. It has done its job;
      // the table has no such column and the upsert must never see it.
      if (propertyLink.virtual) {
        for (const row of dedupedRows) delete (row as Record<string, unknown>)[propertyLink.nameColumn]
      }
    }

    const hasValidity = config.columns.some(c => c.name === 'rate_valid_from')
      && config.columns.some(c => c.name === 'rate_valid_to')
    for (let i = 0; i < dedupedRows.length; i += BATCH_SIZE) {
      const batch = dedupedRows.slice(i, i + BATCH_SIZE)

      // Check which records already exist
      const keyValues = batch
        .map(r => r[uniqueKeyColumn])
        .filter(Boolean)

      let existingKeys = new Set<string>()
      const existingValidity = new Map<string, { rate_valid_from?: string | null; rate_valid_to?: string | null }>()
      if (keyValues.length > 0) {
        const { data: existing } = await supabase
          .from(config.tableName)
          .select(hasValidity ? `${uniqueKeyColumn}, rate_valid_from, rate_valid_to` : uniqueKeyColumn)
          .in(uniqueKeyColumn, keyValues)

        if (existing) {
          existingKeys = new Set(existing.map((r: any) => r[uniqueKeyColumn]))
          for (const r of existing as any[]) existingValidity.set(r[uniqueKeyColumn], r)
        }
      }

      // Blank validity dates. The sheet marks them optional, but
      // transportation_rates and entrance_fees store them NOT NULL with no
      // default, and a batch upsert sends a missing cell as NULL — so one row
      // without dates failed its whole batch (2026-09-16: a 143-row transport
      // sheet imported nothing). A row already in the table keeps its own
      // dates; a new row gets what the Add form gives it: today, open-ended.
      if (hasValidity) {
        for (const row of batch) {
          const kept = existingValidity.get(row[uniqueKeyColumn])
          if (!row.rate_valid_from) row.rate_valid_from = kept?.rate_valid_from || todayIso()
          if (!row.rate_valid_to) row.rate_valid_to = kept?.rate_valid_to || OPEN_ENDED_VALID_TO
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
          .from(config.tableName)
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
