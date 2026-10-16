import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { addressMatches, conditionProblem, gmailQuery, ruleMatches, wordIn } from '@/lib/email/rules'

const msg = (over: Partial<{ from: string; to: string[]; cc: string[]; subject: string; text: string }> = {}) => ({
  from: 'Booking.com <noreply@booking.com>', to: ['Office <info@ats-hj.com>'], cc: [], subject: 'Reservation confirmed', text: 'Your stay in Luxor', ...over,
})

describe('inbox rules match like Gmail search, not "contains"', () => {
  it('an address is the whole address', () => {
    expect(addressMatches('Booking.com <noreply@booking.com>', 'noreply@booking.com')).toBe(true)
    expect(addressMatches('x <xnoreply@booking.com>', 'noreply@booking.com')).toBe(false)
    expect(addressMatches('x <info@ats-hj.com>', 'info@')).toBe(false)
  })

  it('a domain takes the domain and its subdomains, not look-alikes', () => {
    expect(addressMatches('a <noreply@booking.com>', 'booking.com')).toBe(true)
    expect(addressMatches('a <noreply@mail.booking.com>', '@booking.com')).toBe(true)
    expect(addressMatches('a <x@notbooking.com>', 'booking.com')).toBe(false)
  })

  it('words are whole words; Japanese is found anywhere', () => {
    expect(wordIn('A tourism fair', 'tour')).toBe(false)
    expect(wordIn('Your tour is booked', 'tour')).toBe(true)
    expect(wordIn('ご予約ありがとうございます', '予約')).toBe(true)
    expect(ruleMatches({ has_words: 'tour' }, msg({ text: 'A detour via Aswan' }))).toBe(false)
    expect(ruleMatches({ subject: 'confirmed' }, msg())).toBe(true)
  })

  it('a name condition matches the display name by words', () => {
    expect(ruleMatches({ from: 'Booking.com' }, msg())).toBe(true)
    expect(ruleMatches({ from: 'Expedia' }, msg())).toBe(false)
  })

  it('refuses rules that would catch everything', () => {
    const own = ['info@ats-hj.com']
    expect(conditionProblem({ to: 'info@ats-hj.com' }, own)).toMatch(/your own mailbox/)
    expect(conditionProblem({ to: 'ats-hj.com' }, own)).toMatch(/your own mailbox/)
    expect(conditionProblem({ from: 'info@' }, own)).toMatch(/not a whole address/)
    expect(conditionProblem({ has_words: 'to be' }, own)).toMatch(/too short/)
    expect(conditionProblem({ from: 'booking.com', has_words: 'luxor' }, own)).toBeNull()
    expect(conditionProblem({ has_words: '予約' }, own)).toBeNull()
  })

  it('apply-to-existing searches a domain as a domain', () => {
    expect(gmailQuery({ from: 'booking.com' })).toBe('from:@booking.com')
    expect(gmailQuery({ from: 'noreply@booking.com' })).toBe('from:noreply@booking.com')
  })
})

describe('what a rule did is kept and shown', () => {
  it('the rule run records it on the message; Communicate shows it', () => {
    const lib = readFileSync(join(process.cwd(), 'lib/email/rules.ts'), 'utf8')
    expect(lib).toContain('rule_applied: ruleApplied')
    const thread = readFileSync(join(process.cwd(), 'components/unified/UnifiedMessageThread.tsx'), 'utf8')
    expect(thread).toContain('ruleNote(msg.rule_applied)')
    const sql = readFileSync(join(process.cwd(), 'migrations/20270106_email_rule_applied.sql'), 'utf8')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS rule_applied JSONB')
  })
})
