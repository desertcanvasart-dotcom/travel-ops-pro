// ============================================
// "Approved by" on the Expenses screens
// ============================================
// expenses.approved_by is a user id; the list and the detail show a name.
// Looked up in one query per response, from user_profiles (the profile table
// keeps the name; roles are not read from it).

/** Minimal client shape: the service-role client the routes already hold. */
type DbClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

/**
 * The same rows with `approved_by_name` added where an approver is on record.
 * A person with no profile name shows their email; one with neither is left
 * without a name (the screen then shows the approval date alone). A failed
 * lookup changes nothing: the expense still loads.
 */
export async function withApproverNames<T extends { approved_by?: string | null }>(
  supabase: DbClient,
  rows: T[],
): Promise<Array<T & { approved_by_name: string | null }>> {
  const ids = Array.from(new Set(rows.map(r => r.approved_by).filter((id): id is string => !!id)))
  const names = new Map<string, string>()
  if (ids.length > 0) {
    const { data, error } = await supabase.from('user_profiles').select('id, full_name, email').in('id', ids)
    if (error) console.error('Error reading approver names:', error)
    for (const p of (data ?? []) as Array<{ id: string; full_name?: string | null; email?: string | null }>) {
      const name = p.full_name?.trim() || p.email?.trim()
      if (name) names.set(p.id, name)
    }
  }
  return rows.map(r => ({ ...r, approved_by_name: r.approved_by ? names.get(r.approved_by) ?? null : null }))
}
