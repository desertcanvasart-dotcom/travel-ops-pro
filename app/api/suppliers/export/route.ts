// POST /api/suppliers/export { ids }  → the supplier roster as a CSV
//
// Why the server. The suppliers page used to build this file itself, with a
// hand-written header row of nine display labels and
// `.map(v => `"${v || ''}"`).join(',')` as the serialiser. Two bugs lived
// there:
//
//   1. The headers were display labels ("Code", "Contact", "Email"), not the
//      keys the importer reads (supplier_code, contact_name, contact_email),
//      and website / address / notes / country were never written at all. So
//      export → delete → re-import came back with eight of the thirteen fields
//      gone — the supplier_code among them, which makes the DB trigger mint a
//      NEW SUP-#### and silently breaks the supplier_code link in every rate
//      CSV exported alongside it.
//   2. That serialiser corrupts any value containing a `"` or a newline — and
//      `notes` is a textarea, so newlines are the normal case, not the corner
//      one. A single multi-line note shifted every subsequent row.
//
// Here the column set is the one in lib/suppliers/import-csv.ts that the
// importer and the template already use, and Papa.unparse does the escaping.
//
// The CLIENT still decides WHAT to export: it posts the ids its filters and
// search left on screen. Re-deriving that filter server-side would be a second
// implementation of the same rule, which is the disease this fixes.
import { NextRequest, NextResponse } from 'next/server'
import Papa from 'papaparse'
import { createServerClient } from '@/lib/supabase-server'
import { SUPPLIER_CSV_COLUMNS, supplierCsvHeaders, supplierCsvRow } from '@/lib/suppliers/import-csv'

const supabase = createServerClient()

/** Chunk size for the id filter — a PostgREST `in` list travels in the URL. */
const CHUNK = 200

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const ids: unknown = body?.ids
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) {
      return NextResponse.json({ success: false, error: 'ids must be an array of supplier ids' }, { status: 400 })
    }

    // select('*'), NOT a named column list: a column a given database has not
    // migrated yet would fail the whole export rather than come out blank —
    // the same deploy-safe contract the rates export runs under.
    const rows: Record<string, unknown>[] = []
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .in('id', ids.slice(i, i + CHUNK) as string[])
      if (error) {
        console.error('[suppliers/export]', error)
        return NextResponse.json({ success: false, error: `Failed to fetch suppliers: ${error.message}` }, { status: 500 })
      }
      rows.push(...(data ?? []))
    }

    // The file keeps the order the caller asked for — what is on their screen.
    const byId = new Map(rows.map(r => [String(r.id), r]))
    const ordered = (ids as string[]).map(id => byId.get(id)).filter(Boolean) as Record<string, unknown>[]

    // The { fields, data } form, not unparse(rows): the latter returns an empty
    // string for zero rows — headers and all — so an export with nothing
    // selected would hand back a blank file instead of the sheet's shape.
    const csv = Papa.unparse({
      fields: supplierCsvHeaders(),
      data: ordered.map(s => {
        const cells = supplierCsvRow(s)
        return SUPPLIER_CSV_COLUMNS.map(c => cells[c.name])
      }),
    })

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="suppliers_export_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })
  } catch (error: any) {
    console.error('[suppliers/export]', error)
    return NextResponse.json({ success: false, error: `Export failed: ${error?.message || 'Unknown error'}` }, { status: 500 })
  }
}
