// An agency-added supplier type behaves like the built-in it points at.
//
// Settings → Vocabulary → Supplier types lets the agency add "Lodge" with
// behaviour = hotel. Every consumer that used to compare the KEY 'hotel'
// resolves through the behaviour instead — the hotel-rate form's supplier
// filter, the Properties tab, the guide picker — and the pickers offer the
// agency's list. These pin the pure helpers behind all of that.
import { describe, it, expect } from 'vitest'
import {
  SUPPLIER_TYPES, SUPPLIER_TYPE_VALUES, BUILT_IN_SUPPLIER_BEHAVIOUR,
  supplierBehaviourOf, supplierTypeKeysMatching, supplierHasBehaviour,
  allowedSupplierTypeKeys, unknownSupplierTypes, supplierTypeOptionsFor, supplierTypeGroupsFor,
} from '@/lib/supplier-types'
import { SUPPLIER_BEHAVIORS } from '@/lib/vocabulary'
import { propertyTypesForRoles } from '@/lib/supplier-properties'

// The live vocabulary on 2026-09-13: the seventeen built-ins plus "lodge".
const seed = SUPPLIER_TYPE_VALUES.map((key, i) => ({ key, label: key, behavior: BUILT_IN_SUPPLIER_BEHAVIOUR[key], is_active: true, rank: i }))
const vocab = [...seed, { key: 'lodge', label: 'Lodge', label_ja: 'ロッジ', behavior: 'hotel', is_active: true, rank: 18 }]

describe('supplierBehaviourOf', () => {
  it('every built-in has a known behaviour', () => {
    const known = new Set<string>(SUPPLIER_BEHAVIORS.map(b => b.key))
    for (const key of SUPPLIER_TYPE_VALUES) expect(known.has(BUILT_IN_SUPPLIER_BEHAVIOUR[key]), key).toBe(true)
  })
  it('an added type answers with its entry\'s behaviour; a built-in with its own; the unknown as other', () => {
    expect(supplierBehaviourOf('lodge', vocab)).toBe('hotel')
    expect(supplierBehaviourOf('transport', vocab)).toBe('transport_company')
    expect(supplierBehaviourOf('transport', [])).toBe('transport_company') // no vocabulary yet
    expect(supplierBehaviourOf('tuk_tuk', vocab)).toBe('other')
    expect(supplierBehaviourOf(null, vocab)).toBe('other')
  })
})

describe('supplierTypeKeysMatching — the "type=hotel" filter', () => {
  it('a request for hotels also matches the lodge', () => {
    expect(supplierTypeKeysMatching(['hotel'], vocab).sort()).toEqual(['hotel', 'lodge'])
  })
  it('a built-in never pulls in another built-in with the same behaviour', () => {
    // local_operator and tour_operator both behave as tour_operator; airport
    // and hotel assistants both as ground_handler.
    expect(supplierTypeKeysMatching(['local_operator'], vocab)).toEqual(['local_operator'])
    expect(supplierTypeKeysMatching(['airport_assistant'], vocab)).toEqual(['airport_assistant'])
  })
  it('a comma list widens each; the added key itself can be asked for', () => {
    expect(supplierTypeKeysMatching(['transport', 'local_operator'], vocab).sort()).toEqual(['local_operator', 'transport'])
    expect(supplierTypeKeysMatching(['lodge'], vocab)).toEqual(['lodge'])
  })
  it('without a vocabulary the request is returned as-is', () => {
    expect(supplierTypeKeysMatching(['hotel'], [])).toEqual(['hotel'])
  })
})

describe('behaviour-driven consumers', () => {
  it('a lodge supplier owns hotel properties, once its roles are resolved to behaviours', () => {
    const roles = ['lodge']
    expect(propertyTypesForRoles(roles)).toEqual([]) // by key: nothing
    expect(propertyTypesForRoles(roles.map(r => supplierBehaviourOf(r, vocab)))).toEqual(['hotel'])
  })
  it('supplierHasBehaviour reads every role a supplier fills', () => {
    expect(supplierHasBehaviour({ type: 'lodge', types: ['lodge'] }, 'hotel', vocab)).toBe(true)
    expect(supplierHasBehaviour({ type: 'driver', types: ['driver', 'guide'] }, 'guide', vocab)).toBe(true)
    expect(supplierHasBehaviour({ type: 'guide' }, 'guide', vocab)).toBe(true) // legacy single-type row
    expect(supplierHasBehaviour({ type: 'shop', types: ['shop'] }, 'hotel', vocab)).toBe(false)
  })
})

describe('what a supplier may be filed under', () => {
  it('the agency\'s keys (hidden included) plus the built-ins; anything else is named', () => {
    const allowed = allowedSupplierTypeKeys([...vocab, { key: 'retired', behavior: 'other', is_active: false }])
    expect(allowed.has('lodge')).toBe(true)
    expect(allowed.has('retired')).toBe(true)
    expect(allowed.has('hotel')).toBe(true)
    expect(unknownSupplierTypes(['lodge', 'tuk_tuk', 'Lodge'], allowed)).toEqual(['tuk_tuk', 'Lodge'])
  })
})

describe('supplierTypeOptionsFor — the picker', () => {
  it('offers the agency\'s active entries in its order, the lodge grouped with what it behaves like', () => {
    const options = supplierTypeOptionsFor(vocab, 'en')
    expect(options.map(o => o.value)).toEqual([...SUPPLIER_TYPE_VALUES, 'lodge'])
    expect(options.find(o => o.value === 'lodge')).toEqual({ value: 'lodge', label: 'Lodge', group: 'Stay & Food' })
    expect(supplierTypeOptionsFor(vocab, 'ja').find(o => o.value === 'lodge')?.label).toBe('ロッジ')
  })
  it('a hidden entry is not offered; the built-ins stand in until the vocabulary loads', () => {
    expect(supplierTypeOptionsFor(vocab.map(v => v.key === 'shop' ? { ...v, is_active: false } : v)).some(o => o.value === 'shop')).toBe(false)
    expect(supplierTypeOptionsFor([])).toBe(SUPPLIER_TYPES)
  })
  it('groups keep their order and drop empties', () => {
    const groups = supplierTypeGroupsFor(supplierTypeOptionsFor(vocab))
    expect(groups.map(g => g.group)).toEqual(['Stay & Food', 'Ground', 'Travel', 'People', 'Experiences', 'Other'])
    expect(groups[0].options.map(o => o.value)).toContain('lodge')
    expect(supplierTypeGroupsFor([{ value: 'lodge', label: 'Lodge', group: 'Stay & Food' }])).toHaveLength(1)
  })
})
