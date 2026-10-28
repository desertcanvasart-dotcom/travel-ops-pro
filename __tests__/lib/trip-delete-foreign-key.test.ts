// A trip delete the database refused (23503) names what still points at the
// trip — it used to say "invoices, payments, etc." whatever the table, so ATS
// went looking for payments on a trip that only had a converted quote.
import { describe, it, expect } from 'vitest'
import { tripDeleteForeignKeyRefusal } from '@/lib/itineraries/trip-delete'

const pgError = (table: string) => ({
  message: `update or delete on table "itineraries" violates foreign key constraint "${table}_itinerary_id_fkey" on table "${table}"`,
  details: 'Key (id)=(c2305f37-5fcd-4eb7-a6ea-be7daf3ddd20) is still referenced from table "' + table + '".',
})

describe('tripDeleteForeignKeyRefusal', () => {
  it('names the table that still refers to the trip', () => {
    expect(tripDeleteForeignKeyRefusal(pgError('invoices'))).toMatch(/^This trip cannot be deleted: an invoice still refers to it\./)
    expect(tripDeleteForeignKeyRefusal(pgError('tour_quotes'))).toContain('a quote still refers to it')
  })

  it('never blames payments for a table that is not payments', () => {
    expect(tripDeleteForeignKeyRefusal(pgError('tour_quotes'))).not.toMatch(/payment/i)
  })

  it('reads an unlisted table from its name', () => {
    expect(tripDeleteForeignKeyRefusal(pgError('guide_assignments'))).toContain('a record in guide assignments still refers to it')
  })

  it('falls back when the message carries no table', () => {
    expect(tripDeleteForeignKeyRefusal({ message: 'foreign key violation', details: null })).toContain('another record still refers to it')
  })
})
