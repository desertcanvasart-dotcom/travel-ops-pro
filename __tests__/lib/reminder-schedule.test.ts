// Invoice reminders used Math.floor((new Date(due) - Date.now()) / day): an
// invoice due TODAY came out at -1 ("0 days overdue"), one due tomorrow as
// "due today", and anything over 5 days out got the fixed "あと7日" copy.
import { describe, it, expect } from 'vitest'
import { daysUntilDue, reminderStage, addDaysISO, firstReminderDate } from '@/lib/invoices/reminder-schedule'
import { todayInTimeZone } from '@/lib/today'

describe('daysUntilDue counts whole calendar days', () => {
  it('due today is 0, tomorrow 1, yesterday -1 — no time of day involved', () => {
    expect(daysUntilDue('2026-09-23', '2026-09-23')).toBe(0)
    expect(daysUntilDue('2026-09-24', '2026-09-23')).toBe(1)
    expect(daysUntilDue('2026-09-22', '2026-09-23')).toBe(-1)
    expect(daysUntilDue('2026-10-23', '2026-09-23')).toBe(30)
  })
})

describe('reminderStage', () => {
  it.each([
    [30, null], // too early — was before_due_7 ("あと7日") before
    [8, null],
    [7, 'before_due_7'],
    [4, 'before_due_7'],
    [3, 'before_due_3'],
    [1, 'before_due_3'], // tomorrow is NOT "due today"
    [0, 'on_due'], // today is NOT overdue
    [-1, 'overdue_7'],
    [-7, 'overdue_7'],
    [-8, 'overdue_14'],
    [-15, 'overdue_30'],
  ])('%i days until due → %s', (days, stage) => {
    expect(reminderStage(days)).toBe(stage)
  })
})

describe('scheduling helpers', () => {
  it('addDaysISO crosses months and years', () => {
    expect(addDaysISO('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('a too-early balance is next looked at 7 days before it falls due', () => {
    expect(firstReminderDate('2026-10-23')).toBe('2026-10-16')
  })
})

describe('todayInTimeZone (server-safe "today")', () => {
  it('08:00 in Tokyo is still the previous UTC day but the Tokyo date is today', () => {
    const t = new Date('2026-09-22T23:00:00Z') // 08:00 JST on the 23rd
    expect(todayInTimeZone('UTC', t)).toBe('2026-09-22')
    expect(todayInTimeZone('Asia/Tokyo', t)).toBe('2026-09-23')
  })
  it('falls back to the UTC date for an unknown zone', () => {
    expect(todayInTimeZone('Not/AZone', new Date('2026-09-23T12:00:00Z'))).toBe('2026-09-23')
  })
})
