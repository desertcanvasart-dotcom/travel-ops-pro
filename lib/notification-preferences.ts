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
// user_settings already has a per-user `user_id` column (UNIQUE, FK to
// auth.users) — it was simply never used. Preferences are now keyed on it, and
// the send path (lib/notifications.ts) consults this module before emailing.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface NotificationPreferences {
  task_assigned: boolean
  task_due_soon: boolean
  task_overdue: boolean
  task_completed: boolean
  /** Master switch: false = never email this user, whatever the per-type flags. */
  email_enabled: boolean
  in_app_enabled: boolean
}

// Matches the column default in migrations/20260829_baseline_schema.sql.
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  task_assigned: true,
  task_due_soon: true,
  task_overdue: true,
  task_completed: false,
  email_enabled: true,
  in_app_enabled: true,
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
    task_completed: bool('task_completed'),
    email_enabled: bool('email_enabled'),
    in_app_enabled: bool('in_app_enabled'),
  }
}

/**
 * Read a user's notification preferences. Returns defaults when the user has
 * none saved, or when the lookup fails — a missing row must never turn a
 * courtesy email into an error on the request that triggered it.
 */
export async function getNotificationPreferences(
  db: Pick<SupabaseClient<any, any, any, any, any>, 'from'>,
  userId: string
): Promise<NotificationPreferences> {
  try {
    const { data } = await db
      .from('user_settings')
      .select('notification_preferences')
      .eq('user_id', userId)
      .maybeSingle()
    return normalizePreferences(
      (data as { notification_preferences?: Partial<NotificationPreferences> } | null)
        ?.notification_preferences
    )
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES }
  }
}

/**
 * Should we email this user for a notification of `type`?
 *
 * `email_enabled` is the master switch. On top of it, the four task_* types
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
