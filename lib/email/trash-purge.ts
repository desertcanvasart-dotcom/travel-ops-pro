// Gmail's permanent delete needs the full https://mail.google.com/ scope, which
// this app does not ask for (lib/gmail.ts GMAIL_SCOPES) — Google refused every
// "Delete forever" and the operator saw "Internal server error". Gmail empties
// Trash on its own after 30 days, so that is the answer instead.
export const TRASH_PURGE_MESSAGE =
  'Emails in Trash are deleted automatically by Gmail after 30 days. To bring one back, use Restore.'
