// ============================================
// Turn a Postgres unique violation into a sentence that names the collision
// ============================================
// WHY: a 23505 handled as `'A <thing> with these details already exists.'`
// tells the operator that something they can see is a duplicate. Often it
// isn't. On 2026-09-19 adding a guide named "Nasser Badawi" was refused with
// that message while the clash was on `supplier_code` — a column the form does
// not show — against a hotel group in a different section. The operator went
// looking for a guide that had never existed.
//
// Postgres already says exactly what clashed, in the error DETAIL:
//   Key (supplier_code)=(SUP-0070) already exists.
// PostgREST passes that through as `details`. Reading it costs nothing and
// turns an unfalsifiable message into a checkable one.
// ============================================

export type PgLikeError = {
  code?: string | null
  message?: string | null
  details?: string | null
}

/** The column(s) and value(s) Postgres says collided, or null if it did not
 *  say (a partial/expression index, or a driver that drops DETAIL). */
export function uniqueViolationKey(
  error: PgLikeError | null | undefined
): { columns: string[]; value: string } | null {
  const detail = error?.details || error?.message || ''
  const m = /Key \(([^)]+)\)=\(([\s\S]*)\) already exists/i.exec(detail)
  if (!m) return null
  const columns = m[1].split(',').map(c => c.trim().replace(/^"|"$/g, '')).filter(Boolean)
  if (columns.length === 0) return null
  return { columns, value: m[2] }
}

/** Human label for a column name: `supplier_code` → `supplier code`. */
function label(column: string): string {
  return column.replace(/_/g, ' ')
}

/**
 * A 409 message for a unique violation.
 *
 * `visibleFields` are the columns the operator actually filled in on this
 * form. A clash on one of those is an ordinary duplicate and reads as one. A
 * clash on anything else is an internal key the operator cannot see, and the
 * message says so rather than implying they entered something twice — the
 * whole point of this module.
 */
export function uniqueViolationMessage(
  error: PgLikeError | null | undefined,
  opts: { subject: string; visibleFields?: string[] }
): string {
  const subject = opts.subject
  const key = uniqueViolationKey(error)
  if (!key) {
    return `Another ${subject} already holds one of these values. Change what makes this one different, or open the existing record instead.`
  }

  const visible = new Set(opts.visibleFields ?? [])
  const names = key.columns.map(label).join(' + ')
  const hidden = key.columns.every(c => !visible.has(c))

  if (hidden) {
    // Not the operator's doing. Name the value AND say it is internal, so the
    // report that reaches us is "SUP-0070 clashed", not "it says it exists".
    return `Could not save: the ${names} "${key.value}" is already used by another ${subject}. This is an internal key, not something you entered — the record you are adding does not exist yet. Report this value to support.`
  }

  return `Another ${subject} already has the ${names} "${key.value}". Open that record and edit it, or change the ${names} here.`
}
