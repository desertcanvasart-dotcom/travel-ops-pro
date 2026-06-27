// Sanitize a user-supplied search term before interpolating it into a PostgREST
// `.or(...)` / `.ilike(...)` filter.
//
// These filters are built by string concatenation (e.g.
// `query.or(\`name.ilike.%${search}%,email.ilike.%${search}%\`)`), so PostgREST
// metacharacters in the value can break out of the intended ilike and inject
// arbitrary OR conditions — a filter-bypass / data-exfiltration vector, made
// worse by the routes using the RLS-bypassing service-role client. A search box
// is a fuzzy match, not a place for operators: strip the control characters and
// user-supplied wildcards, collapse whitespace, and bound the length. `.`/`@`/`-`
// are kept so emails and names still match.
export function sanitizeSearchTerm(input: unknown): string {
  if (typeof input !== 'string') return ''
  return input
    .replace(/[,()*:%\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
}
