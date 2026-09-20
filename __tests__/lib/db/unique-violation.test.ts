import { describe, it, expect } from 'vitest'
import { uniqueViolationKey, uniqueViolationMessage } from '@/lib/db/unique-violation'

// The real shape PostgREST hands back for a unique violation.
const supplierCodeClash = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "suppliers_supplier_code_key"',
  details: 'Key (supplier_code)=(SUP-0070) already exists.',
}

describe('uniqueViolationKey', () => {
  it('reads the column and value Postgres named', () => {
    expect(uniqueViolationKey(supplierCodeClash)).toEqual({ columns: ['supplier_code'], value: 'SUP-0070' })
  })

  it('handles a composite key', () => {
    expect(uniqueViolationKey({ details: 'Key (org_id, slug)=(abc, cairo) already exists.' }))
      .toEqual({ columns: ['org_id', 'slug'], value: 'abc, cairo' })
  })

  it('falls back to the message when there is no DETAIL', () => {
    expect(uniqueViolationKey({ message: 'Key (email)=(a@b.c) already exists.' }))
      .toEqual({ columns: ['email'], value: 'a@b.c' })
  })

  it('is null when Postgres did not say (partial or expression index)', () => {
    expect(uniqueViolationKey({ code: '23505', message: 'duplicate key value violates unique constraint "x"' })).toBeNull()
    expect(uniqueViolationKey(null)).toBeNull()
  })
})

describe('uniqueViolationMessage', () => {
  it('says an INTERNAL key clashed when the operator never saw that field', () => {
    // The bug of 2026-09-20: the operator typed a name, was told it exists,
    // and the clash was on a code no form shows.
    const msg = uniqueViolationMessage(supplierCodeClash, {
      subject: 'supplier',
      visibleFields: ['name', 'type', 'types', 'city', 'status'],
    })
    expect(msg).toContain('SUP-0070')
    expect(msg).toContain('supplier code')
    expect(msg).toMatch(/internal key/i)
    // It must NOT imply the thing they were adding already exists.
    expect(msg).toMatch(/does not exist yet/i)
  })

  it('reads as an ordinary duplicate when the clash is on something they typed', () => {
    const msg = uniqueViolationMessage(
      { code: '23505', details: 'Key (email)=(guide@ats.com) already exists.' },
      { subject: 'supplier', visibleFields: ['name', 'email'] }
    )
    expect(msg).toContain('guide@ats.com')
    expect(msg).toContain('email')
    expect(msg).not.toMatch(/internal key/i)
  })

  it('never claims to know which field when Postgres did not say', () => {
    const msg = uniqueViolationMessage({ code: '23505', message: 'duplicate key' }, { subject: 'supplier' })
    expect(msg).toMatch(/one of these values/i)
  })

  it('treats every field as hidden when the caller lists none', () => {
    expect(uniqueViolationMessage(supplierCodeClash, { subject: 'supplier' })).toMatch(/internal key/i)
  })
})
