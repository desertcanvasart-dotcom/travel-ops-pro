// "Send via my WhatsApp": who the assignment goes to and their number
// (lib/resources/assignment-contact.ts).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { assignmentContact } from '@/lib/resources/assignment-contact'

const a = (resource_type: string, resource_id: string, resource_name: string | null = null) => ({ resource_type, resource_id, resource_name })

describe('a person in the directory', () => {
  it('a guide or staff member: their WhatsApp first, else their phone', () => {
    expect(assignmentContact(a('guide', 'g1'), [{ id: 'g1', name: 'Mona Ali', phone: '0100', whatsapp: '0122' }])).toEqual({ name: 'Mona Ali', phone: '0122' })
    expect(assignmentContact(a('airport_staff', 's1'), [{ id: 's1', name: 'Omar', phone: '0111' }])).toEqual({ name: 'Omar', phone: '0111' })
  })
  it('a vehicle or a restaurant: its supplier, by name and number', () => {
    expect(assignmentContact(a('vehicle', 'v1'), [{ id: 'v1', route_name: 'Airport Transfer', supplier: { name: 'Nile Cars', contact_phone: '0155' } }]))
      .toEqual({ name: 'Nile Cars', phone: '0155' })
    expect(assignmentContact(a('restaurant', 'm1'), [{ id: 'm1', name: 'Fish Market', supplier: { name: 'Fish Market Alexandria', contact_phone: '0133' } }]))
      .toEqual({ name: 'Fish Market Alexandria', phone: '0133' })
  })
  it('a restaurant held by another of its meal rows is found by its saved name', () => {
    expect(assignmentContact(a('restaurant', 'm-dinner', 'Fish Market (Alexandria)'), [{ id: 'm-lunch', name: 'Fish Market', supplier: { name: 'FM', contact_phone: '0133' } }])?.phone).toBe('0133')
  })
  it('nobody without a number, nobody not listed, and never a hotel or a ship', () => {
    expect(assignmentContact(a('guide', 'g1'), [{ id: 'g1', name: 'Mona' }])).toBeNull()
    expect(assignmentContact(a('guide', 'gone'), [])).toBeNull()
    expect(assignmentContact(a('hotel', 'h1'), [{ id: 'h1', name: 'Mena House', phone: '02' }])).toBeNull()
    expect(assignmentContact(a('cruise', 'c1'), [{ id: 'c1', name: 'Adonis', phone: '02' }])).toBeNull()
  })
})

describe('someone typed in for one trip', () => {
  it('reached by the number saved with their name; without one, not at all', () => {
    expect(assignmentContact(a('hotel_staff', 'x', 'Sara · 0100 000 0000 (outside)'), [])).toEqual({ name: 'Sara', phone: '0100 000 0000' })
    expect(assignmentContact(a('hotel_staff', 'x', 'Sara (outside)'), [])).toBeNull()
  })
})

describe('the button', () => {
  it('shows for anyone with a number, beside the automatic notice', () => {
    const code = readFileSync('app/components/ResourceAssignmentV2.tsx', 'utf8')
    expect(code).toMatch(/const contact = assignmentContact\(resource, availableResources\[resource\.resource_type\] \|\| \[\]\)/)
    expect(code).toMatch(/\{contact && \(/)
  })
})
