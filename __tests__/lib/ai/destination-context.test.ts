import { describe, it, expect } from 'vitest'
import { egyptPromptContext, loadDestinationPromptContext } from '@/lib/ai/destination-context'
import { buildCreativePrompt, buildStructuredPrompt } from '@/lib/ai/prompt-builder'
import { EGYPT_TRAVEL_GLOSSARY } from '@/lib/ai/egypt-glossary'

// A minimal chainable Supabase fake, same pattern as portal-chat-reply.test.
function fakeDb(rows: Record<string, unknown>) {
  const result = (table: string) => ({ data: rows[table] ?? null, error: null })
  const chain = (table: string) => {
    const p: any = Promise.resolve(result(table))  // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const m of ['select', 'eq', 'order', 'limit']) p[m] = () => chain(table)
    p.maybeSingle = () => Promise.resolve(result(table))
    return p
  }
  return { from: (table: string) => chain(table) }
}

const JORDAN_ROW = {
  id: 'd-jo', country_code: 'JO', name: 'Jordan', is_default: false,
  generation_brief: 'Jordan trips base in Amman; Petra needs a full day.',
  glossary: { text: 'AMM = Amman (Queen Alia)\nPTR = Petra' },
}
const JORDAN_CITIES = [
  { name: 'Amman', sort_order: 1 }, { name: 'Petra', sort_order: 2 }, { name: 'Aqaba', sort_order: 3 },
]

describe('loadDestinationPromptContext', () => {
  it('no id and no default row → Egypt, exactly as before destinations existed', async () => {
    const ctx = await loadDestinationPromptContext(fakeDb({}), null)
    expect(ctx).toEqual(egyptPromptContext())
  })

  it('a read failure → Egypt, never a throw', async () => {
    const db = { from: () => { throw new Error('boom') } }
    const ctx = await loadDestinationPromptContext(db, 'whatever')
    expect(ctx.name).toBe('Egypt')
  })

  it('a Jordan row speaks Jordan: name, glossary, brief, default city', async () => {
    const ctx = await loadDestinationPromptContext(
      fakeDb({ destinations: JORDAN_ROW, destination_cities: JORDAN_CITIES }), 'd-jo')
    expect(ctx.name).toBe('Jordan')
    expect(ctx.glossary).toContain('AMM = Amman')
    expect(ctx.brief).toContain('base in Amman')
    expect(ctx.defaultCity).toBe('Amman')
    // And none of Egypt's specifics leak through.
    expect(ctx.constraintLines).not.toMatch(/Nile|Aswan|Luxor/)
    expect(ctx.glossary).not.toContain('CAI = Cairo')
    // A Jordan request mentioning "cruise" must never enter the Nile path.
    expect(ctx.hasCruises).toBe(false)
  })

  it('a Jordan row WITHOUT glossary/brief gets honest minimal framing from its cities', async () => {
    const bare = { ...JORDAN_ROW, glossary: null, generation_brief: null }
    const ctx = await loadDestinationPromptContext(
      fakeDb({ destinations: bare, destination_cities: JORDAN_CITIES }), 'd-jo')
    expect(ctx.glossary).toContain('KNOWN JORDAN CITIES')
    expect(ctx.glossary).toContain('Amman, Petra, Aqaba')
    expect(ctx.brief).toBe('')
  })

  it('Egypt row keeps the code-borne framing (its data predates the tables)', async () => {
    const eg = { id: 'd-eg', country_code: 'EG', name: 'Egypt', is_default: true, generation_brief: null, glossary: null }
    const ctx = await loadDestinationPromptContext(fakeDb({ destinations: eg, destination_cities: [] }), 'd-eg')
    expect(ctx.glossary).toBe(EGYPT_TRAVEL_GLOSSARY)
    expect(ctx.defaultCity).toBe('Cairo')
    expect(ctx.hasCruises).toBe(true)
  })
})

describe('the prompts follow the destination', () => {
  const base = {
    clientName: 'C', tourName: 'T', durationDays: 3, tier: 'standard' as const,
    totalPax: 2, numAdults: 2, numChildren: 0, language: 'English',
    cities: ['Amman'], interests: [], specialRequests: [], startDate: '2026-12-01',
    effectiveCity: 'Amman', attractionNames: [], attractionMenu: 'Petra [entrance]',
    contentContext: '', writingContext: '', includeLunch: true, includeDinner: false,
    includeAccommodation: true, memoryContext: '',
  }

  it('creative: Jordan prompt says Jordan and carries the operator brief', async () => {
    const destination = await loadDestinationPromptContext(
      fakeDb({ destinations: JORDAN_ROW, destination_cities: JORDAN_CITIES }), 'd-jo')
    const p = buildCreativePrompt({ ...base, destination })
    expect(p).toContain('Create a 3-day Jordan itinerary.')
    expect(p).toContain('AMM = Amman')
    expect(p).toContain('DESTINATION NOTES (from the operator):')
    expect(p).toContain('Petra needs a full day')
    expect(p).not.toContain('Nile Cruise')
    expect(p).not.toContain(EGYPT_TRAVEL_GLOSSARY.slice(0, 60))
  })

  it('structured: Jordan prompt swaps the shorthand line and glossary', async () => {
    const destination = await loadDestinationPromptContext(
      fakeDb({ destinations: JORDAN_ROW, destination_cities: JORDAN_CITIES }), 'd-jo')
    const p = buildStructuredPrompt({
      rawItinerary: 'D1 AMM arrival', dayMappingSection: '', expectedDays: 1,
      language: 'English', tier: 'standard', totalPax: 2, packageType: 'full-package',
      writingContext: '', attractionNames: [], attractionMenu: '', contentContext: '',
      destination,
    })
    expect(p).toContain('PTR = Petra')
    expect(p).not.toContain('Egyptian travel shorthand')
  })

  it('omitting the destination is Egypt — the golden snapshots enforce the bytes', () => {
    const p = buildCreativePrompt(base)
    expect(p).toContain('Create a 3-day Egypt itinerary.')
    expect(p).toContain('CAI = Cairo')
  })
})
