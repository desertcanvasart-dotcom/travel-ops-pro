// ============================================
// Sleeping-train cabins — the two the operator actually sells
// ============================================
// Operator decision 2026-08-22: "We have two types, half twin and single.
// Remove everything and just keep half twin and single." The form used to
// offer Single / Double / Suite / Royal Suite — a generic list, not this
// operator's product. sleeping_train_rates.cabin_type is free text with no
// CHECK, so the vocabulary is enforced here: the form, the filter, the
// create/update routes and the CSV importer all read this one list.
//
// Values are the STORED strings (cabin_type column) — since 2026-09 the
// vocabulary KEYS ('single', 'half_twin'; Settings → Vocabulary →
// Sleeping-train cabins), which is also what the CSV importer resolves to.
// Rows written before that hold the words ('Single', 'Half Twin'); the
// normaliser below, the label hook (it slugifies) and the pricing engine
// (a /half|single/ match) all read both. Labels come from i18n
// (rates.sleepingTrains.cabins.<key>).
// ============================================

export const SLEEPING_TRAIN_CABINS = [
  { value: 'single',    labelKey: 'single' },
  { value: 'half_twin', labelKey: 'halfTwin' },
] as const

export type SleepingTrainCabin = (typeof SLEEPING_TRAIN_CABINS)[number]['value']

export const SLEEPING_TRAIN_CABIN_VALUES: readonly string[] = SLEEPING_TRAIN_CABINS.map(c => c.value)

/** Case/whitespace/separator-tolerant, and word-tolerant: "Half Twin",
 *  "half twin", "half-twin" and "half_twin" all resolve to the KEY. Null
 *  when unknown. */
export function normaliseSleepingTrainCabin(input: unknown): SleepingTrainCabin | null {
  if (typeof input !== 'string') return null
  const wanted = input.trim().toLowerCase().replace(/[\s_-]+/g, '_')
  const hit = SLEEPING_TRAIN_CABINS.find(c => c.value === wanted)
  return hit ? hit.value : null
}

export const SLEEPING_TRAIN_CABIN_ERROR =
  `Cabin type must be one of: ${SLEEPING_TRAIN_CABIN_VALUES.join(', ')}`
