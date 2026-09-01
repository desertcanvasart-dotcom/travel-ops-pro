// A rates form must not hardcode a list of companies the suppliers table owns.
//
// The train forms shipped with:
//
//   const OPERATORS = ['Egyptian National Railways (ENR)',
//                      'Spanish Trains (Talgo)', 'Private Operator']
//
// which is not merely stale data — it taught the WRONG MODEL. It offered
// "Spanish Trains (Talgo)" as an operator when, in the supplier-HAS-properties
// model the operator had actually filled in, Talgo is one of ENR's TRAINS.
// Seven of the eight live train rates were filed against that string with no
// supplier_id at all, so not one of them could reach the operator's fleet, and
// the four trains they had just recorded appeared nowhere (operator, 1 Sep).
//
// The rule: the roster lives in `suppliers`, its fleet lives in
// `supplier_properties`, and a form reads them. It does not carry its own copy.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..', '..')

// Known exception, tracked rather than hidden: the flights form has no
// SupplierPicker at all yet, and its AIRLINES entries carry an IATA `code`
// used to build flight numbers — so replacing it is a feature, not a rename.
// 17 air carriers already exist as real suppliers. Remove this entry when
// flights joins the model; do not add to it.
const KNOWN_UNMIGRATED = new Set(['app/rates/flights/flights-content.tsx'])

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try { entries = readdirSync(dir) } catch { return out }
  for (const e of entries) {
    if (e === 'node_modules' || e === '.next' || e.startsWith('.')) continue
    const full = join(dir, e)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx$/.test(e)) out.push(full)
  }
  return out
}

describe('no hardcoded supplier vocabulary', () => {
  it('no rates form carries its own list of operators, carriers or airlines', () => {
    const violations: string[] = []
    for (const file of walk(join(ROOT, 'app', 'rates'))) {
      const rel = file.replace(ROOT + '/', '')
      if (KNOWN_UNMIGRATED.has(rel)) continue
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(
        /const\s+([A-Z_]*(?:OPERATOR|AIRLINE|CARRIER|COMPANY|SUPPLIER)[A-Z_]*)\s*(?::[^=]+)?=\s*\[/g
      )) {
        const line = src.slice(0, m.index!).split('\n').length
        violations.push(`${rel}:${line} — const ${m[1]} = [...] hardcodes what the suppliers table owns`)
      }
    }
    expect(
      violations,
      'Read the roster from /api/suppliers (SupplierPicker) and the fleet from ' +
        '/api/suppliers/:id/properties. A form-local list goes stale silently and, ' +
        'worse, invents entities that contradict the supplier model.'
    ).toEqual([])
  })

  it('the flights exception is still real, so it cannot be forgotten quietly', () => {
    // If flights gains a SupplierPicker, the exemption above is obsolete and
    // this test says so rather than letting it sit forever.
    const src = readFileSync(join(ROOT, 'app/rates/flights/flights-content.tsx'), 'utf8')
    expect(
      src.includes('SupplierPicker'),
      'flights now has a SupplierPicker — drop it from KNOWN_UNMIGRATED and remove the AIRLINES list'
    ).toBe(false)
  })
})
