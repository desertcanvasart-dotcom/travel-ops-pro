import { describe, it, expect } from 'vitest'
import { formatTourUpOrder, parseTourUpOrder, type TourUpOrder } from '@/lib/intake/tour-up-order'

// The hosted order form (/order) renders its structured answers as the
// canonical label-and-value document — the same shape the office email will
// carry once info@ats-hj.com is connected — and the fallback path hands that
// document to the operator's paste page. Both only work if format→parse is
// lossless. This test IS that promise: every field that goes in comes back.

const FULL: TourUpOrder = {
  inquiryType: '申込み',
  tourCode: 'NEK803-ABCR',
  tourTitle: 'ナイル川クルーズの旅 8日間',
  departureDate1: '2026-11-03',
  departureDate2: '2026-11-10',
  departureAirport: '成田空港',
  adults: 2,
  children: 1,
  contactMethod: 'email',
  email: 'taro@example.jp',
  phone: '090-1234-5678',
  lead: {
    lastNameRomaji: 'YAMADA', firstNameRomaji: 'TARO',
    lastNameKanji: '山田', firstNameKanji: '太郎',
    lastNameKana: 'ヤマダ', firstNameKana: 'タロウ',
    gender: 'male', birthDate: '1960-01-02',
  },
  postalCode: '150-0001',
  prefecture: '東京都',
  address: '渋谷区1-2-3',
  requests: '窓側の部屋を希望します。\n食事はアレルギー対応でお願いします。',
  companions: [
    { lastNameRomaji: 'YAMADA', firstNameRomaji: 'HANAKO', gender: 'female', birthDate: '1962-03-04' },
    { lastNameRomaji: 'YAMADA', firstNameRomaji: 'ICHIRO', gender: 'male', birthDate: '1990-05-06' },
  ],
}

const MINIMAL: TourUpOrder = {
  inquiryType: '',
  tourCode: 'HRG501',
  tourTitle: '',
  departureDate1: '2026-12-24',
  adults: 1,
  children: 0,
  email: 'solo@example.com',
  lead: { lastNameRomaji: 'SATO', firstNameRomaji: 'KEN' },
  companions: [],
}

describe('formatTourUpOrder → parseTourUpOrder round-trips', () => {
  it('a full order comes back field for field', () => {
    const back = parseTourUpOrder(formatTourUpOrder(FULL))
    expect(back).not.toBeNull()
    expect(back).toMatchObject({
      inquiryType: '申込み',
      tourCode: 'NEK803-ABCR',
      tourTitle: 'ナイル川クルーズの旅 8日間',
      departureDate1: '2026-11-03',
      departureDate2: '2026-11-10',
      departureAirport: '成田空港',
      adults: 2,
      children: 1,
      contactMethod: 'email',
      email: 'taro@example.jp',
      phone: '090-1234-5678',
      postalCode: '150-0001',
      prefecture: '東京都',
      address: '渋谷区1-2-3',
    })
    expect(back!.lead).toMatchObject({
      lastNameRomaji: 'YAMADA', firstNameRomaji: 'TARO',
      lastNameKanji: '山田', firstNameKanji: '太郎',
      lastNameKana: 'ヤマダ', firstNameKana: 'タロウ',
      gender: 'male', birthDate: '1960-01-02',
    })
    expect(back!.requests).toBe('窓側の部屋を希望します。\n食事はアレルギー対応でお願いします。')
    expect(back!.companions).toEqual([
      { lastNameRomaji: 'YAMADA', firstNameRomaji: 'HANAKO', gender: 'female', birthDate: '1962-03-04' },
      { lastNameRomaji: 'YAMADA', firstNameRomaji: 'ICHIRO', gender: 'male', birthDate: '1990-05-06' },
    ])
  })

  it('a minimal order (required fields only) round-trips without inventing values', () => {
    const back = parseTourUpOrder(formatTourUpOrder(MINIMAL))
    expect(back).not.toBeNull()
    expect(back).toMatchObject({
      tourCode: 'HRG501',
      departureDate1: '2026-12-24',
      adults: 1,
      children: 0,
      email: 'solo@example.com',
    })
    expect(back!.departureDate2).toBeUndefined()
    expect(back!.departureAirport).toBeUndefined()
    expect(back!.phone).toBeUndefined()
    expect(back!.postalCode).toBeUndefined()
    expect(back!.requests).toBeUndefined()
    expect(back!.companions).toEqual([])
    expect(back!.lead).toMatchObject({ lastNameRomaji: 'SATO', firstNameRomaji: 'KEN' })
    expect(back!.lead.lastNameKanji).toBeUndefined()
    expect(back!.lead.birthDate).toBeUndefined()
  })

  it('the word ローマ字 never appears in the document (it would move the parser past the name)', () => {
    // parseTourUpOrder slices the romaji-name section from
    // max(indexOf('ローマ字'), lastIndexOf('お名前')); a ローマ字 anywhere in
    // the rendered text lands that slice mid-line and the lead's name is lost.
    expect(formatTourUpOrder(FULL)).not.toContain('ローマ字')
    expect(formatTourUpOrder(MINIMAL)).not.toContain('ローマ字')
  })
})
