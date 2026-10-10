import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('supplier invoices', () => {
  const match = src('app/api/supplier-invoices/[id]/match/route.ts')

  it('AP payment history is the org’s own', () => {
    const ap = src('app/api/accounts-payable/route.ts')
    const recent = ap.slice(ap.indexOf('// Fetch paid expenses for payment history'))
    expect(recent.slice(0, 300)).toContain(".eq('org_id', orgId)")
  })

  it('match and unmatch only before review, and the write is conditional', () => {
    expect(match).toContain("const MATCHABLE = ['received', 'matched']")
    expect(match).toContain('if (!MATCHABLE.includes(invoice.status))')
    expect(match).toContain('if (!MATCHABLE.includes(parentInvoice.status))')
    expect(match.match(/\.in\('status', MATCHABLE\)/g)).toHaveLength(2)
  })

  it('unmatch keeps a partial match at received (M28)', () => {
    expect(match).toContain("const status = matchStatus === 'matched' ? 'matched' : 'received'")
    expect(match).not.toContain("const status = matchedAmount === 0 ? 'received' : 'matched'")
  })

  it('expenses match only in the invoice currency', () => {
    expect(match).toContain(".select('amount, status, currency')")
    expect(match).toContain(".select('id, amount, currency')")
    expect(match).toContain('Expenses must be in the invoice currency')
  })

  it('create and edit check the trip and client invoice; edit is an allow-list', () => {
    expect(src('app/api/supplier-invoices/route.ts')).toContain('invoice_id: body.client_invoice_id')
    const put = src('app/api/supplier-invoices/[id]/route.ts')
    expect(put).toContain('for (const key of EDITABLE)')
    expect(put).toContain("Cannot change the amount of an invoice with status")
    expect(put).toContain("query = query.eq('status', current.status)")
  })

  it('upload fails when the document is not attached', () => {
    expect(src('app/api/supplier-invoices/[id]/upload/route.ts')).toContain("'Failed to attach the document'")
  })

  it('client_invoice_id exists outside the archive', () => {
    const m = 'migrations/20261120_supplier_invoices_client_invoice.sql'
    expect(existsSync(join(process.cwd(), m))).toBe(true)
    expect(src(m)).toContain('ADD COLUMN IF NOT EXISTS client_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL')
  })

  it('the pages report a failed create and gate matching on status and currency', () => {
    expect(src('app/supplier-invoices/page.tsx')).toContain('Creating the supplier invoice failed')
    const page = src('app/supplier-invoices/[id]/page.tsx')
    expect(page).toContain("const matchable = invoice.status === 'received' || invoice.status === 'matched'")
    expect(page).toContain('=== invoiceCurrency')
  })
})

describe('invoice reminders and payments', () => {
  it('the /reminders history is the org-scoped route, joined through the invoice', () => {
    expect(src('app/api/reminders/history/route.ts')).toContain("export { GET } from '@/app/api/invoices/reminders/history/route'")
    const h = src('app/api/invoices/reminders/history/route.ts')
    expect(h).toContain(".eq('invoices.org_id', orgId)")
    expect(h).toContain('invoices:invoice_id!inner')
    expect(h).not.toContain(".in('invoice_id', allowedInvoiceIds)")
  })

  it('paused invoices stay in the reminder list so they can be resumed', () => {
    const r = src('app/api/invoices/reminders/route.ts')
    const get = r.slice(r.indexOf('export async function GET'), r.indexOf('export async function POST'))
    expect(get).not.toContain(".eq('reminder_paused', false)")
    expect(get).toContain('reminder_paused: !!invoice.reminder_paused')
    // the send path still skips them
    expect(r.slice(r.indexOf('export async function POST'))).toContain(".eq('reminder_paused', false)")
  })

  it('one reminder email builder, in the client’s language, brand escaped once', () => {
    const lib = src('lib/invoices/reminder-email.ts')
    expect(lib).toContain("t('team', { company: brand.name })")
    expect(lib).not.toContain('escapeHtml(brand.name)')
    const single = src('app/api/invoices/[id]/reminder/route.ts')
    expect(single).toContain("from '@/lib/invoices/reminder-email'")
    expect(single).toContain('resolveClientLocalesByEmail(supabase, [invoice.client_email], orgId)')
    expect(single).not.toContain('function generateReminderEmail')
  })

  it('deleting a payment rounds to the currency and leaves draft/cancelled alone', () => {
    const d = src('app/api/invoices/[id]/payments/[paymentId]/route.ts')
    expect(d).toContain('roundToCurrency(')
    expect(d).toContain("if (invoice.status === 'draft' || invoice.status === 'cancelled')")
  })

  it('editing the total re-derives the status; payments pin the currency', () => {
    const u = src('app/api/invoices/[id]/route.ts')
    expect(u).toContain("updateData.status = paid >= total ? 'paid' : 'partial'")
    expect(u).toContain('An invoice with payments keeps its currency')
  })
})

