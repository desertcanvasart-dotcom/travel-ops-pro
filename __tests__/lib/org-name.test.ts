// ============================================
// A stand-in is not a name
// ============================================
// "Default Organization" reached customer invoices, the 日程表 letterhead and
// the portal masthead, because nothing between the seeded row and the PDF knew
// the difference between a company and a placeholder.

import { describe, it, expect } from 'vitest'
import { customerFacingOrgName, isPlaceholderOrgName } from '@/lib/org-name'

describe('customerFacingOrgName', () => {
  it('keeps a real name exactly as written', () => {
    expect(customerFacingOrgName('株式会社エイ・ティ・エス')).toBe('株式会社エイ・ティ・エス')
    expect(customerFacingOrgName('  A.T.S  ')).toBe('A.T.S')
  })

  it('treats the seeded placeholder as no name at all', () => {
    expect(customerFacingOrgName('Default Organization')).toBe('')
    expect(customerFacingOrgName('default organization')).toBe('')
    expect(customerFacingOrgName('  Default Org  ')).toBe('')
  })

  it('treats blanks as no name', () => {
    expect(customerFacingOrgName('')).toBe('')
    expect(customerFacingOrgName('   ')).toBe('')
    expect(customerFacingOrgName(null)).toBe('')
    expect(customerFacingOrgName(undefined)).toBe('')
  })

  it('does not swallow a real name that merely contains a placeholder word', () => {
    // The match is on the WHOLE name — an operator legitimately called
    // "Default Travel" keeps theirs.
    expect(customerFacingOrgName('Default Travel')).toBe('Default Travel')
    expect(customerFacingOrgName('Organization X')).toBe('Organization X')
  })
})

describe('isPlaceholderOrgName', () => {
  it('is what settings asks before nudging the operator', () => {
    expect(isPlaceholderOrgName('Default Organization')).toBe(true)
    expect(isPlaceholderOrgName(null)).toBe(true)
    expect(isPlaceholderOrgName('株式会社エイ・ティ・エス')).toBe(false)
  })
})
