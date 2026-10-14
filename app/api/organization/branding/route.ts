// ============================================
// API: organization branding / company profile
// ============================================
// GET   any member — documents and client pages need it to render
// PUT   admin/owner — company identity is theirs to state. Renaming the
//       company is the OWNER's (as on the Organization page).
// POST  admin/owner — logo upload (multipart, PNG/JPEG/WebP), stored in the
//       public `documents` bucket under org-logos/, logo_url updated
//
// These are the details printed on customer-facing paper (letterhead,
// invoices, the portal). Empty stays empty — a blank field renders as a blank
// on the document, never as a placeholder company.

import { NextRequest, NextResponse } from 'next/server'
import { normaliseMargin } from '@/lib/org-default-margin'
import { DEFAULT_VAT_RATE, normaliseVatRate } from '@/lib/vat'
import { createClient } from '@supabase/supabase-js'
import { orgAuth } from '@/lib/auth/org-auth'
import { currentUser, isPlatformAdmin } from '@/lib/blog/platform-admin'
import { getCurrentUserRole, requireRole } from '@/lib/auth/current-org'
import { CURRENCY_REFUSED, LOGO_TYPES, parseProfileCurrency, renameNeedsOwner } from '@/lib/settings/company-profile'
import { clientMessage } from '@/lib/api-errors'
import { toWhatsAppE164, PHONE_NEEDS_COUNTRY_CODE } from '@/lib/whatsapp-phone'

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
  // What the company bills in. It belongs with the other company-level facts
  // rather than in a settings page of its own — and it is what a colleague with
  // no preference of their own inherits.
  'default_currency',
  // What the company's supplier RATES are entered in (the *_eur columns).
  // Distinct from default_currency, what it bills in. Engine output follows it.
  'rate_currency',
  // The margin the company sells at by default; users without a preference inherit it.
  'default_margin_percent',
  // Rate-change digest for managers: off | in_app | in_app_email
  'rate_change_alerts',
  // What travel contracts name (migration 20261115): the country trips run
  // in and the law the contract is under. They said Egypt for everyone.
  'operating_country',
  'contract_governing_law',
  // The org's own WhatsApp sender (migration 20261125): customers who write
  // to it land in this org's inbox, and its replies go out from it
  // (lib/whatsapp-org). E.164, unique across organizations.
  'whatsapp_number',
  // The company's VAT rate in percent (migration 20261214, default 14). A
  // quote or invoice copies it when VAT is applied to it, so changing it here
  // never re-prices a document already made (lib/vat.ts).
  'vat_rate',
] as const

/** The columns migration 20261115 adds. Until it is applied, reads and
 *  writes go on without them rather than failing the whole profile. */
