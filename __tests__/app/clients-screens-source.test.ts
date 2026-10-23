// The Clients screens are React pages that cannot be rendered here, so these
// read their source for the properties that matter: nothing picks a client's
// rows from the browser by id alone, the forms send what the server accepts,
// and the email lookups ignore case.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8')

const SCREENS = [
  'app/clients/page.tsx',
  'app/clients/new/page.tsx',
  'app/clients/[id]/page.tsx',
  'app/clients/[id]/edit/page.tsx',
  'app/contacts/contacts-content.tsx',
  'components/ClientTimeline.tsx',
  'components/AddNoteModal.tsx',
  'components/LogCommunicationModal.tsx',
]

describe('no browser reads or writes of client rows', () => {
  it.each(SCREENS)('%s goes through the server routes', file => {
    const src = read(file)
    expect(src, 'imports the browser supabase client').not.toMatch(/from '@\/lib\/supabase'/)
    expect(src).not.toMatch(/\.from\('(clients|client_summary|client_notes|communication_history|client_followups|itineraries)'\)/)
  })
})

describe('the New client form', () => {
  const src = read('app/clients/new/page.tsx')
  it('creates through POST /api/clients (company, numbering, duplicates, NULL for blanks) as a lead', () => {
    expect(src).toContain("fetch('/api/clients'")
    expect(src).toContain("status: 'lead'")
  })
  it('offers to open the existing client or create anyway when the email is taken', () => {
    expect(src).toContain('res.status === 409')
    expect(src).toContain('allow_duplicate')
    expect(src).toContain("t('createAnyway')")
    expect(src).toContain('/clients/${duplicate.id}')
  })
})

describe('the Edit client form', () => {
  const src = read('app/clients/[id]/edit/page.tsx')
  it('does not require an email (clients from WhatsApp or a web order have none)', () => {
    expect(src).not.toMatch(/rules: \[validationRules\.required\(\), validationRules\.email\(\)\]/)
    expect(src).not.toMatch(/getFieldName\('email'\)\} <span className="text-red-500">\*/)
  })
  it('keeps a passport type it has no option for (a client made by the API holds "other")', () => {
    expect(src).toMatch(/!\['euro_passport', 'other_passport'\]\.includes\(formData\.passport_type\)/)
  })
  it('saves through PUT /api/clients/[id] and shows the reason when it refuses', () => {
    expect(src).toContain("method: 'PUT'")
    expect(src).toContain('err?.message')
  })
})

describe('/contacts', () => {
  const src = read('app/contacts/contacts-content.tsx')
  it('sends only real columns when editing, with First and Last name filled from the row', () => {
    const edit = src.slice(src.indexOf('const handleEdit'), src.indexOf('const handleView'))
    for (const key of ['first_name', 'last_name', 'email', 'phone', 'nationality', 'status', 'preferred_language', 'internal_notes']) {
      expect(edit, key).toContain(`${key}: raw.${key}`)
    }
    expect(edit).not.toContain('...contact.rawData')
  })
  it('has no WhatsApp field to lose (there is no such column) and no VIP/active status', () => {
    expect(src).not.toMatch(/key: 'whatsapp'/)
    const code = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
    expect(code).not.toMatch(/'vip'|'active'/)
  })
})

describe('email matching ignores case', () => {
  it('B2B convert looks the client up with ilike and the oldest wins', () => {
    const src = (read('app/api/b2b/quotes/[id]/convert/route.ts') + read('lib/b2b/convert-template-quote.ts'))
    const lookup = src.slice(src.indexOf('Create or find client'), src.indexOf('Create or find client') + 1600)
    expect(lookup).toContain(".ilike('email', escapeLike(")
    expect(lookup).not.toContain(".eq('email'")
    expect(lookup).toContain(".order('created_at', { ascending: true })")
  })
  it('the mailbox sync matches the sender with ilike', () => {
    const src = read('lib/email/sync-mailbox.ts')
    const lookup = src.slice(src.indexOf('Try to find client by email'), src.indexOf('Try to find client by email') + 1200)
    expect(lookup).toContain(".ilike('email', escapeLike(senderEmail))")
    expect(lookup).not.toContain(".eq('email'")
  })
})
