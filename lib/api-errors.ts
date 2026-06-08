import { NextResponse } from 'next/server'

const isDev = () => process.env.NODE_ENV !== 'production'

/**
 * Returns a client-safe error string.
 *
 * In production this is always the generic `fallback`, so internal details
 * (DB column/constraint names, SQL, stack traces) are never leaked to callers.
 * In development the real error message is returned to aid debugging.
 *
 * This helper is intentionally pure (it does not log) and returns a string so it
 * can be dropped into an existing response shape without changing it, e.g.
 *   return NextResponse.json({ success: false, error: clientMessage(err, 'Failed to save') }, { status: 500 })
 * Keep the surrounding `console.error(...)` so the full error stays traceable.
 */
export function clientMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (isDev()) {
    if (err instanceof Error && err.message) return err.message
    if (typeof err === 'string' && err) return err
    if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
      return (err as { message: string }).message
    }
  }
  return fallback
}

/**
 * Convenience wrapper that logs the full error server-side and returns a
 * client-safe error response of shape `{ error: <message> }`. Use this when a
 * route's error response is just `{ error: ... }`; for other shapes (e.g.
 * `{ success: false, error: ... }`) use {@link clientMessage} inside the existing
 * object instead.
 */
export function apiError(err: unknown, fallback = 'Something went wrong', status = 500): NextResponse {
  console.error(err)
  return NextResponse.json({ error: clientMessage(err, fallback) }, { status })
}
