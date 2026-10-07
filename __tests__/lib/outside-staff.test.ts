// Outside staff: a guide or staff member typed in for one trip
// (lib/resources/outside-staff.ts).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { OUTSIDE_TYPES, outsideAssignmentMessage, outsideResourceName, readOutside } from '@/lib/resources/outside-staff'
import { resolveAssigneeContact, toStaffView } from '@/lib/staff-link'

describe('the name carries the phone', () => {
  it('round-trips, with and without a phone', () => {
    expect(outsideResourceName(' Ahmed Hassan ', '+20 100 000 0000')).toBe('Ahmed Hassan · +20 100 000 0000 (outside)')
    expect(readOutside('Ahmed Hassan · +20 100 000 0000 (outside)')).toEqual({ name: 'Ahmed Hassan', phone: '+20 100 000 0000' })
    expect(readOutside(outsideResourceName('Mona'))).toEqual({ name: 'Mona', phone: null })
  })
  it('anyone picked from the directory is not outside', () => {
    expect(readOutside('Ahmed Hassan (Cairo)')).toBeNull()
    expect(readOutside(null)).toBeNull()
  })
  it('a name with a dot in it is not mistaken for a phone', () => {
    expect(readOutside('Sara · Hilton desk (outside)')).toEqual({ name: 'Sara · Hilton desk', phone: null })
  })
  it('guides, airport staff and hotel staff only', () => {
    expect([...OUTSIDE_TYPES].sort()).toEqual(['airport_staff', 'guide', 'hotel_staff'])
  })
})

describe('reaching them', () => {
  it('the message is the assignment, by first name', () => {
    const text = outsideAssignmentMessage({ name: 'Ahmed Hassan', tripName: 'Nile Classic', clientName: 'Tersa', startDate: '2026-10-10', endDate: '2026-10-12', travelers: 2, notes: 'Meet at gate 3' })
    expect(text).toContain('Hello Ahmed,')
    expect(text).toContain('"Nile Classic"')
    expect(text).toContain('2026-10-10 – 2026-10-12')
    expect(text).toContain('Notes: Meet at gate 3')
  })
  it('the staff link reads their phone back and shows their name only', async () => {
    const db = { from: () => { throw new Error('no directory lookup for an outside person') } } as never
    expect(await resolveAssigneeContact(db, { resource_type: 'airport_staff', resource_id: 'x', resource_name: 'Ahmed · 01000000000 (outside)' }))
      .toEqual({ name: 'Ahmed', phone: '01000000000' })
    expect(toStaffView({}, {}, { resource_name: 'Ahmed · 01000000000 (outside)' }, []).memberName).toBe('Ahmed')
  })
})

describe('the picker', () => {
  it('offers typing a name in, saves a fresh id, and keeps the automatic notice for directory people only', () => {
    const code = readFileSync('app/components/ResourceAssignmentV2.tsx', 'utf8')
    expect(code).toMatch(/resourceId = crypto\.randomUUID\(\)/)
    expect(code).toMatch(/resourceName = outsideResourceName\(manualName, manualPhone\)/)
    expect(code).toMatch(/canNotify = \(typeConfig\?\.canNotify \|\| false\) && !outside/)
  })
})
