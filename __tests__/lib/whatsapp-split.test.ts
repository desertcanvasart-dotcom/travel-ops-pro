// A WhatsApp text over Twilio's 1,600-character limit goes as several
// messages, cut at natural breaks (lib/whatsapp-split.ts). Ported from
// autoura-saas #813.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { splitWhatsAppText, sendInParts, TWILIO_TEXT_LIMIT } from '@/lib/whatsapp-split'

type Sent = { success: boolean; messageId?: string; error?: string; warning?: string }

describe('splitWhatsAppText', () => {
  it('a short text is one part; an empty one is none', () => {
    expect(splitWhatsAppText('Hello', 1600)).toEqual(['Hello'])
    expect(splitWhatsAppText('   ', 1600)).toEqual([])
    expect(splitWhatsAppText('x'.repeat(1600), 1600)).toHaveLength(1)
  })

  it('every part fits, and nothing but whitespace is lost', () => {
    const text = Array.from({ length: 60 }, (_, i) => `Day ${i + 1}: Visit the temple. Lunch on the Nile.\n`).join('\n')
    const parts = splitWhatsAppText(text, TWILIO_TEXT_LIMIT)
    expect(parts.length).toBeGreaterThan(1)
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(TWILIO_TEXT_LIMIT)
    expect(parts.join('').replace(/\s/g, '')).toBe(text.replace(/\s/g, ''))
  })

  it('cuts at a paragraph break before a line, a sentence or a space', () => {
    const a = 'a'.repeat(50), b = 'b'.repeat(30)
    expect(splitWhatsAppText(`${a}\n\n${b} ${b}`, 80)).toEqual([a, `${b} ${b}`])
    expect(splitWhatsAppText(`${a}\n${b} ${b}`, 80)).toEqual([a, `${b} ${b}`])
    expect(splitWhatsAppText(`${a}. ${b} ${b}`, 80)).toEqual([`${a}.`, `${b} ${b}`])
  })

  it('never mid-word unless one word is longer than the limit', () => {
    const parts = splitWhatsAppText(`${'word '.repeat(30)}`, 22)
    for (const p of parts) expect(p).toMatch(/^(word ?)+$/)
    expect(splitWhatsAppText('x'.repeat(50), 20)).toEqual(['x'.repeat(20), 'x'.repeat(20), 'x'.repeat(10)])
  })

  it('never cuts an emoji in half', () => {
    const parts = splitWhatsAppText('x'.repeat(19) + '😀' + 'y'.repeat(5), 20)
    expect(parts[0]).toBe('x'.repeat(19))
    expect(parts[1].startsWith('😀')).toBe(true)
  })
})

describe('sendInParts', () => {
  it('sends in order and says how many messages it took', async () => {
    const sent: string[] = []
    const r = await sendInParts<Sent>(['one', 'two', 'three'], async b => { sent.push(b); return { success: true, messageId: `SM-${b}` } })
    expect(sent).toEqual(['one', 'two', 'three'])
    expect(r).toMatchObject({ success: true, messageId: 'SM-one' })
    expect(r.warning).toMatch(/Sent as 3 messages/)
  })

  it('the first part failing is the failure; a later one is reported', async () => {
    const fail = await sendInParts<Sent>(['one', 'two'], async () => ({ success: false, error: 'closed window' }))
    expect(fail).toEqual({ success: false, error: 'closed window' })

    const part = await sendInParts<Sent>(['one', 'two', 'three'], async (_b, i) =>
      i === 1 ? { success: false, error: 'boom' } : { success: true, messageId: `SM-${i}` })
    expect(part.success).toBe(true)
    expect(part.warning).toBe('Only 1 of 3 parts were sent: boom')
  })

  it('one part keeps the provider warning as it is', async () => {
    const r = await sendInParts<Sent>(['one'], async () => ({ success: true, messageId: 'SM1', warning: 'queued' }))
    expect(r).toEqual({ success: true, messageId: 'SM1', warning: 'queued' })
  })
})

