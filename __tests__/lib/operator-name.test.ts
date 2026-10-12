// operatorNameForSupplier: the supplier IS the operator.
//
// The live failure this exists to stop: a rate saved with supplier ENR and
// train ENRILATED 3RD both stored correctly, and operator_name null — so the
// list column and the rates hub showed nothing at all for a rate that was
// fully linked.
import { describe, it, expect } from 'vitest'
import { operatorNameForSupplier } from '@/lib/suppliers/operator-name'

// Every lookup is within the caller's company (suppliers.org_id, 20261205):
// the stub answers only when asked for org-1's row.
const dbWith = (row: { name: string } | null) => ({
  from: () => ({
    select: () => ({
      eq: (_c: string, _id: string) => ({
        eq: (col: string, org: string) => ({
          maybeSingle: async () => ({ data: col === 'org_id' && org === 'org-1' ? row : null }),
        }),
      }),
    }),
  }),
})

describe('operatorNameForSupplier', () => {
  it("uses the supplier's name, whatever the client sent", async () => {
    const db = dbWith({ name: 'Egyptian National Railways (ENR)' })
    expect(await operatorNameForSupplier(db, 'sup-1', 'Spanish Trains (Talgo)', 'org-1'))
      .toBe('Egyptian National Railways (ENR)')
  })

  it('fills a name for a rate whose client sent none', async () => {
    // The exact live case: supplier chosen, operator_name never touched.
    const db = dbWith({ name: 'Egyptian National Railways (ENR)' })
    expect(await operatorNameForSupplier(db, 'sup-1', undefined, 'org-1'))
      .toBe('Egyptian National Railways (ENR)')
    expect(await operatorNameForSupplier(db, 'sup-1', '', 'org-1')).toBe('Egyptian National Railways (ENR)')
  })

  it('keeps the caller value when there is no supplier', async () => {
    // CSV import and legacy rows name an operator nobody has recorded yet.
    const db = dbWith(null)
    expect(await operatorNameForSupplier(db, null, 'Watania Sleeping Trains', 'org-1'))
      .toBe('Watania Sleeping Trains')
    expect(await operatorNameForSupplier(db, '', '  Talgo  ', 'org-1')).toBe('Talgo')
  })

  it('returns null when neither a supplier nor a name is given', async () => {
    expect(await operatorNameForSupplier(dbWith(null), '', '   ', 'org-1')).toBeNull()
    expect(await operatorNameForSupplier(dbWith(null), undefined, undefined, 'org-1')).toBeNull()
  })

  it('does not blank an existing name when the supplier cannot be read', async () => {
    // A missing/unreadable supplier row must not destroy what the rate had.
    const db = dbWith(null)
    expect(await operatorNameForSupplier(db, 'sup-gone', 'Spanish Trains (Talgo)', 'org-1'))
      .toBe('Spanish Trains (Talgo)')
  })
})

describe('one company at a time', () => {
  it("another company's supplier names nothing: the caller's value stands", async () => {
    const db = dbWith({ name: 'Egyptian National Railways (ENR)' })
    expect(await operatorNameForSupplier(db, 'sup-1', 'Talgo', 'org-2')).toBe('Talgo')
    expect(await operatorNameForSupplier(db, 'sup-1', 'Talgo', null)).toBe('Talgo')
  })
})
