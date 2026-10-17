// ============================================
// NOTIFICATION PREFERENCES — the one source of truth
// ============================================
// The email a user gets is a courtesy on top of the in-app notification, and
// the user must be able to turn it off. That switch lives here.
//
// The bug this fixes: the Settings toggle ("Email notifications") wrote to
// user_settings with a hardcoded id:'default' — a literal that isn't even a
// valid uuid for the uuid PK, so the upsert errored, was swallowed, and NOTHING
// was ever saved. And no send path ever read the preference anyway. So turning
// email off did nothing, and every owner/admin/manager kept getting flooded.
//
// Only what something reads is kept: the in-app switch was saved and never
// honoured (the bell shows every notification), and task_completed toggled
// email for a type nothing creates. Both are gone; a stored value is ignored.
//
// user_settings already has a per-user `user_id` column (UNIQUE, FK to
// auth.users) — it was simply never used. Preferences are now keyed on it, and
// the send path (lib/notifications.ts) consults this module before emailing.
//
// Per company: a person in both companies chooses separately for each. The
// row stays one per login (user_id is UNIQUE); the choices live in the same
// JSON column under by_org[<org id>]. The top-level flags are what was saved
// before this split and are the starting point for a company with no choice
// of its own yet — so nobody's saved setting is lost, and no migration is
// needed.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface NotificationPreferences {
  task_assigned: boolean
  task_due_soon: boolean
  task_overdue: boolean
  /** Master switch: false = never email this user, whatever the per-type flags. */
  email_enabled: boolean
}

// Matches the column default in migrations/20260829_baseline_schema.sql.
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  task_assigned: true,
  task_due_soon: true,
  task_overdue: true,
  email_enabled: true,
}

/** Coerce whatever is stored (possibly partial/legacy) into a full object. */
export function normalizePreferences(
  raw: Partial<Record<keyof NotificationPreferences, unknown>> | null | undefined
): NotificationPreferences {
  const src = raw ?? {}
  const bool = (key: keyof NotificationPreferences): boolean =>
    typeof src[key] === 'boolean' ? (src[key] as boolean) : DEFAULT_NOTIFICATION_PREFERENCES[key]
  return {
    task_assigned: bool('task_assigned'),
    task_due_soon: bool('task_due_soon'),
    task_overdue: bool('task_overdue'),
    email_enabled: bool('email_enabled'),
  }
}

type StoredPreferences = Partial<Record<keyof NotificationPreferences, unknown>> & {
  by_org?: Record<string, Partial<Record<keyof NotificationPreferences, unknown>>>
}

/** The choices that apply in one company (see the note at the top). */
export function preferencesForOrg(raw: unknown, orgId: string | null | undefined): NotificationPreferences {
  const stored = (raw && typeof raw === 'object' ? raw : {}) as StoredPreferences
  const own = orgId ? stored.by_org?.[orgId] : undefined
  return normalizePreferences(own && typeof own === 'object' ? own : stored)
}

/** The stored JSON with one company's choices replaced; every other
 *  company's, and the pre-split top-level flags, kept as they were. */
export function withOrgPreferences(
  raw: unknown,
  orgId: string,
  prefs: NotificationPreferences
): StoredPreferences {
  const stored = (raw && typeof raw === 'object' ? raw : {}) as StoredPreferences
  const byOrg = stored.by_org && typeof stored.by_org === 'object' ? stored.by_org : {}
  return { ...stored, by_org: { ...byOrg, [orgId]: { ...prefs } } }
}

/**
 * Read a user's notification preferences in one company. Returns defaults when the user has
 * none saved, or when the lookup fails — a missing row must never turn a
 * courtesy email into an error on the request that triggered it.
 */
export async function getNotificationPreferences(
  db: Pick<SupabaseClient<any, any, any, any, any>, 'from'>,
  userId: string,
  orgId: string | null
): Promise<NotificationPreferences> {
  try {
    const { data } = await db
      .from('user_settings')
      .select('notification_preferences')
      .eq('user_id', userId)
      .maybeSingle()
    return preferencesForOrg(
      (data as { notification_preferences?: unknown } | null)?.notification_preferences,
      orgId
    )
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES }
  }
}

/**
 * Should we email this user for a notification of `type`?
 *
 * `email_enabled` is the master switch. On top of it, the three task_* types
 * have their own per-type toggle; every other type (trip/whatsapp/portal
 * change requests, digests) is governed by the master switch alone.
 */
export function shouldEmailForType(
  prefs: NotificationPreferences,
  type: string
): boolean {
  if (!prefs.email_enabled) return false
  if (type in prefs) {
    const perType = (prefs as unknown as Record<string, unknown>)[type]
    if (typeof perType === 'boolean') return perType
  }
  return true
}
