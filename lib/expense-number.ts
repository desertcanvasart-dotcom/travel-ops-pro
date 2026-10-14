// ============================================
// The next expense number, per company
// ============================================
// next_expense_number() (migration 20261227) hands out EXP-YYYY-NNN from a
// per-company counter. A database that has not had the migration yet answers
// the rpc with an error; the number then comes from the global sequence as it
// always did, so deploying the code before the migration costs nothing.

import type { SupabaseClient } from '@supabase/supabase-js'
import { nextDocumentNumber } from '@/lib/document-numbering'

export async function nextExpenseNumber(supabase: SupabaseClient, orgId: string, year: number = new Date().getFullYear()): Promise<string> {
  const { data, error } = await supabase.rpc('next_expense_number', { p_org: orgId, p_year: year })
  if (!error && typeof data === 'string' && data) return data
  return nextDocumentNumber({
    supabase,
    prefix: 'EXP',
    sequenceName: 'expense_number_seq',
    table: 'expenses',
    column: 'expense_number',
    year,
  })
}
