// ============================================
// Whose message templates an organization sees
// ============================================
// message_templates.org_id (migration 20261117): an org's own templates, plus
// the shared defaults (org_id NULL) every org sees. A default is read-only —
// editing it saves the org its own copy, which then stands in for the default
// in that org's list (source_template_id). The routes read with the service
// role, so every query goes through these.

export interface ScopedTemplate {
  id: string
  org_id?: string | null
  source_template_id?: string | null
}

/** PostgREST `or` filter: the org's own templates and the shared defaults. */
export function visibleToOrg(orgId: string): string {
  return `org_id.eq.${orgId},org_id.is.null`
}

/** Drop the shared defaults an org has replaced with its own copy. */
export function withOrgCopies<T extends ScopedTemplate>(rows: T[], orgId: string): T[] {
  const replaced = new Set(
    rows.filter(r => r.org_id === orgId && r.source_template_id).map(r => r.source_template_id as string)
  )
  return rows.filter(r => !(r.org_id == null && replaced.has(r.id)))
}

export type TemplateAccess = 'own' | 'shared' | 'none'

/** Whether an org may edit a template in place, copy it, or not see it at all. */
export function templateAccess(row: { org_id?: string | null } | null, orgId: string): TemplateAccess {
  if (!row) return 'none'
  if (row.org_id === orgId) return 'own'
  if (row.org_id == null) return 'shared'
  return 'none'
}
