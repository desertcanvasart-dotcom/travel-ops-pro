// GET  /api/suppliers/import?template=1   → the CSV sheet to fill in
// POST /api/suppliers/import { csvData, dryRun? }
//   dryRun: what WOULD happen (new / updated / clashes / errors)
//   else:   adds the new suppliers and updates the matched ones
// A row matches the company's supplier with its supplier_code, else (no code
// in the row) the one with its name — lib/suppliers/import-csv.ts.
import { NextRequest, NextResponse } from 'next/server'
import Papa from 'papaparse'
import { createActorAdminClient } from '@/lib/supabase-actor'
import { clientMessage } from '@/lib/api-errors'
import { planSupplierImport, prepareSupplierRows, supplierCsvTemplate, type ExistingSupplier, type SupplierCsvRow } from '@/lib/suppliers/import-csv'
import { allowedSupplierTypeKeys } from '@/lib/supplier-types'
import { supplierTypesForCurrentOrg } from '@/lib/vocabulary-server'
import { selectAllRows } from '@/lib/db/select-all-rows'
import { uniqueViolationMessage } from '@/lib/db/unique-violation'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

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

/** A write error as the operator should read it: a clash names what clashed. */
function writeError(e: { code?: string } | null, fallback: string, fields: string[]): string {
  if (e?.code === '23505') return uniqueViolationMessage(e, { subject: 'supplier', visibleFields: fields })
  return clientMessage(e, fallback)
}

export async function POST(request: NextRequest) {
  try {
    // Imports into the caller's company; codes and names are matched against
    // its own roster (suppliers.org_id, 20261205) — the other company holding
    // a supplier of the same name or code does not touch this one's.
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { csvData, dryRun = false } = await request.json()
    if (!csvData || typeof csvData !== 'string') {
      return NextResponse.json({ success: false, error: 'csvData is required' }, { status: 400 })
    }
    const parsed = Papa.parse<SupplierCsvRow>(csvData, {
      header: true, skipEmptyLines: true,
      transformHeader: (h: string) => h.trim().toLowerCase().replace(/\s+/g, '_'),
    })
    // Roles are the agency's supplier types (Settings → Vocabulary), the
    // built-ins included — a "Lodge" row imports once the agency defined it.
    const preview = prepareSupplierRows(parsed.data, allowedSupplierTypeKeys(await supplierTypesForCurrentOrg()))

    const supabase = createActorAdminClient()
    let existing: ExistingSupplier[] = []
    if (preview.ready.length > 0) {
      // Every supplier, not the first 1000 (lib/db/select-all-rows): past the
      // cap an existing supplier read as new and was inserted a second time.
      const { data, error } = await selectAllRows<ExistingSupplier>(
        () => supabase.from('suppliers').select('id, name, supplier_code, type').eq('org_id', orgId),
      )
      if (error) throw error
      existing = data ?? []
    }
    const plan = planSupplierImport(preview.ready, existing, new Set(parsed.meta.fields ?? []))

    const summary = {
      success: true,
      dryRun,
      totalRows: parsed.data.length,
      ready: plan.toInsert.length,
      readyNames: plan.toInsert.map(r => r.name),
      updates: plan.toUpdate.map(u => ({ line: u.line, name: u.name, matchedBy: u.matchedBy })),
      // Clashes are row errors: found here, in the preview, not at commit.
      errors: [...preview.errors, ...plan.clashes].sort((a, b) => a.line - b.line),
      exampleRowsSkipped: preview.exampleRowsSkipped,
    }
    if (dryRun) return NextResponse.json(summary)

    let inserted = 0
    let updated = 0
    const insertErrors: { name: string; message: string }[] = []
    for (let i = 0; i < plan.toInsert.length; i += 50) {
      const batch = plan.toInsert.slice(i, i + 50)
      const { data, error } = await supabase.from('suppliers').insert(batch.map(r => ({ ...r.row, org_id: orgId }))).select('id')
      if (error) {
        // Fall back to one at a time so a single bad row does not sink the batch.
        for (const r of batch) {
          const { error: e1 } = await supabase.from('suppliers').insert([{ ...r.row, org_id: orgId }])
          if (e1) insertErrors.push({ name: r.name, message: writeError(e1, 'Could not insert', Object.keys(r.row)) })
          else inserted++
        }
      } else inserted += data?.length ?? batch.length
    }
    for (const u of plan.toUpdate) {
      const { error } = await supabase.from('suppliers').update(u.patch).eq('id', u.id).eq('org_id', orgId)
      if (error) insertErrors.push({ name: u.name, message: writeError(error, 'Could not update', Object.keys(u.patch)) })
      else updated++
    }
    return NextResponse.json({ ...summary, inserted, updated, insertErrors })
  } catch (err) {
    console.error('[suppliers/import]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
