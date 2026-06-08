import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { clientMessage } from '@/lib/api-errors'
import { RATE_TABLE_CONFIGS, validateImportData } from '@/lib/bulk-rate-service'
import type { ImportResult } from '@/lib/bulk-rate-service'
import Papa from 'papaparse'

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

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        ...preview,
      })
    }

    // If validation failed, don't proceed
    if (preview.invalidRows > 0) {
      return NextResponse.json({
        success: false,
        error: `${preview.invalidRows} row(s) have validation errors. Fix errors or use dry run to see details.`,
        ...preview,
      })
    }

    // Get importable columns (exclude export-only)
    const importableColumns = config.columns.filter(c => !c.exportOnly)
    const importableColNames = importableColumns.map(c => c.name)

    // Parse all rows for import
    const rowsToUpsert: Record<string, any>[] = []
    for (const row of rows) {
      const record: Record<string, any> = {}
      for (const colDef of importableColumns) {
        const raw = (row[colDef.name] ?? '').trim()
        if (raw === '' || raw === 'null' || raw === 'NULL') continue

        switch (colDef.type) {
          case 'number':
            record[colDef.name] = Number(raw)
            break
          case 'boolean':
            record[colDef.name] = ['true', '1', 'yes', 'y'].includes(raw.toLowerCase())
            break
          default:
            record[colDef.name] = raw
        }
      }
      rowsToUpsert.push(record)
    }

    // Upsert in batches of 50
    const BATCH_SIZE = 50
    let inserted = 0
    let updated = 0
    const importErrors: any[] = []

    // Determine the unique key column for upsert
    const uniqueKeyColumn = config.uniqueKey[0] // e.g., 'service_code' or 'cruise_code' or 'cost_type'

    for (let i = 0; i < rowsToUpsert.length; i += BATCH_SIZE) {
      const batch = rowsToUpsert.slice(i, i + BATCH_SIZE)

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

      // Split into inserts and updates
      const toInsert = batch.filter(r => !r[uniqueKeyColumn] || !existingKeys.has(r[uniqueKeyColumn]))
      const toUpdate = batch.filter(r => r[uniqueKeyColumn] && existingKeys.has(r[uniqueKeyColumn]))

      // Insert new records
      if (toInsert.length > 0) {
        const { error: insertError } = await supabase
          .from(table)
          .insert(toInsert)

        if (insertError) {
          importErrors.push({
            batch: Math.floor(i / BATCH_SIZE) + 1,
            operation: 'insert',
            message: insertError.message,
          })
        } else {
          inserted += toInsert.length
        }
      }

      // Update existing records one by one (using unique key)
      for (const record of toUpdate) {
        const keyVal = record[uniqueKeyColumn]
        const updateData = { ...record }
        delete updateData[uniqueKeyColumn] // Don't update the key itself

        const { error: updateError } = await supabase
          .from(table)
          .update(updateData)
          .eq(uniqueKeyColumn, keyVal)

        if (updateError) {
          importErrors.push({
            row: uniqueKeyColumn + '=' + keyVal,
            operation: 'update',
            message: updateError.message,
          })
        } else {
          updated++
        }
      }
    }

    const result: ImportResult = {
      totalRows: rows.length,
      validRows: preview.validRows,
      invalidRows: preview.invalidRows,
      inserted,
      updated,
      errors: importErrors,
    }

    return NextResponse.json({
      success: importErrors.length === 0,
      ...result,
    })
  } catch (error: any) {
    console.error('[bulk-import] Error:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Import failed') },
      { status: 500 }
    )
  }
}
