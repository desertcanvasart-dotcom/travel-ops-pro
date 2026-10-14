/** A literal string for a LIKE/ILIKE pattern: its wildcards matched as themselves. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, ch => `\\${ch}`)
}