const CONTRACT_FIELDS = ['operating_country', 'contract_governing_law'] as const
/** Likewise whatsapp_number (20261125) and vat_rate (20261214). */
const PENDING_FIELDS = [...CONTRACT_FIELDS, 'whatsapp_number', 'vat_rate'] as const
function missingContractColumns(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const undefinedColumn = error.code === '42703' || error.code === 'PGRST204'
  return undefinedColumn && PENDING_FIELDS.some(f => (error.message ?? '').includes(f))
}

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

    let { data, error } = await admin
      .from('organizations')
      .select(FIELDS.join(', '))
      .eq('id', auth.org_id)
      .single()
    if (missingContractColumns(error)) {
      ;({ data, error } = await admin
        .from('organizations')
        .select(FIELDS.filter(f => !(PENDING_FIELDS as readonly string[]).includes(f)).join(', '))
        .eq('id', auth.org_id)
        .single())
    }

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
            : field === 'default_margin_percent'
            ? normaliseMargin(body.default_margin_percent)
            : field === 'vat_rate'
            ? (body.vat_rate === '' || body.vat_rate === null ? DEFAULT_VAT_RATE : normaliseVatRate(body.vat_rate))
            : field === 'rate_change_alerts'
            ? (['off', 'in_app', 'in_app_email'].includes(body.rate_change_alerts) ? body.rate_change_alerts : 'in_app')
            : typeof body[field] === 'string'
              ? body[field].trim() || null
              : null
      }
    }
    // A rate that is not a percentage is refused rather than stored as the
    // default: the next quote would otherwise carry a VAT nobody chose.
    if ('vat_rate' in update && update.vat_rate === null) {
      return NextResponse.json({ success: false, error: 'VAT rate must be a percentage between 0 and 100' }, { status: 400 })
    }
    // The org NAME is identity, not decoration — never blank it from here.
    if ('name' in update && !update.name) delete update.name
    // …and changing it is the owner's, here exactly as on the Organization
    // page: any admin could otherwise rename through this form what only the
    // owner may rename there.
    if ('name' in update) {
      const { data: current } = await admin.from('organizations').select('name').eq('id', auth.org_id).maybeSingle()
      if (renameNeedsOwner((current as { name?: string } | null)?.name, update.name) && (await getCurrentUserRole()) !== 'owner') {
        return NextResponse.json(
          { success: false, error: 'Only the organization owner can rename the company' },
          { status: 403 }
        )
      }
    }
    // Both currencies are one of the app's five codes, or cleared.
    for (const field of ['default_currency', 'rate_currency'] as const) {
      if (!(field in update)) continue
      const parsed = parseProfileCurrency(body[field])
      if (!parsed.ok) return NextResponse.json({ success: false, error: CURRENCY_REFUSED }, { status: 400 })
      update[field] = parsed.value
    }

    // Stored as toWhatsAppE164 makes it, the form the webhook matches Twilio's
    // `To` against; blank clears it. A number that is not international is
    // refused rather than stored where no message would ever match it.
    if ('whatsapp_number' in body) {
      // Which org a WhatsApp number belongs to decides whose inbox a customer's
      // messages land in and who may send as it. An org admin could type in
      // another org's (or the shared) number and receive its customers, or
      // switch every org without a number off. Only the platform's own admins
      // (PLATFORM_ADMIN_EMAILS) assign numbers; the field reads as before.
      const me = await currentUser()
      if (!isPlatformAdmin(me?.email)) {
        return NextResponse.json(
          { success: false, error: 'The WhatsApp number is set by the Autoura team. Ask them to connect your number.' },
          { status: 403 }
        )
      }
      const raw = typeof body.whatsapp_number === 'string' ? body.whatsapp_number.trim() : ''
      if (!raw) {
        update.whatsapp_number = null
      } else {
        const e164 = toWhatsAppE164(raw)
        if (!e164) {
          return NextResponse.json({ success: false, error: PHONE_NEEDS_COUNTRY_CODE }, { status: 400 })
        }
        update.whatsapp_number = e164
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 })
    }
    update.updated_at = new Date().toISOString()

    let { error } = await admin.from('organizations').update(update).eq('id', auth.org_id)
    let contractTermsPending = false
    if (missingContractColumns(error)) {
      for (const f of PENDING_FIELDS) delete update[f]
      contractTermsPending = true
      ;({ error } = await admin.from('organizations').update(update).eq('id', auth.org_id))
    }
    // One number, one inbox: organizations_whatsapp_number_key.
    if (error?.code === '23505' && (error.message ?? '').includes('whatsapp_number')) {
      return NextResponse.json(
        { success: false, error: 'This WhatsApp number is already used by another organization.' },
        { status: 409 }
      )
    }
    if (error) throw error
    return NextResponse.json({ success: true, ...(contractTermsPending ? { contractTermsPending: true } : {}) })
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
    // No SVG: the bucket is public and an SVG opened by its URL runs script
    // (lib/settings/company-profile LOGO_TYPES).
    const ext = LOGO_TYPES[file.type]
    if (!ext) {
      return NextResponse.json(
        { success: false, error: 'Logo must be PNG, JPEG or WebP' },
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
