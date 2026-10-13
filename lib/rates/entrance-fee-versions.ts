// ============================================
// An attraction's name in another language, for many fees at once
// ============================================
// The attraction lists merge each fee's Japanese name (entrance_fee_versions)
// over the English one. They asked for every id in ONE `.in()` — a GET whose
// URL grows ~37 characters per fee, so a company with several hundred fees
// went past the gateway's URL limit, the error was ignored, and every name
// silently fell back to English (Rates audit, Guides & Services #15). The
// ids now go in batches.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/** Ids per request: ~150 × 37 characters stays far below an 8 KB URL. */
export const VERSION_ID_BATCH = 150

export async function entranceFeeVersions(
  db: Db,
  ids: string[],
  language: string,
  batch = VERSION_ID_BATCH,
): Promise<Record<string, { attraction_name?: string; notes?: string }>> {
  const map: Record<string, { attraction_name?: string; notes?: string }> = {}
  for (let i = 0; i < ids.length; i += batch) {
    const { data, error } = await db
      .from('entrance_fee_versions')
      .select('entrance_fee_id, attraction_name, notes')
      .in('entrance_fee_id', ids.slice(i, i + batch))
      .eq('language', language)
    if (error) console.warn('[entrance_fee_versions] batch failed — names stay in English:', error.message ?? error)
    for (const v of (data ?? []) as Array<{ entrance_fee_id: string; attraction_name?: string; notes?: string }>) {
      map[v.entrance_fee_id] = { attraction_name: v.attraction_name, notes: v.notes }
    }
  }
  return map
}