describe('B2B quote revisions and bulk updates', () => {
  it('revert refuses converted or booked quotes and foreign refs in the revision', () => {
    const r = src('app/api/b2b/quotes/[id]/revisions/revert/route.ts')
    expect(r).toContain('A converted or booked quote cannot be reverted')
    expect(r).toContain("live.status === 'converted' || live.converted_to_itinerary_id")
    expect(r).toContain('quoteRefsInOrg(supabaseAdmin, orgId, { itinerary_id: snapshot.itinerary_id, partner_id: snapshot.partner_id })')
  })

  it('revert restores the season premium; compare shows it', () => {
    const m = src('migrations/20261121_revert_quote_season_premium.sql')
    expect(m).toContain('CREATE OR REPLACE FUNCTION public.revert_quote_to_revision(')
    expect(m).toContain("season_uplift_amount = COALESCE(NULLIF(d->>'season_uplift_amount','')::numeric, 0)")
    expect(src('app/api/b2b/quotes/[id]/revisions/compare/route.ts')).toContain("key: 'season_uplift_amount'")
  })

  it('bulk-update sets only person statuses, never on converted quotes, with the actor', () => {
    const b = src('app/api/b2b/quotes/bulk-update/route.ts')
    expect(b).toContain("const SETTABLE = ['draft', 'sent', 'accepted', 'rejected', 'expired']")
    expect(b).toContain(".neq('status', 'converted')")
    expect(b).toContain(".is('converted_to_itinerary_id', null)")
    expect(b).toContain('p_changed_by: actor')
  })

  it('a language version is created by the signed-in user', () => {
    const v = src('app/api/b2b/quotes/[id]/versions/route.ts')
    expect(v).toContain('created_by: await getCurrentUserId()')
    expect(v).not.toContain('content.created_by')
  })
})

describe('traveller portal', () => {
  const e = src('app/api/portal/[token]/extras/route.ts')

  it('extras read the lock from the link (bookings has no such column)', () => {
    expect(e).toContain(".select('booking_id, org_id, passenger_id, revoked_at, expires_at, details_locked_at')")
    expect(e).toContain('canRequest: !link.details_locked_at')
    expect(e).toContain('if (link.details_locked_at) {')
    expect(e).not.toContain(".select('currency, details_locked_at')")
    expect(e).not.toContain(".select('id, details_locked_at')")
  })

  it("one traveller's duplicate is not another's request", () => {
    expect(e).toContain("dupQuery.eq('passenger_id', link.passenger_id)")
    expect(e).toContain("dupQuery.is('passenger_id', null)")
  })

  it('a change request is refused once the link is locked', () => {
    const c = src('app/api/portal/[token]/change-request/route.ts')
    expect(c).toContain('if (link.details_locked_at) {')
    expect(c).toContain('PORTAL_LOCKED.body')
  })
})

describe('template placeholders', () => {
  it('values are escaped into an HTML body, not into a subject', async () => {
    const { replacePlaceholders } = await import('@/lib/template-placeholders')
    const data = { client_name: 'Tanaka <Ken> & Co' }
    expect(replacePlaceholders('<p>Dear {{client_name}}</p>', data, { html: true }))
      .toBe('<p>Dear Tanaka &lt;Ken&gt; &amp; Co</p>')
    expect(replacePlaceholders('For {{client_name}}', data)).toBe('For Tanaka <Ken> & Co')
    expect(replacePlaceholders('{{missing}}', data, { html: true })).toBe('{{missing}}')
    for (const p of ['app/inbox/page.tsx', 'components/unified/ComposeEmailModal.tsx']) {
      expect(src(p)).toContain('replacePlaceholders(selectedTemplate.content, finalData, { html: true })')
    }
  })
})

