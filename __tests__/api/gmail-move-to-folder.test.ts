// Moving emails into, between and out of a made folder (operator,
// 2026-10-15: "I don't see any function to move the emails").
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { NextRequest } from 'next/server'

const batchModify = vi.fn(async () => ({}))
vi.mock('@/lib/gmail', () => ({
  getAuthenticatedGmail: async () => ({ gmail: { users: { messages: { batchModify } } } }),
  GmailAuthError: class extends Error {},
}))
vi.mock('@/lib/auth/current-org', () => ({ getCurrentUserId: async () => 'me' }))
vi.mock('@/lib/gmail-mailbox', async () => {
  const g = await import('@/lib/gmail')
  return { getMailboxGmail: (id: string) => g.getAuthenticatedGmail(id) }
})

import { POST } from '@/app/api/gmail/actions/route'
const post = (body: unknown) => POST(new NextRequest('http://x/api/gmail/actions', { method: 'POST', body: JSON.stringify(body) }))
const labelsOf = () => (batchModify.mock.calls[0] as unknown as [{ requestBody: { addLabelIds?: string[]; removeLabelIds?: string[] } }])[0].requestBody

beforeEach(() => batchModify.mockClear())

describe('move', () => {
  it('from the inbox into a folder: the folder in, the inbox out', async () => {
    expect((await post({ messageIds: ['m1', 'm2'], action: 'move', labelId: 'Label_7' })).status).toBe(200)
    expect(labelsOf()).toMatchObject({ addLabelIds: ['Label_7'], removeLabelIds: ['INBOX'] })
  })
  it('from one folder to another: out of the first, not the inbox', async () => {
    await post({ messageIds: ['m1'], action: 'move', labelId: 'Label_8', fromLabelId: 'Label_7' })
    expect(labelsOf()).toMatchObject({ addLabelIds: ['Label_8'], removeLabelIds: ['Label_7'] })
  })
  it('from a folder back to the inbox', async () => {
    await post({ messageIds: ['m1'], action: 'move', labelId: 'INBOX', fromLabelId: 'Label_7' })
    expect(labelsOf()).toMatchObject({ addLabelIds: ['INBOX'], removeLabelIds: ['Label_7'] })
  })
  it('refuses a malformed label id and a move to where the email already is', async () => {
    expect((await post({ messageIds: ['m1'], action: 'move', labelId: 'x y' })).status).toBe(400)
    expect((await post({ messageIds: ['m1'], action: 'move', labelId: 'Label_7', fromLabelId: 'Label_7' })).status).toBe(400)
    expect(batchModify).not.toHaveBeenCalled()
  })
})

describe('the inbox page', () => {
  const page = readFileSync('app/inbox/_views/EmailView.tsx', 'utf8')
  it('lists a made folder by its label, not a search inside the inbox', () => {
    expect(page).toContain('onClick={() => setFolder(`label:${label.id}`)}')
    expect(page).not.toContain('fetchEmails(`label:${label.name}`)')
    expect(page).toContain("customLabelOf(folder) ?? FOLDER_LABEL[folder as SystemFolder]")
  })
  it('shows a labelled "Move to" in the list toolbar and the open email, with New folder', () => {
    expect(page).toContain("renderMoveMenu('bulk', Array.from(selectedEmails))")
    expect(page).toContain("renderMoveMenu('detail')")
    expect(page).toContain('<span>Move to</span>')
    expect(page).toContain('New folder…')
  })
  it('emails can be dragged onto a sidebar folder', () => {
    expect(page).toContain('draggable={canMove}')
    expect(page).toContain('{...dragHandlers(label.id)}')
  })
})
