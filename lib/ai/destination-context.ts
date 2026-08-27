// ============================================
// The destination's voice in the generation prompt
// ============================================
// Phase 2 of docs/plans/multi-destination.md. The generation prompt was
// assembled from data (writing rules, attraction menu, content) plus ONE
// hardcoded piece: the Egypt framing — glossary, shorthand explanation,
// Egypt-specific constraints. This module turns that last piece into a
// parameter.
//
// THE CONTRACT: egyptPromptContext() reproduces today's prompt BYTE FOR BYTE
// (pinned by __tests__/lib/ai/prompt-builder-golden.test.ts). A destination
// row can override each piece — its glossary JSONB, its generation_brief —
// and a destination with none of that gets honest minimal framing rather
// than Egypt's. Egypt's glossary deliberately stays in code
// (lib/ai/egypt-glossary.ts) as the fallback of last resort: it is the one
// destination whose data predates the destinations table.

import { EGYPT_TRAVEL_GLOSSARY } from '@/lib/ai/egypt-glossary'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any }

export interface DestinationPromptContext {
  /** 'Egypt', 'Jordan', … — appears in "Create a N-day X itinerary." */
  name: string
  /** The abbreviation/shorthand block injected into both prompts. */
  glossary: string
  /** One line explaining what shorthand the input may use. */
  shorthandLine: string
  /** Destination-specific "do not invent" constraint lines (creative prompt). */
  constraintLines: string
  /** Operator-written framing from destinations.generation_brief; '' = none. */
  brief: string
  /** Where a trip is assumed to start/base when nothing says otherwise. */
  defaultCity: string
  /** Whether cruise detection should run at all. Cruise products are not
   *  destination-tagged yet, so this is Egypt-only for now — a Jordan
   *  request can never be silently turned into a Nile cruise. */
  hasCruises: boolean
}

/** Today's Egypt framing, verbatim — the golden snapshots pin it. */
export function egyptPromptContext(): DestinationPromptContext {
  return {
    name: 'Egypt',
    glossary: EGYPT_TRAVEL_GLOSSARY,
    shorthandLine:
      'The input may be in Egyptian travel shorthand (D1 CAI, D2 ALX) OR in full prose English (Day 1 Arrival in Cairo...).',
    constraintLines: `- If no Nile Cruise / CRZ is mentioned, do NOT create a cruise itinerary.
- If no Aswan/Luxor is mentioned, do NOT add Upper Egypt destinations.
- Stay faithful to the client's request — do not "improve" by adding unrelated destinations.
- Do NOT generate a Nile Cruise unless the client explicitly asks for one.`,
    brief: '',
    defaultCity: 'Cairo',
    hasCruises: true,
  }
}

/** Honest minimal framing for a destination that has no data yet. */
function bareContext(name: string, cities: string[], defaultCity: string): DestinationPromptContext {
  return {
    name,
    glossary: cities.length
      ? `KNOWN ${name.toUpperCase()} CITIES:\n${cities.join(', ')}\n\nThe input may use IATA airport codes or local shorthand — decode city names against the list above; anything you cannot decode, keep verbatim.`
      : '',
    shorthandLine:
      'The input may be in travel shorthand (airport codes, day codes) OR in full prose English.',
    constraintLines:
      `- Stay faithful to the client's request — do not "improve" by adding unrelated destinations.\n- Do NOT add cities, cruises, or excursions that are not mentioned.`,
    brief: '',
    defaultCity,
    hasCruises: false,
  }
}

/**
 * Load the prompt context for a destination id. NEVER throws and never
 * returns something unusable: no id, an unknown id, or any read failure
 * resolves to the Egypt context — exactly what every generation did before
 * destinations existed.
 */
export async function loadDestinationPromptContext(
  db: Db,
  destinationId: string | null | undefined
): Promise<DestinationPromptContext> {
  try {
    let row: {
      id: string; country_code: string; name: string;
      generation_brief: string | null; glossary: unknown; is_default: boolean
    } | null = null

    if (destinationId) {
      const { data } = await db.from('destinations')
        .select('id, country_code, name, generation_brief, glossary, is_default')
        .eq('id', destinationId).maybeSingle()
      row = data
    }
    if (!row) {
      const { data } = await db.from('destinations')
        .select('id, country_code, name, generation_brief, glossary, is_default')
        .eq('is_default', true).maybeSingle()
      row = data
    }
    if (!row) return egyptPromptContext()

    const { data: cityRows } = await db.from('destination_cities')
      .select('name, sort_order')
      .eq('destination_id', row.id)
      .eq('is_active', true)
      .order('sort_order')
    const cities: string[] = (cityRows ?? []).map((c: { name: string }) => c.name)

    // Egypt keeps its code-borne framing unless the row explicitly overrides.
    const base = row.country_code === 'EG'
      ? egyptPromptContext()
      : bareContext(row.name, cities, cities[0] ?? row.name)

    const glossaryText = typeof row.glossary === 'string'
      ? row.glossary
      : (row.glossary && typeof row.glossary === 'object' && 'text' in (row.glossary as object))
        ? String((row.glossary as { text: unknown }).text)
        : null

    return {
      ...base,
      glossary: glossaryText || base.glossary,
      brief: (row.generation_brief ?? '').trim(),
    }
  } catch (err) {
    console.warn('[destination-context] falling back to Egypt:', err instanceof Error ? err.message : String(err))
    return egyptPromptContext()
  }
}
