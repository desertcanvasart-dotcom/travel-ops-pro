// The sentence a refused rate delete answers with (lib/rates/rate-delete-guard).
// Pure — kept apart so a client or a test can use it without a database.

export type RateReference = { label: string; count: number }

/** Human sentence naming every non-zero reference, or null when nothing blocks. */
export function describeRateBlockers(refs: readonly RateReference[]): string | null {
  const blocking = refs.filter(r => r.count > 0)
  if (blocking.length === 0) return null
  return `This rate is used by ${blocking.map(r => `${r.count} ${r.label}`).join(', ')} — deactivate it instead of deleting it.`
}