describe("friends mode: a friend's link asks for a code only they receive", () => {
  it('codeMatches: right code, unexpired, under the attempt cap', async () => {
    const { hashVerifyCode, codeMatches, MAX_ATTEMPTS } = await import('@/lib/portal/verify-code')
    const token = 't'.repeat(40)
    const later = new Date(Date.now() + 60_000).toISOString()
    const state = { verify_code_hash: hashVerifyCode(token, '042917'), verify_code_expires_at: later, verify_code_attempts: 0 }
    expect(codeMatches(token, '042917', state)).toBe(true)
    expect(codeMatches(token, '０４２９１７', state)).toBe(true) // full-width digits
    expect(codeMatches(token, '042918', state)).toBe(false)
    expect(codeMatches('u'.repeat(40), '042917', state)).toBe(false) // bound to its link
    expect(codeMatches(token, '042917', { ...state, verify_code_expires_at: new Date(Date.now() - 1).toISOString() })).toBe(false)
    expect(codeMatches(token, '042917', { ...state, verify_code_attempts: MAX_ATTEMPTS })).toBe(false)
    expect(codeMatches(token, '', { ...state, verify_code_hash: null })).toBe(false)
  })

  it('a traveller with an email (or an issued code) must give it', async () => {
    const { travellerNeedsCode } = await import('@/lib/portal/verify-code')
    expect(travellerNeedsCode({ email: 'a@b.jp' }, {})).toBe(true)
    expect(travellerNeedsCode({ email: ' ' }, {})).toBe(false)
    expect(travellerNeedsCode({ email: null }, { verify_code_hash: 'x' })).toBe(true)
  })

  it('consume clears on success and discards after the last wrong try', async () => {
    const { hashVerifyCode, consumeVerifyCode, MAX_ATTEMPTS } = await import('@/lib/portal/verify-code')
    const token = 'k'.repeat(40)
    const writes: Array<Record<string, unknown>> = []
    const admin = { from: () => ({ update: (v: Record<string, unknown>) => { writes.push(v); return { eq: async () => ({}) } } }) }
    const state = { verify_code_hash: hashVerifyCode(token, '111111'), verify_code_expires_at: new Date(Date.now() + 60_000).toISOString(), verify_code_attempts: MAX_ATTEMPTS - 1 }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await consumeVerifyCode(admin as any, token, '222222', state)).toBe(false)
    expect(writes.at(-1)).toMatchObject({ verify_code_hash: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await consumeVerifyCode(admin as any, token, '111111', { ...state, verify_code_attempts: 0 })).toBe(true)
    expect(writes.at(-1)).toMatchObject({ verify_code_hash: null, verify_code_attempts: 0 })
  })

  it('the gate, the link email and the resend route use it; the code never goes back to the browser', () => {
    const v = src('app/api/portal/[token]/verify/route.ts')
    expect(v).toContain('if (ok && travellerNeedsCode(pax, link))')
    expect(v).toContain('consumeVerifyCode(supabase, token, body?.code, link)')
    const links = src('lib/portal-links.ts')
    expect(links).toContain('issueVerifyCode(admin, opts.token, LINK_EMAIL_CODE_TTL_MS)')
    expect(links).toContain("codeEmailHtml(code, '7日間')")
    const resend = src('app/api/portal/[token]/verify-code/route.ts')
    expect(resend).toContain('issueVerifyCode(supabase, token, RESEND_CODE_TTL_MS)')
    expect(resend).toContain('if (Date.now() - issuedAt < RESEND_COOLDOWN_MS) return DONE()')
    expect(resend).not.toMatch(/NextResponse\.json\(\{[^}]*\bcode\b/)
    const gate = src('app/portal/[token]/VerifyGate.tsx')
    expect(gate).toContain('autoComplete="one-time-code"')
    expect(gate).toContain('/verify-code')
    expect(src('app/portal/[token]/page.tsx')).toContain('requireCode={requireCode}')
  })

  it('cookies from before the code are void; the lead cannot re-point a sent friend’s email', () => {
    expect(src('lib/booking-portal.ts')).toContain('`portal-verify:v2:${token}`')
    const co = src('app/api/portal/[token]/coordinator/route.ts')
    expect(co).toContain("Their link has been sent — ask the office to change their email.")
    expect(src('migrations/20261122_portal_verify_code.sql')).toContain('ADD COLUMN IF NOT EXISTS verify_code_hash text')
  })

  it('switching to friends revokes the family link', () => {
    const b = src('app/api/bookings/[id]/route.ts')
    expect(b).toContain("if (updates.portal_mode === 'friends')")
    const rev = b.slice(b.indexOf("if (updates.portal_mode === 'friends')"))
    expect(rev.slice(0, 600)).toContain(".is('passenger_id', null)")
    expect(rev.slice(0, 600)).toContain(".eq('org_id', orgId)")
    expect(src('app/components/PortalCoordinator.tsx')).toContain('The family link stops working')
  })
})

describe('Gmail connect', () => {
  it('refuses a consent with Gmail permissions unticked, and says why', () => {
    const cb = src('app/api/auth/google/callback/route.ts')
    expect(cb).toContain("GMAIL_SCOPES.filter(s => s.includes('/auth/gmail.')).some(s => !granted.has(s))")
    expect(cb).toContain('/settings/email?error=missing_permissions')
    expect(src('app/settings/email/page.tsx')).toContain('missing_permissions:')
  })
})
