/**
 * Client-safe error messaging for API routes.
 *
 * A caught exception's `.message` (or a Supabase/Postgres error's message)
 * often leaks internal detail — DB column/constraint names, SQL fragments,
 * table structure, stack traces. Returning it straight to the caller hands
 * that to anyone hitting the endpoint.
 *
 * `clientMessage(err, fallback)` returns the real message in development (so
 * local debugging is unaffected) but a generic `fallback` in production. It
 * returns a string, so it drops into an existing response shape unchanged:
 *
 *   } catch (err) {
 *     console.error('...', err)                 // keep full detail in the logs
 *     return NextResponse.json(
 *       { error: clientMessage(err, 'Failed to load bookings') },
 *       { status: 500 }
 *     )
 *   }
 *
 * Server-side logging should still capture the real error — mask only what
 * crosses the network to the client.
 */
export function clientMessage(err: unknown, fallback: string): string {
  if (process.env.NODE_ENV === 'production') {
    return fallback
  }
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string' && err) return err
  // Supabase/PostgREST errors are plain objects with a `message` field.
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message
    if (typeof m === 'string' && m) return m
  }
  return fallback
}
