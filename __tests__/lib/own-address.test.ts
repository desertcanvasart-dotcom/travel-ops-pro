// The office's own address is never a client's (lib/email/own-address.ts).
import { describe, it, expect } from 'vitest'
import { isOwnAddress } from '@/lib/email/own-address'
import { officeRule } from '@/lib/email/office-addresses'

const own = {
  rule: officeRule(['bookings@desertcanvas.com'], ['sales@other-office.com']),
  people: ['Rabab.Saber85@gmail.com'],
}

describe('isOwnAddress', () => {
  it('a connected mailbox, its domain, a configured office address, a team member', () => {
    expect(isOwnAddress(own, 'bookings@desertcanvas.com')).toBe(true)
    expect(isOwnAddress(own, 'Ahmed <ahmed@desertcanvas.com>')).toBe(true)
    expect(isOwnAddress(own, 'sales@other-office.com')).toBe(true)
    expect(isOwnAddress(own, 'rabab.saber85@gmail.com')).toBe(true)
  })
  it('a client — even on a public domain a team member uses — is not', () => {
    expect(isOwnAddress(own, 'tersa@gmail.com')).toBe(false)
    expect(isOwnAddress(own, 'client@example.com')).toBe(false)
    expect(isOwnAddress(own, '')).toBe(false)
    expect(isOwnAddress(own, 'not an address')).toBe(false)
  })
})
