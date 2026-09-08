// The "Email notifications" switch in Settings did nothing: it wrote to a
// literal id:'default' (never persisted — that isn't a valid uuid PK) and no
// send path ever read it. These pin the decision the send path now makes:
// email_enabled is the master switch, task_* have per-type toggles on top.
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  normalizePreferences,
  shouldEmailForType,
} from '@/lib/notification-preferences'

describe('normalizePreferences', () => {
  it('returns full defaults for null / undefined / empty', () => {
    expect(normalizePreferences(null)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES)
    expect(normalizePreferences(undefined)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES)
    expect(normalizePreferences({})).toEqual(DEFAULT_NOTIFICATION_PREFERENCES)
  })
  it('keeps explicit false and fills missing keys from defaults', () => {
    const p = normalizePreferences({ email_enabled: false })
    expect(p.email_enabled).toBe(false)
    expect(p.in_app_enabled).toBe(true) // default preserved
  })
  it('ignores non-boolean junk', () => {
    expect(normalizePreferences({ email_enabled: 'yes' as never }).email_enabled).toBe(true)
  })
})

describe('shouldEmailForType', () => {
  const on = { ...DEFAULT_NOTIFICATION_PREFERENCES, email_enabled: true }
  const off = { ...DEFAULT_NOTIFICATION_PREFERENCES, email_enabled: false }

  it('master switch off suppresses every type', () => {
    expect(shouldEmailForType(off, 'task_assigned')).toBe(false)
    expect(shouldEmailForType(off, 'booking_change_request')).toBe(false)
    expect(shouldEmailForType(off, 'whatsapp_new_message')).toBe(false)
  })
  it('master switch on emails types with no per-type toggle', () => {
    expect(shouldEmailForType(on, 'booking_change_request')).toBe(true)
    expect(shouldEmailForType(on, 'trip_assigned')).toBe(true)
  })
  it('honours per-type toggles when master switch is on', () => {
    expect(shouldEmailForType(on, 'task_assigned')).toBe(true) // default true
    expect(shouldEmailForType(on, 'task_completed')).toBe(false) // default false
    expect(shouldEmailForType({ ...on, task_assigned: false }, 'task_assigned')).toBe(false)
  })
})
