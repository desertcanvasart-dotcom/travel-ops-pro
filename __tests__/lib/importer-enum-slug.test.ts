// The CSV importer's enum columns now store the vocabulary KEY, and a sheet
// written in words must still land on it.
//
// Sleeping-train cabins were stored as the words ('Half Twin'); since
// 2026-09 the column holds the key ('half_twin', like Settings → Vocabulary).
// The importer's allowed-value match was case-insensitive only, so an
// operator's existing sheet — "Half Twin" — would have been refused the day
// the keys landed. (resolveRecordKeys, which was meant to do this, had no
// callers.) The match is now case-insensitive, then slug-tolerant.
import { describe, it, expect } from 'vitest'
import { validateImportData, RATE_TABLE_CONFIGS } from '@/lib/bulk-rate-service'

const config = RATE_TABLE_CONFIGS.sleeping_train_rates
const row = (cabin_type: string) => ({
  service_code: 'SLP-TEST-1', origin_city: 'Giza', destination_city: 'Luxor', cabin_type, rate_oneway_eur: '120',
})

describe('importer enum columns accept the word and store the key', () => {
  it.each([
    ['Half Twin', 'half_twin'],
    ['half twin', 'half_twin'],
    ['HALF-TWIN', 'half_twin'],
    ['half_twin', 'half_twin'],
    ['Single', 'single'],
  ])('%s → %s', (given, stored) => {
    const preview = validateImportData([row(given)], config)
    expect(preview.errors).toEqual([])
    expect(preview.validRows).toBe(1)
    expect(preview.sampleData[0].cabin_type).toBe(stored)
  })

  it('a cabin the operator does not sell is still refused, naming the allowed keys', () => {
    const preview = validateImportData([row('Double')], config)
    expect(preview.validRows).toBe(0)
    expect(preview.errors.map(e => e.message).join(' ')).toMatch(/single, half_twin/)
  })
})
