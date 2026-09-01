// ============================================
// The operator name a train rate DISPLAYS
// ============================================
// `operator_name` is denormalized: the rates list, the rates hub and the CSV
// export all read it, and none of them join suppliers. It used to be typed
// into the form from a hardcoded list — which is how a rate came to name an
// operator that was not its supplier, and how a rate saved WITH a supplier but
// without touching that control ended up with a blank column (operator, 1 Sep:
// supplier ENR and train ENRILATED 3RD both stored, operator_name null).
//
// The form no longer offers the field at all. The supplier IS the operator, so
// the name is stamped here on every write: whatever a client sends, a rate that
// names a supplier gets that supplier's name and the two cannot drift. Rows
// heal on their next save, whichever screen performs it.
//
// With no supplier the caller's value stands, which keeps CSV imports and
// legacy rows intact.

interface Db {
  from(table: string): any
}

export async function operatorNameForSupplier(
  db: Db,
  supplierId: string | null | undefined,
  fallback: unknown
): Promise<string | null> {
  const given = typeof fallback === 'string' && fallback.trim() ? fallback.trim() : null
  if (!supplierId) return given

  const { data } = await db
    .from('suppliers')
    .select('name')
    .eq('id', supplierId)
    .maybeSingle()

  // A supplier we cannot read must not blank a name the row already carried.
  return data?.name || given
}
