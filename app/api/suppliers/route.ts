import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildSupplierInsert } from '@/lib/suppliers/create-payload'
import { commissionFieldError } from '@/lib/suppliers/fields'
import { selectAllRows } from '@/lib/db/select-all-rows'
import { allowedSupplierTypeKeys, supplierTypeKeysMatching, unknownSupplierTypeError, unknownSupplierTypes } from '@/lib/supplier-types'
import { supplierTypesForCurrentOrg } from '@/lib/vocabulary-server'
import { uniqueViolationMessage } from '@/lib/db/unique-violation'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// The caller's company's suppliers only (suppliers.org_id, 20261205).
export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type')
    const status = searchParams.get('status')

    // Every matching supplier, not the first 1000 (PostgREST's cap, which
    // stops silently): the roster's counts, its pages and the Export the page
    // builds from them all stopped at a thousand. Filters are resolved first,
    // then applied to each page's fresh query (lib/db/select-all-rows).

    // Support comma-separated types (e.g., type=transport,local_operator,driver).
    // Matched against `types`, the full set of roles a supplier fills — asking
    // `type` alone would hide the driver who also meets clients at the airport.
    // Each requested type is widened to the agency's own types that BEHAVE
    // like it (Settings → Vocabulary): the hotel-rate form asks for hotels
    // and gets the lodges too.
    let typeKeys: string[] | null = null
    if (type) {
      const types = type.split(',').map(t => t.trim()).filter(Boolean)
      if (types.length > 0) typeKeys = supplierTypeKeysMatching(types, await supplierTypesForCurrentOrg())
    }

    // ?city= — the suppliers in a place: based there, or owning an active
    // property there (a hotel group's Luxor hotel, a cruise line's ship).
    // City names only (letters, digits, spaces, . ' -): no LIKE wildcards or
    // PostgREST filter syntax reaches the query.
    const city = searchParams.get('city')?.replace(/[^\p{L}\p{N} .'-]/gu, '').trim()
    let propertyOwnerIds: string[] = []
    if (city) {
      const { data: props, error: propErr } = await supabaseAdmin
        .from('supplier_properties')
        .select('supplier_id')
        .eq('org_id', orgId)
        .ilike('city', city)
        .eq('is_active', true)
      if (propErr) console.error('Error fetching supplier properties by city:', propErr.message)
      propertyOwnerIds = [...new Set((props || []).map((p: { supplier_id: string }) => p.supplier_id))]
    }

    // The is_property / parent_supplier_id filters are gone with the columns:
    // that was the 2026-08-22 supplier-IS-a-property model, retired unused.
    // A supplier's assets now live in supplier_properties (see
    // /api/suppliers/[id]/properties).
    const build = () => {
      let query = supabaseAdmin.from('suppliers').select('*').eq('org_id', orgId)
      if (typeKeys) query = query.overlaps('types', typeKeys)
      if (status) query = query.eq('status', status)
      if (city) {
        query = propertyOwnerIds.length
          ? query.or(`city.ilike."${city}",id.in.(${propertyOwnerIds.join(',')})`)
          : query.ilike('city', city)
      }
      return query
    }
    const { data, error } = await selectAllRows(build, { order: [{ column: 'name' }, { column: 'id' }] })

    if (error) {
      console.error('Error fetching suppliers:', error)
      return NextResponse.json({ error: 'Failed to fetch suppliers' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    console.error('Error in suppliers GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const body = await request.json()

    const built = buildSupplierInsert(body)
    if (!built.ok) {
      return NextResponse.json({ error: built.error }, { status: 400 })
    }
    const commissionError = commissionFieldError(built.row)
    if (commissionError) return NextResponse.json({ error: commissionError }, { status: 400 })

    // The roles must be the agency's (or built-in) supplier types. The
    // database keeps only the key SHAPE since 20261007; the list is here.
    const roles: string[] = Array.isArray(built.row.types) ? built.row.types : []
    const unknown = unknownSupplierTypes(roles, allowedSupplierTypeKeys(await supplierTypesForCurrentOrg()))
    if (unknown.length > 0) {
      return NextResponse.json({ error: unknownSupplierTypeError(unknown) }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('suppliers')
      .insert([{ ...built.row, org_id: orgId }])
      .select()
      .single()

    if (error) {
      console.error('Error creating supplier:', error)
      // A constraint violation is a bad request, not a server fault — and the
      // blank "Failed to create supplier" is what hid this bug for a day.
      if (error.code === '23514') {
        return NextResponse.json(
          { error: 'Supplier type must be one of its roles. Pick at least one role.' },
          { status: 400 }
        )
      }
      if (error.code === '23505') {
        // Name what actually clashed. "These details" sent the operator
        // looking for a duplicate supplier that did not exist, when the clash
        // was on the auto-assigned supplier_code — see lib/db/unique-violation.
        return NextResponse.json(
          {
            error: uniqueViolationMessage(error, {
              subject: 'supplier',
              visibleFields: Object.keys(built.row),
            }),
          },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: 'Failed to create supplier' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    console.error('Error in suppliers POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}