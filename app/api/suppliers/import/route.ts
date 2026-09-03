// GET  /api/suppliers/import?template=1   → the CSV sheet to fill in
// POST /api/suppliers/import { csvData, dryRun? }
//   dryRun: what WOULD happen (ready / already on file / errors)
//   else:   inserts the new suppliers; never rewrites an existing one
import { NextRequest, NextResponse } from 'next/server'
import Papa from 'papaparse'
import { createActorAdminClient } from '@/lib/supabase-actor'
import { clientMessage } from '@/lib/api-errors'
import { prepareSupplierRows, supplierCsvTemplate, type SupplierCsvRow } from '@/lib/suppliers/import-csv'

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('template') !== '1') {
    return NextResponse.json({ success: false, error: 'Use ?template=1 for the sheet' }, { status: 400 })
  }
  return new NextResponse(supplierCsvTemplate(), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="suppliers-template.csv"',
    },
  })
}

export async function POST(request: NextRequest) {
  try {
    const { csvData, dryRun = false } = await request.json()
    if (!csvData || typeof csvData !== 'string') {
      return NextResponse.json({ success: false, error: 'csvData is required' }, { status: 400 })
    }
    const parsed = Papa.parse<SupplierCsvRow>(csvData, {
      header: true, skipEmptyLines: true,
      transformHeader: (h: string) => h.trim().toLowerCase().replace(/\s+/g, '_'),
    })
    const preview = prepareSupplierRows(parsed.data)

    const supabase = createActorAdminClient()
    // Which of the ready names are already on file (case-insensitive).
    const names = preview.ready.map(r => r.name.toLowerCase())
    const existing = new Set<string>()
    if (names.length > 0) {
      const { data } = await supabase.from('suppliers').select('name')
      for (const s of data ?? []) if (names.includes(String(s.name).toLowerCase())) existing.add(String(s.name).toLowerCase())
    }
    const toInsert = preview.ready.filter(r => !existing.has(r.name.toLowerCase()))
    const alreadyOnFile = preview.ready.filter(r => existing.has(r.name.toLowerCase())).map(r => ({ line: r.line, name: r.name }))

    const summary = {
      success: true,
      dryRun,
      totalRows: parsed.data.length,
      ready: toInsert.length,
      alreadyOnFile,
      errors: preview.errors,
      exampleRowsSkipped: preview.exampleRowsSkipped,
      readyNames: toInsert.map(r => r.name),
    }
    if (dryRun) return NextResponse.json(summary)

    let inserted = 0
    const insertErrors: { name: string; message: string }[] = []
    for (let i = 0; i < toInsert.length; i += 50) {
      const batch = toInsert.slice(i, i + 50)
      const { data, error } = await supabase.from('suppliers').insert(batch.map(r => r.row)).select('id')
      if (error) {
        // Fall back to one at a time so a single bad row does not sink the batch.
        for (const r of batch) {
          const { error: e1 } = await supabase.from('suppliers').insert([r.row])
          if (e1) insertErrors.push({ name: r.name, message: clientMessage(e1, 'Could not insert') })
          else inserted++
        }
      } else inserted += data?.length ?? batch.length
    }
    return NextResponse.json({ ...summary, inserted, insertErrors })
  } catch (err) {
    console.error('[suppliers/import]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
