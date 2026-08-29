// ============================================
// EMPTY STRING IS NOT A VALUE
// ============================================
// An HTML form field the user left alone submits `""`, not null. For a text
// column that is merely untidy. For a date, a timestamp, a number or a uuid it
// is a hard Postgres error:
//
//   invalid input syntax for type timestamp: ""
//
// That is what made the Record Payment form discard payments (AUT-W01). Its
// state initialises `due_date: ''`, and a "Full payment" never fills a due
// date in — so every single submission posted `due_date: ""`, the insert threw
// 22007, and the money was never recorded.
//
// Fixing the one form would leave the trap armed for the next one: 22 forms in
// this app initialise a date field to `''`. So the coercion belongs on the
// server, at the boundary where a client-supplied body reaches the database,
// where no future form can route around it.
//
// Deliberately NOT a validator. It does not decide whether a value is allowed
// — it only says that "the user typed nothing" is spelled `null` in a database
// and `""` in a browser, and translates between the two.

/**
 * Replace empty/whitespace-only string values with null.
 *
 * Shallow by design: a nested object is a JSONB column, and `{ note: '' }` is
 * a legitimate stored value there — rewriting inside it would change data the
 * caller meant to keep. Arrays are left alone for the same reason.
 */
export function blankToNull<T extends Record<string, unknown>>(body: T): T {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    out[key] = typeof value === 'string' && value.trim() === '' ? null : value
  }
  return out as T
}