// ---------------------------------------------------------------------------
// The shared sender (lib/twilio-whatsapp.ts), with Twilio stubbed.
// ---------------------------------------------------------------------------
const tw = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>>, failAt: -1 }))
vi.mock('twilio', () => ({
  default: () => ({
    messages: {
      create: async (args: Record<string, unknown>) => {
        const i = tw.calls.length
        tw.calls.push(args)
        if (i === tw.failAt) throw Object.assign(new Error('Twilio said no'), { code: 21617 })
        return { sid: `SM${i}`, status: 'sent' }
      },
    },
  }),
}))
vi.mock('@/lib/whatsapp-org', () => ({ senderForOrg: async () => 'whatsapp:+201000000000', NO_WHATSAPP_SENDER: 'no sender' }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))

describe('sendWhatsAppMessage splits long text', () => {
  beforeEach(() => {
    tw.calls = []; tw.failAt = -1
    process.env.TWILIO_ACCOUNT_SID = 'AC-test'; process.env.TWILIO_API_KEY = 'SK-test'; process.env.TWILIO_API_SECRET = 'test'
  })
  const long = Array.from({ length: 40 }, (_, i) => `Paragraph ${i}: ${'lorem ipsum '.repeat(6)}`).join('\n\n')

  it('a short text is one message, as before', async () => {
    const { sendWhatsAppMessage } = await import('@/lib/twilio-whatsapp')
    const r = await sendWhatsAppMessage({ to: '+201234567890', body: 'Hi', orgId: 'org-1' })
    expect(r).toMatchObject({ success: true, messageId: 'SM0' })
    expect(tw.calls).toHaveLength(1)
    expect(tw.calls[0].body).toBe('Hi')
  })

  it('a long text goes as several messages, each within the limit', async () => {
    const { sendWhatsAppMessage } = await import('@/lib/twilio-whatsapp')
    const r = await sendWhatsAppMessage({ to: '+201234567890', body: long, orgId: 'org-1' })
    expect(tw.calls.length).toBeGreaterThan(1)
    for (const c of tw.calls) expect(String(c.body).length).toBeLessThanOrEqual(TWILIO_TEXT_LIMIT)
    expect(r.success).toBe(true)
    expect(r.warning).toMatch(/Sent as \d+ messages/)
  })

  it('a file with a long text: the file goes first on its own, then the words', async () => {
    const { sendWhatsAppMessage } = await import('@/lib/twilio-whatsapp')
    const r = await sendWhatsAppMessage({ to: '+201234567890', body: long, mediaUrl: 'https://x/quote.pdf', orgId: 'org-1' })
    expect(tw.calls[0]).toMatchObject({ mediaUrl: ['https://x/quote.pdf'] })
    expect(tw.calls[0].body).toBeUndefined()
    expect(tw.calls.slice(1).every(c => !c.mediaUrl)).toBe(true)
    expect(r).toMatchObject({ success: true, messageId: 'SM0' })
  })

  it('a file with a short caption is still one message', async () => {
    const { sendWhatsAppMessage } = await import('@/lib/twilio-whatsapp')
    await sendWhatsAppMessage({ to: '+201234567890', body: 'Your quote', mediaUrl: 'https://x/q.pdf', orgId: 'org-1' })
    expect(tw.calls).toEqual([expect.objectContaining({ body: 'Your quote', mediaUrl: ['https://x/q.pdf'] })])
  })

  it('a part failing midway says how many went', async () => {
    tw.failAt = 1
    const { sendWhatsAppMessage } = await import('@/lib/twilio-whatsapp')
    const r = await sendWhatsAppMessage({ to: '+201234567890', body: long, orgId: 'org-1' })
    expect(r.success).toBe(true)
    expect(r.warning).toMatch(/^Only 1 of \d+ parts were sent: Twilio said no/)
    expect(tw.calls).toHaveLength(2)
  })
})

describe('the inbox send route splits too', () => {
  it('sends and stores each part', () => {
    const s = readFileSync(join(process.cwd(), 'app/api/whatsapp/messages/route.ts'), 'utf8')
    expect(s).toContain('splitWhatsAppText(')
    expect(s).toMatch(/messages: saved/)
  })
})
