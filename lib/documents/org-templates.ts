// ============================================
// Which operator documents an organization has
// ============================================
// The operations sheet, the 日程表 and the guest questionnaire are one
// operator's own paper (ATS): Cairo and upper-Egypt guide columns, its
// letterhead layout, its printed questionnaire. Every organization was offered
// them. Which ones an org has is now data — organizations.document_templates
// (migration 20261116) — as lib/documents/registry.ts always said it should
// be, never a check on who the org is.
//
// Until that migration is applied the column does not exist, and every org
// keeps every document, exactly as before: the operator whose paper this is
// must not lose it to a deploy that ran ahead of its migration.

/** Every operator document an org can be given. */
export const ORG_DOCUMENT_TEMPLATES = [
  'ats-operations-sheet',
  'ats-daily-itinerary',
  'ats-questionnaire',
] as const

export type OrgDocumentTemplate = (typeof ORG_DOCUMENT_TEMPLATES)[number]

type Db = { from: (table: string) => unknown }
interface OrgQuery {
  select(cols: string): {
    eq(col: string, value: string): {
      maybeSingle(): PromiseLike<{
        data: { document_templates?: unknown } | null
        error: { code?: string; message?: string } | null
      }>
    }
  }
}

function columnMissing(error: { code?: string; message?: string }): boolean {
  return (error.code === '42703' || error.code === 'PGRST204') && (error.message ?? '').includes('document_templates')
}

/** The documents this org has. Throws on a read failure — a passing database
 *  error must not read as "this org has none". */
export async function orgDocumentTemplates(db: Db, orgId: string): Promise<OrgDocumentTemplate[]> {
  const { data, error } = await (db.from('organizations') as OrgQuery)
    .select('document_templates')
    .eq('id', orgId)
    .maybeSingle()
  if (error) {
    if (columnMissing(error)) return [...ORG_DOCUMENT_TEMPLATES]
    throw new Error(error.message || 'Could not read the organization')
  }
  const stored = Array.isArray(data?.document_templates) ? data.document_templates : []
  return ORG_DOCUMENT_TEMPLATES.filter(slug => stored.includes(slug))
}

export async function orgHasDocumentTemplate(db: Db, orgId: string, slug: OrgDocumentTemplate): Promise<boolean> {
  return (await orgDocumentTemplates(db, orgId)).includes(slug)
}
