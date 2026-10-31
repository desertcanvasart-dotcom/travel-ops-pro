// Settings audit (2026-10-14), findings 3, 7, 8 and 13: every Settings form
// the server refuses renders read-only for that role, with a short note —
// matching the server's actual rule per form — and the pages agents may use
// are reachable. The repo has no DOM renderer, so these read the source: the
// gate each component computes and what it hides behind it.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'

const src = (f: string) => readFileSync(f, 'utf8')

describe('each form follows its server rule', () => {
  it('Company Profile: admin (owner included) saves; only the owner renames', () => {
    const s = src('app/components/CompanyProfileCard.tsx')
    expect(s).toContain('const readOnly = !isAdmin')
    expect(s).toContain('<fieldset disabled={readOnly}')
    expect(s).toContain("{ts('readOnlyAdmin')}")
    expect(s).toMatch(/\{!readOnly && <div className="flex items-center gap-3 mt-5">/) // Save
    expect(s).toMatch(/\{!readOnly && <button\s+onClick=\{\(\) => fileRef\.current\?\.click\(\)\}/) // Upload logo
    expect(s).toContain("const isOwner = role === 'owner'")
    expect(s).toContain('disabled={!isOwner}')
    expect(s).not.toContain('image/svg+xml')
  })

  it('Payment Terms: the owner alone (an admin is refused too)', () => {
    const s = src('app/components/PaymentTermsCard.tsx')
    expect(s).toContain("const readOnly = role !== 'owner'")
    expect(s).toContain('<fieldset disabled={readOnly}')
    expect(s).toContain("{ts('readOnlyOwner')}")
    expect(s).toMatch(/\{!readOnly && <div className="flex items-center gap-3 mt-4">/)
    // …and that is the server's rule.
    expect(src('app/api/settings/payment-terms/route.ts')).toContain("?.role !== 'owner'")
  })

  it('Partner Integrations: admin creates, pauses, rotates and disconnects', () => {
    const s = src('components/settings/PartnerIntegrationsPanel.tsx')
    expect(s).toContain('const { isAdmin } = useRole()')
    expect(s).toMatch(/\{isAdmin && \(\s*<button\s+onClick=\{\(\) => setShowCreate\(true\)\}/)
    expect(s).toMatch(/\{isAdmin && <>\s*<button\s+onClick=\{\(\) => patch\(i\.id, \{ is_active: !i\.is_active \}\)\}/)
    expect(s).toMatch(/\{isAdmin && <>\s*<button\s+onClick=\{\(\) =>\s+patch\(i\.id, \{ rotate_api_key: true \}/)
    expect(s).toContain('{!isAdmin && (')
  })

  it('Accounting: Connect and Disconnect for admins; everyone else is told why', () => {
    const s = src('app/settings/accounting/page.tsx')
    expect(s).toContain('const { role, isAdmin } = useRole()')
    expect(s).toMatch(/\{isAdmin && \(\s*<button\s+onClick=\{\(\) => disconnectAccounting\(p\.key\)\}/)
    expect(s).toContain(') : isAdmin ? (')
    expect(s).toContain('Only the agency owner or an admin can connect or disconnect the accounting software.')
    expect(s).toContain("searchParams.get('replaced')")
  })

  it('Destinations: admin writes; a manager reads', () => {
    const s = src('app/settings/destinations/page.tsx')
    expect(s).toContain('const { isAdmin } = useRole()')
    expect(s).toContain("{t('readOnly')}")
    for (const control of ["{isAdmin && <>", "{isAdmin && (\n                  <div className=\"flex items-center gap-2 pt-1\">", '{isAdmin && <button', "{isAdmin && (\n      <div className=\"mt-6"]) {
      expect(s).toContain(control)
    }
    expect(s).toContain('readOnly={!isAdmin}')
  })

  it('Organization page: the actions the server allows, by role', () => {
    const s = src('app/settings/organization/page.tsx')
    expect(s).toContain("const isOwner = role === 'owner'")
    expect(s).toContain('const canLeave = isAdmin && !(isOwner && ownerCount <= 1)')
    expect(s).toMatch(/\{isAdmin && \(\s*<button\s+onClick=\{\(\) => setShowInvite/) // invite: admin
    expect(s).toMatch(/\{isOwner && \(\s*<button\s+onClick=\{\(\) => setEditingName\(true\)\}/) // rename: owner
    expect(s).toContain('{(m.user_id === user?.id ? canLeave : isOwner) && (') // leave vs remove
    expect(s).toMatch(/\{isAdmin && \(\s*<button\s+onClick=\{\(\) => cancelInvite/) // cancel invite: admin
    // The server rules those mirror.
    expect(src('app/api/organization/route.ts')).toContain("?.role !== 'owner'")
    expect(src('app/api/organization/branding/route.ts')).toContain('renameNeedsOwner(')
  })

  it('Vocabulary keeps its read-only notice for non-admins', () => {
    expect(src('app/settings/vocabulary/page.tsx')).toContain('{!isAdmin && (')
  })
})

describe('agents\' own pages', () => {
  it('/settings/preferences exists, and the WhatsApp parser links agents to it', () => {
    expect(existsSync('app/settings/preferences/page.tsx')).toBe(true)
    expect(src('app/settings/preferences/page.tsx')).toContain('<PreferencesPanel />')
    const parser = src('app/whatsapp-parser/whatsapp-parser-content.tsx')
    expect(parser).toContain('href="/settings/preferences"')
    expect(parser).not.toContain('/settings?tab=preferences')
  })

  it('/settings/email hides the managers\' office addresses from agents', () => {
    const s = src('app/settings/email/page.tsx')
    expect(s).toContain('{canManageSettings && <OfficeAddressesCard />}')
  })
})

describe('the licence card', () => {
  it('claims no seat count — nothing counts or enforces seats', () => {
    const s = src('app/components/LicenceCard.tsx')
    expect(s).not.toContain('licence.seats')
    expect(s).not.toContain("t('seats')")
  })
})
