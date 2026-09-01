// operatorNameForSupplier: the supplier IS the operator.
//
// The live failure this exists to stop: a rate saved with supplier ENR and
// train ENRILATED 3RD both stored correctly, and operator_name null — so the
// list column and the rates hub showed nothing at all for a rate that was
// fully linked.
import { describe, it, expect } from 'vitest'
import { operatorNameForSupplier } from '@/lib/suppliers/operator-name'

const dbWith = (row: { name: string } | null) => ({
  from: () => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: row }) }),
    }),
  }),
})

describe('operatorNameForSupplier', () => {
  it("uses the supplier's name, whatever the client sent", async () => {
    const db = dbWith({ name: 'Egyptian National Railways (ENR)' })
    expect(await operatorNameForSupplier(db, 'sup-1', 'Spanish Trains (Talgo)'))
      .toBe('Egyptian National Railways (ENR)')
  })

  it('fills a name for a rate whose client sent none', async () => {
    // The exact live case: supplier chosen, operator_name never touched.
    const db = dbWith({ name: 'Egyptian National Railways (ENR)' })
    expect(await operatorNameForSupplier(db, 'sup-1', undefined))
      .toBe('Egyptian National Railways (ENR)')
    expect(await operatorNameForSupplier(db, 'sup-1', '')).toBe('Egyptian National Railways (ENR)')
  })

  it('keeps the caller value when there is no supplier', async () => {
    // CSV import and legacy rows name an operator nobody has recorded yet.
    const db = dbWith(null)
    expect(await operatorNameForSupplier(db, null, 'Watania Sleeping Trains'))
      .toBe('Watania Sleeping Trains')
    expect(await operatorNameForSupplier(db, '', '  Talgo  ')).toBe('Talgo')
  })

  it('returns null when neither a supplier nor a name is given', async () => {
    expect(await operatorNameForSupplier(dbWith(null), '', '   ')).toBeNull()
    expect(await operatorNameForSupplier(dbWith(null), undefined, undefined)).toBeNull()
  })

  it('does not blank an existing name when the supplier cannot be read', async () => {
    // A missing/unreadable supplier row must not destroy what the rate had.
    const db = dbWith(null)
    expect(await operatorNameForSupplier(db, 'sup-gone', 'Spanish Trains (Talgo)'))
      .toBe('Spanish Trains (Talgo)')
  })
})
