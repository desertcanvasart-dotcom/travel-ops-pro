// ============================================
// API: organization branding / company profile
// ============================================
// GET   any member — documents and client pages need it to render
// PUT   admin/owner — company identity is theirs to state
// POST  admin/owner — logo upload (multipart), stored in the public
//       `documents` bucket under org-logos/, logo_url updated
//
// These are the details printed on customer-facing paper (letterhead,
// invoices, the portal). Empty stays empty — a blank field renders as a blank
// on the document, never as a placeholder company.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { orgAuth } from '@/lib/auth/org-auth'
import { requireRole } from '@/lib/auth/current-org'
import { clientMessage } from '@/lib/api-errors'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const FIELDS = [
  'name',
  'tagline',
  'logo_url',
  'contact_email',
  'company_phone',
  'company_website',
  'company_address',
  'document_contacts',
  'offices',
] as const

/** Offices arrive as arbitrary JSON; keep only the known string fields, cap
 *  the list, and drop rows that say nothing. */
function sanitizeOffices(value: unknown): Array<Record<string, string>> {
  if (!Array.isArray(value)) return []
  const out: Array<Record<string, string>> = []
  for (const row of value.slice(0, 10)) {
    if (!row || typeof row !== 'object') continue
    const office: Record<string, string> = {}
    for (const key of ['label', 'postal_code', 'address', 'tel', 'fax']) {
      const v = (row as Record<string, unknown>)[key]
      if (typeof v === 'string' && v.trim()) office[key] = v.trim().slice(0, 200)
    }
    if (Object.keys(office).length) out.push(office)
  }
  return out
}

export async function GET() {
  try {
    const auth = await orgAuth()
    if (auth.error || !auth.org_id) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Not authenticated' },
        { status: auth.status }
      )
    }

    const { data, error } = await admin
      .from('organizations')
      .select(FIELDS.join(', '))
      .eq('id', auth.org_id)
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Failed to load company profile') },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await orgAuth()
    if (auth.error || !auth.org_id) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Not authenticated' },
        { status: auth.status }
      )
    }
    const forbidden = await requireRole(['admin'])
    if (forbidden) return forbidden

    const body = await request.json()
    const update: Record<string, unknown> = {}
    for (const field of FIELDS) {
      if (field === 'logo_url') continue // set via the upload endpoint only
      if (field in body) {
        update[field] =
          field === 'offices'
            ? sanitizeOffices(body.offices)
            : field === 'document_contacts'
            ? body.document_contacts && typeof body.document_contacts === 'object'
              ? body.document_contacts
              : {}
            : typeof body[field] === 'string'
              ? body[field].trim() || null
              : null
      }
    }
    // The org NAME is identity, not decoration — never blank it from here.
    if ('name' in update && !update.name) delete update.name

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 })
    }
    update.updated_at = new Date().toISOString()

    const { error } = await admin.from('organizations').update(update).eq('id', auth.org_id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Failed to save company profile') },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await orgAuth()
    if (auth.error || !auth.org_id) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Not authenticated' },
        { status: auth.status }
      )
    }
    const forbidden = await requireRole(['admin'])
    if (forbidden) return forbidden

    const form = await request.formData()
    const file = form.get('logo')
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'logo file is required' }, { status: 400 })
    }
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: 'Logo must be under 2MB' }, { status: 400 })
    }
    const ALLOWED: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/svg+xml': 'svg',
      'image/webp': 'webp',
    }
    const ext = ALLOWED[file.type]
    if (!ext) {
      return NextResponse.json(
        { success: false, error: 'Logo must be PNG, JPEG, SVG, or WebP' },
        { status: 400 }
      )
    }

    const path = `org-logos/${auth.org_id}.${ext}`
    const bytes = Buffer.from(await file.arrayBuffer())
    const { error: uploadError } = await admin.storage
      .from('documents')
      .upload(path, bytes, { contentType: file.type, upsert: true })
    if (uploadError) throw uploadError

    const { data: pub } = admin.storage.from('documents').getPublicUrl(path)
    // Cache-bust: the path is stable per org, and a stale CDN logo on a fresh
    // letterhead is exactly the kind of bug nobody reports for months.
    const logoUrl = `${pub.publicUrl}?v=${Date.now()}`

    const { error } = await admin
      .from('organizations')
      .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
      .eq('id', auth.org_id)
    if (error) throw error

    return NextResponse.json({ success: true, logo_url: logoUrl })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Failed to upload logo') },
      { status: 500 }
    )
  }
}
