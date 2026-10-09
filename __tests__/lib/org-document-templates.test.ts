// ============================================
// Which operator documents an organization has
// ============================================
// ATS's operations sheet, 日程表 and questionnaire are offered only to the orgs
// that have them (organizations.document_templates, migration 20261116). Before
// that migration is applied every org keeps them — ATS must not lose its paper
// to a deploy that ran ahead of its migration — and a failed read must not
// quietly read as "none".

import { describe, it, expect } from 'vitest'
import { orgDocumentTemplates, orgHasDocumentTemplate, ORG_DOCUMENT_TEMPLATES } from '@/lib/documents/org-templates'

function db(result: { data: unknown; error: { code?: string; message?: string } | null }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => result,
  }
  return { from: () => chain }
}

describe('orgDocumentTemplates', () => {
  it('returns what the org has, in a stable order, ignoring unknown slugs', async () => {
    const got = await orgDocumentTemplates(
      db({ data: { document_templates: ['ats-questionnaire', 'something-else', 'ats-operations-sheet'] }, error: null }),
      'org1'
    )
    expect(got).toEqual(['ats-operations-sheet', 'ats-questionnaire'])
  })

  it('gives a new org none', async () => {
    expect(await orgDocumentTemplates(db({ data: { document_templates: [] }, error: null }), 'org1')).toEqual([])
    expect(await orgHasDocumentTemplate(db({ data: null, error: null }), 'org1', 'ats-daily-itinerary')).toBe(false)
  })

  it('keeps every document while the column does not exist yet', async () => {
    for (const error of [
      { code: '42703', message: 'column organizations.document_templates does not exist' },
      { code: 'PGRST204', message: "Could not find the 'document_templates' column" },
    ]) {
      expect(await orgDocumentTemplates(db({ data: null, error }), 'org1')).toEqual([...ORG_DOCUMENT_TEMPLATES])
    }
  })

  it('throws on any other read failure rather than answering "none"', async () => {
    await expect(
      orgDocumentTemplates(db({ data: null, error: { code: '08006', message: 'connection failure' } }), 'org1')
    ).rejects.toThrow('connection failure')
  })
})
