// The pickup details message (lib/notify/pickup-message, ported from autoura-saas, with Japanese).
import { describe, it, expect } from 'vitest'
import { buildPickupMessage } from '@/lib/notify/pickup-message'

const DAY = {
  agency: 'Nile Tours', clientName: 'Hanako Sato', tripName: 'Cairo & Luxor 5 days',
  date: '2026-10-09', dayNumber: 2, time: '08:00', place: 'Marriott Mena House lobby',
  guide: { name: 'Amr Hassan', phone: '+20 100 111 2222' }, driver: { name: 'Sayed', phone: '01001234567' },
  vehicle: 'Toyota HiAce (8 pax)',
}

describe('the pickup details message', () => {
  it('when, where and who — with numbers to call', () => {
    expect(buildPickupMessage(DAY)).toBe([
      'Hello Hanako,',
      '',
      'Here are your pickup details for Friday, 9 October (day 2 of Cairo & Luxor 5 days):',
      '',
      '🕐 Pickup time: 08:00',
      '📍 Pickup point: Marriott Mena House lobby',
      '🧭 Your guide: Amr Hassan (+20 100 111 2222)',
      '🚐 Your driver: Sayed (01001234567) — Toyota HiAce (8 pax)',
      '',
      'Please be ready a few minutes early. If anything changes, reply to this message.',
      '',
      'Nile Tours team',
    ].join('\n'))
  })

  it('in Japanese for a Japanese client: the whole name with 様, a Japanese date', () => {
    expect(buildPickupMessage({ ...DAY, language: 'ja', clientName: '佐藤 花子' })).toBe([
      '佐藤 花子様',
      '',
      '10月9日（金）（2日目・Cairo & Luxor 5 days）のお迎えについてご案内いたします。',
      '',
      '🕐 お迎え時間：08:00',
      '📍 お迎え場所：Marriott Mena House lobby',
      '🧭 ガイド：Amr Hassan (+20 100 111 2222)',
      '🚐 ドライバー：Sayed (01001234567)（Toyota HiAce (8 pax)）',
      '',
      'お時間の数分前にはご準備をお願いいたします。変更がございましたら、このメッセージにご返信ください。',
      '',
      'Nile Tours',
    ].join('\n'))
  })

  it('says what is not settled rather than leaving a gap; names nobody not booked', () => {
    const text = buildPickupMessage({ date: '2026-10-01', airport: { name: 'Mona' } })
    expect(text).toContain('🕐 Pickup time: to be confirmed')
    expect(text).toContain('📍 Pickup point: to be confirmed')
    expect(text).toContain('🛬 Meeting you at the airport: Mona')
    expect(text).not.toContain('guide')
    expect(text).toContain('Your travel team')
    const ja = buildPickupMessage({ date: '2026-10-01', language: 'ja' })
    expect(ja).toContain('🕐 お迎え時間：確定次第ご連絡します')
    expect(ja.startsWith('お客様')).toBe(true)
    expect(ja).not.toContain('ガイド')
  })

  it('a vehicle with no driver named still says which car', () => {
    expect(buildPickupMessage({ date: '2026-10-01', vehicle: 'Sedan' })).toContain('🚐 Your vehicle: Sedan')
  })
})
