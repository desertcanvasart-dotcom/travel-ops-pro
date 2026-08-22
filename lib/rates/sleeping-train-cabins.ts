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
// Values are the STORED strings (cabin_type column). Labels come from i18n
// (rates.sleepingTrains.cabins.<key>).
// ============================================

export const SLEEPING_TRAIN_CABINS = [
  { value: 'Single',    labelKey: 'single' },
  { value: 'Half Twin', labelKey: 'halfTwin' },
] as const

export type SleepingTrainCabin = (typeof SLEEPING_TRAIN_CABINS)[number]['value']

export const SLEEPING_TRAIN_CABIN_VALUES: readonly string[] = SLEEPING_TRAIN_CABINS.map(c => c.value)

/** Case/whitespace-tolerant: "half twin" and "Half Twin " both resolve. Null when unknown. */
export function normaliseSleepingTrainCabin(input: unknown): SleepingTrainCabin | null {
  if (typeof input !== 'string') return null
  const wanted = input.trim().toLowerCase().replace(/[\s_-]+/g, ' ')
  const hit = SLEEPING_TRAIN_CABINS.find(c => c.value.toLowerCase() === wanted)
  return hit ? hit.value : null
}

export const SLEEPING_TRAIN_CABIN_ERROR =
  `Cabin type must be one of: ${SLEEPING_TRAIN_CABIN_VALUES.join(', ')}`
