// ============================================
// A template's code: generated, and retried when it clashes
// ============================================
// Codes are CITY-TYPE-NNN (CAI-DAY-482) with a random 3-digit tail, unique per
// company (UNIQUE (org_id, template_code), 20261207). One in a thousand per
// city and type is not rare once a company has a few dozen day tours in Cairo,
// and a clash used to come back as a bare 500 "Failed to create template". A
// GENERATED code is now drawn again on a clash; a code the user TYPED is never
// changed behind their back — that clash is a 409 naming it.

/** CITY-TYPE-NNN from the programme's first city and its tour type. */
export function generateTemplateCode(
  cities: readonly (string | null | undefined)[] | null | undefined,
  tourType: string | null | undefined,
  random: () => number = Math.random
): string {
  const city = (cities ?? []).find(c => typeof c === 'string' && c.trim())?.trim() || 'EGYPT'
  const type = (tourType || 'tour').toUpperCase().replace(/_/g, '-')
  const n = Math.floor(random() * 1000).toString().padStart(3, '0')
  return `${city.substring(0, 3).toUpperCase()}-${type.substring(0, 3)}-${n}`
}

/** Postgres unique_violation, as supabase-js reports it. */
export function isUniqueViolation(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  return err.code === '23505' || /duplicate key|unique constraint/i.test(err.message ?? '')
}

export type CodeInsertResult<T> =
  | { data: T; error: null; code: string; clash: false }
  | { data: null; error: { code?: string; message?: string }; code: string; clash: boolean }

/**
 * Insert with a code: the typed one once, or generated ones up to `tries`
 * times while each clashes. `clash: true` on the way out means the typed code
 * (or every generated one) is taken — the route answers 409 for that.
 */
export async function insertWithTemplateCode<T>(
  insert: (code: string) => PromiseLike<{ data: T | null; error: { code?: string; message?: string } | null }>,
  opts: { typed?: string | null; cities?: readonly (string | null | undefined)[] | null; tourType?: string | null; tries?: number; random?: () => number }
): Promise<CodeInsertResult<T>> {
  const typed = typeof opts.typed === 'string' ? opts.typed.trim() : ''
  const tries = typed ? 1 : Math.max(1, opts.tries ?? 5)
  let last: { code?: string; message?: string } = { message: 'Failed to create template' }
  let code = typed
  for (let i = 0; i < tries; i++) {
    code = typed || generateTemplateCode(opts.cities, opts.tourType, opts.random)
    const { data, error } = await insert(code)
    if (!error && data) return { data, error: null, code, clash: false }
    last = error ?? last
    if (!isUniqueViolation(error)) return { data: null, error: last, code, clash: false }
  }
  return { data: null, error: last, code, clash: true }
}
