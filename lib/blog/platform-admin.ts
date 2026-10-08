// Who may write the product blog.
//
// The blog belongs to the product, not to any agency using it, so an
// organisation's owner or admin is NOT enough: the writers are the people
// listed in PLATFORM_ADMIN_EMAILS (comma-separated), a deployment setting.
// Unset, nobody can write — the blog simply shows what is published.

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/** The configured platform admins, lower-cased. */
export function platformAdminEmails(env: string | undefined = process.env.PLATFORM_ADMIN_EMAILS): Set<string> {
  return new Set(
    (env ?? '')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function isPlatformAdmin(email: string | null | undefined, env?: string): boolean {
  return !!email && platformAdminEmails(env).has(email.trim().toLowerCase())
}

/** The signed-in user (verified with Supabase), or null. */
export async function currentUser(): Promise<{ id: string; email: string | null } | null> {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (name: string) => cookieStore.get(name)?.value, set() {}, remove() {} } },
    )
    const { data: { user } } = await supabase.auth.getUser()
    return user ? { id: user.id, email: user.email ?? null } : null
  } catch {
    return null
  }
}

/** For API routes: the platform admin, or the status to refuse with. */
export async function requirePlatformAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; status: 401 | 403; error: string }
> {
  const user = await currentUser()
  if (!user) return { ok: false, status: 401, error: 'Not signed in' }
  if (!isPlatformAdmin(user.email)) return { ok: false, status: 403, error: 'Only platform admins can manage the blog' }
  return { ok: true, userId: user.id }
}
