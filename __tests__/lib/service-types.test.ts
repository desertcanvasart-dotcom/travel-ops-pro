// ============================================
// One service-type vocabulary — and it stays that way
// ============================================
// The grid and the AI writer spent months writing the same column in two
// spellings (airport_service/airport_services, hotel_service/hotel_services),
// and the departments table listed all four so routing would not drop rows —
// which the audit read straight off the screen (AUT-L02). These tests pin the
// canon, the normalizer, and — by source scan — that no code outside the
// grid's slot vocabulary speaks the retired plural again.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { SERVICE_TYPES, normalizeServiceType } from '@/lib/service-types'
import { SLOT_TO_SERVICE_TYPE } from '@/app/pricing-grid/lib/slot-mapping'
import { SERVICE_TYPE_ROUTING } from '@/lib/departments'

describe('normalizeServiceType', () => {
  it('maps the retired plural spellings to the canon', () => {
    expect(normalizeServiceType('airport_services')).toBe('airport_service')
    expect(normalizeServiceType('hotel_services')).toBe('hotel_service')
  })

  it('passes canonical values through unchanged', () => {
    for (const t of SERVICE_TYPES) expect(normalizeServiceType(t)).toBe(t)
  })

  it('trims and lowercases, and lets strangers through visibly', () => {
    expect(normalizeServiceType('  Airport_Services ')).toBe('airport_service')
    // A stranger routed nowhere is visible; a stranger coerced to
    // 'transportation' is confidently wrong (the task-generation lesson).
    expect(normalizeServiceType('massage')).toBe('massage')
    expect(normalizeServiceType(null)).toBe('')
  })
})

describe('the vocabularies agree', () => {
  it('every service type the grid emits is canonical', () => {
    for (const [slot, type] of Object.entries(SLOT_TO_SERVICE_TYPE)) {
      expect(SERVICE_TYPES, `slot ${slot} emits non-canonical '${type}'`).toContain(type)
    }
  })

  it('the routing map keys are canonical (plus the non-service work types)', () => {
    const NON_SERVICE = ['invoice', 'payment', 'commission'] // Accounting routes non-itinerary work
    for (const key of Object.keys(SERVICE_TYPE_ROUTING)) {
      if (NON_SERVICE.includes(key)) continue
      expect(SERVICE_TYPES, `routing key '${key}' is not canonical`).toContain(key as never)
    }
  })

  it('the migration CHECK lists exactly the canon', () => {
    const sql = readFileSync(join(process.cwd(), 'migrations/20260831_service_type_taxonomy.sql'), 'utf8')
    for (const t of SERVICE_TYPES) expect(sql).toContain(`'${t}'`)
    expect(sql).not.toMatch(/CHECK \([^)]*'airport_services'/)
  })
})

describe('the retired spellings appear only where they are slot ids', () => {
  // The grid's SLOT ids legitimately keep the plural names — a slot is not a
  // service type. Everywhere else, the plural as a quoted literal is the
  // two-dialect bug growing back.
  const ALLOWED = new Set([
    'app/pricing-grid', // the grid: slot ids, catalog keys, AI slot prompts
    'app/api/pricing-grid', // ditto, server side
    'lib/service-types.ts', // the normalizer's own alias table
    'app/rates/airport-services', // page ROUTES named after the rate pages
    'app/rates/hotel-services',
  ])

  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) sourceFiles(full, out)
      else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
    }
    return out
  }

  it('no new file speaks the plural', () => {
    const offenders: string[] = []
    for (const file of [...sourceFiles(join(process.cwd(), 'app')), ...sourceFiles(join(process.cwd(), 'lib'))]) {
      const rel = file.replace(`${process.cwd()}/`, '')
      if ([...ALLOWED].some(a => rel.startsWith(a))) continue
      const src = readFileSync(file, 'utf8')
      src.split('\n').forEach((line, i) => {
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) return
        if (/'(airport_services|hotel_services)'/.test(line)) offenders.push(`${rel}:${i + 1}`)
      })
    }
    expect(
      offenders,
      "the plural spelling outside the grid's slot vocabulary — use the canon " +
        '(lib/service-types.ts) and normalizeServiceType() for legacy rows',
    ).toEqual([])
  })
})
