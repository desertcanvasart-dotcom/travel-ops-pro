// What a note and a logged communication may carry, from a request body.
//
// The Add note and Log communication modals wrote these tables straight from
// the browser, picking the row to edit or delete by its id alone and leaving
// no author. They go through /api/clients/[id]/notes and /communications now,
// which scope every row to a client of the active company; this is the
// column list those routes accept.
export const COMMUNICATION_DIRECTIONS = ['inbound', 'outbound'] as const
export const COMMUNICATION_PAGE = 20
export const COMMUNICATION_PAGE_MAX = 100

type Picked = { ok: true; data: Record<string, unknown> } | { ok: false; error: string }

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export function pickNote(body: unknown, mode: 'create' | 'update'): Picked {
  const src = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const data: Record<string, unknown> = {}

  if ('content' in src || mode === 'create') {
    const content = str(src.content)
    if (!content) return { ok: false, error: 'Note text is required' }
    data.content = content
  }
  if ('note_type' in src || mode === 'create') {
    data.note_type = str(src.note_type).slice(0, 50) || 'general'
  }
  if ('is_important' in src) data.is_important = src.is_important === true
  if ('title' in src) data.title = str(src.title).slice(0, 255) || null
  return { ok: true, data }
}

export function pickCommunication(body: unknown, mode: 'create' | 'update'): Picked {
  const src = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const data: Record<string, unknown> = {}

  if ('content' in src || mode === 'create') {
    const content = str(src.content)
    if (!content) return { ok: false, error: 'Details are required' }
    data.content = content
  }
  if ('communication_type' in src || mode === 'create') {
    data.communication_type = str(src.communication_type).slice(0, 50) || 'other'
  }
  if ('direction' in src || mode === 'create') {
    const direction = str(src.direction) || 'outbound'
    if (!(COMMUNICATION_DIRECTIONS as readonly string[]).includes(direction)) {
      return { ok: false, error: 'Direction must be inbound or outbound' }
    }
    data.direction = direction
  }
  if ('subject' in src) data.subject = str(src.subject).slice(0, 255) || null
  if ('status' in src) data.status = str(src.status).slice(0, 50) || 'completed'
  if ('communication_date' in src) {
    const when = new Date(str(src.communication_date))
    if (Number.isNaN(when.getTime())) return { ok: false, error: 'Date is not valid' }
    data.communication_date = when.toISOString()
  }
  return { ok: true, data }
}

/** clients.last_contacted_at after a communication is logged: never moves back. */
export function laterContact(current: string | null | undefined, logged: string): string {
  if (!current) return logged
  return new Date(current).getTime() >= new Date(logged).getTime() ? current : logged
}
