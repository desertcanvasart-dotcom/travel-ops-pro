// ============================================
// One meal price, for several meals (migration 20270119)
// ============================================
// The same menu at the same restaurant at the same price is often served at
// lunch AND at dinner, and had to be entered twice, one row per meal. A meal
// price is now ONE row: its first meal in `meal_type`, the further meals the
// same price covers in `other_meal_types`. Ported from autoura-saas #821.
//
// One rule, read by everything that asks "does this price serve that meal":
// the engine, the pricing grid's list, the B2B quote, the AI paths.
//
// The match is the one the engine has always used here: the meal key equals
// the meal asked for (case aside). A row with no further meals matches
// exactly as before, so no price changes until a second meal is added.
//
// Pure.

export interface MealRateMeals {
  meal_type?: string | null
  other_meal_types?: readonly string[] | null
}

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** The values in order, trimmed, blanks and repeats (any case) dropped. */
function uniqueList(values: readonly unknown[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of values) {
    const s = clean(v)
    const k = s.toLowerCase()
    if (!s || seen.has(k)) continue
    seen.add(k)
    out.push(s)
  }
  return out
}

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** Every meal one price covers, first first. Empty = no meal stated. */
export function mealTypesOf(r: MealRateMeals): string[] {
  return uniqueList([r.meal_type, ...asArray(r.other_meal_types)])
}

/** Does this price serve the meal asked for (lunch, dinner, ...)? */
export function rateServesMeal(r: MealRateMeals, meal: string): boolean {
  const wanted = meal.trim().toLowerCase()
  if (!wanted) return false
  return mealTypesOf(r).some(m => m.toLowerCase() === wanted)
}

/** Does any meal of this price pass `test` (the AI parse's /lunch/i)? */
export function rateMealMatches(r: MealRateMeals, test: RegExp): boolean {
  return mealTypesOf(r).some(m => test.test(m))
}

export interface MealRateLists {
  meal_type: string | null
  other_meal_types: string[]
}

/**
 * The meals a form body asks for, as the row stores them: the first meal in
 * `meal_type`, the rest in `other_meal_types`. The first is never repeated in
 * the rest.
 */
export function mealRateLists(body: { meal_type?: unknown; other_meal_types?: unknown }): MealRateLists {
  const meals = clean(body.meal_type) ? uniqueList([body.meal_type, ...asArray(body.other_meal_types)]) : []
  return { meal_type: meals[0] ?? null, other_meal_types: meals.slice(1) }
}

// ---- The pricing grid's list ------------------------------------------------
// A day may take lunch AND dinner from the one price, so the grid lists a
// price once per meal it covers. The first meal keeps the row's own id (every
// saved trip still finds it); a further meal's entry is `<row id>~<meal>`.

export const MEAL_OPTION_SEP = '~'

/** The grid entry id for one meal of a price. */
export function mealOptionId(rowId: string, meal: string, index: number): string {
  return index === 0 ? rowId : `${rowId}${MEAL_OPTION_SEP}${meal}`
}

/** The meal_rates row a grid entry id belongs to. */
export function mealRateRowId(optionId: string): string {
  const sep = optionId.indexOf(MEAL_OPTION_SEP)
  return sep === -1 ? optionId : optionId.slice(0, sep)
}

/**
 * A price as the grid lists it: one entry per meal it covers, each with the
 * entry id and that one meal in `meal_type`. A price with no meal stated, or
 * one meal, stays one entry, unchanged.
 */
export function perMealEntries<T extends MealRateMeals & { id: string }>(row: T): Array<T & { meal_type: string | null }> {
  const meals = mealTypesOf(row)
  if (meals.length <= 1) return [{ ...row, meal_type: row.meal_type ?? null }]
  return meals.map((meal, i) => ({ ...row, id: mealOptionId(row.id, meal, i), meal_type: meal }))
}
