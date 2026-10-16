// Who may change, deactivate, delete or remove whom — shared by the Users page
// routes (/api/profiles/[id]) and the membership route
// (/api/organization/members), so the two answer the same question the same
// way and their refusals point at an action the caller can actually take.

export const isAdminRole = (role: string | null | undefined) => role === 'admin' || role === 'owner'

/**
 * May the caller change another member's role / active status, delete them,
 * or remove them from the company? Never the owner (ownership is transferred,
 * not edited); an admin only by the owner, so two admins cannot lock each
 * other out.
 */
export function mayManage(callerRole: string, targetRole: string): boolean {
  if (targetRole === 'owner') return false
  if (targetRole === 'admin') return callerRole === 'owner'
  return isAdminRole(callerRole)
}

// One person in two companies has ONE login and ONE profile. Deactivating or
// deleting it acts in both companies, which is not this company's call. What
// this company can do is take them out of itself; every refusal says so in
// the same words.
export const OTHER_COMPANY_DEACTIVATE =
  'This person also belongs to another company. Deactivating would lock them out of both, so use Remove from this company instead.'
export const OTHER_COMPANY_DELETE =
  'This person also belongs to another company. Deleting would remove them from both, so use Remove from this company instead.'
export const OTHER_COMPANY_PROFILE =
  'This person also belongs to another company, so their name and phone are theirs to change from their own profile. You can still change their role here.'

export const OWNS_RECORDS =
  'This login still owns records (trips, departures, emails or integrations), so it cannot be deleted. Deactivate it instead.'

/**
 * Tables whose rows name an auth user with a foreign key that has no
 * ON DELETE rule (baseline schema): while any of them points at the login,
 * deleting it fails in the database. Checked first so the answer is a clear
 * refusal instead of a half-done delete.
 */
export const OWNED_RECORD_REFS: ReadonlyArray<{ table: string; column: string }> = [
  { table: 'itineraries', column: 'user_id' },
  { table: 'tour_departures', column: 'created_by' },
  { table: 'operator_capacity', column: 'created_by' },
  { table: 'integrations', column: 'created_by' },
  { table: 'email_conversations', column: 'user_id' },
  { table: 'email_activity_log', column: 'user_id' },
  { table: 'email_cache_metadata', column: 'user_id' },
  { table: 'email_client_links', column: 'user_id' },
  { table: 'email_sync_state', column: 'user_id' },
  { table: 'whatsapp_conversations', column: 'hidden_by' },
]
