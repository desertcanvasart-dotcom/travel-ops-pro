import { describe, it, expect } from 'vitest'
import { emailOrderText, looksLikeTupMail, parseTupMail, websitePageKey } from '@/lib/intake/tup-mail'
import { looksLikeTourUpOrder, parseTourUpOrder } from '@/lib/intake/tour-up-order'

import { OPTIONAL_TOUR_MAIL, PACKAGE_TOUR_MAIL, REAL_TOUR_MAIL } from '../fixtures/tup-mails'

describe('T-UP notification email (the website → the office)', () => {
  it('recognises both kinds, and the router sends them here', () => {
    expect(looksLikeTupMail(OPTIONAL_TOUR_MAIL)).toBe(true)
    expect(looksLikeTupMail(PACKAGE_TOUR_MAIL)).toBe(true)
    expect(looksLikeTourUpOrder(OPTIONAL_TOUR_MAIL)).toBe(true)
    expect(looksLikeTupMail('●お知らせ：年末年始の営業について')).toBe(false)
    expect(parseTourUpOrder(OPTIONAL_TOUR_MAIL)?.tourCode).toBe('EXR-B12-FD')
  })

  it('reads an optional tour, field for field', () => {
    const o = parseTupMail(OPTIONAL_TOUR_MAIL)!
    expect(o).toMatchObject({
      inquiryType: '申込み',
      tourCode: 'EXR-B12-FD',
      productKind: 'optional',
      websiteUrl: 'https://tour.ats-hj.com/opt_detail.php?id=67',
      departureDate1: '2027-02-24',
      departureDate2: undefined,
      departureAirport: undefined,
      adults: 2,
      children: 0,
      infants: undefined,
      websiteSubtotalJpy: 175000,
      contactMethod: 'email',
      email: 'yamada.test@example.jp',
      phone: '090-0000-1234',
      postalCode: '164-0001',
      prefecture: '東京都',
      address: '中野区中野1-2-3 テストハイツ101',
      requests: undefined,
    })
    expect(o.tourTitle).toBe('カイロ発着 ルクソール観光 カルナック神殿・王家の谷・ハトシェプスト葬祭殿など')
    expect(o.priceNotes).toContain('追加料金32,000円')
    expect(o.priceNotes).toContain('ピーク期とは4/27')
    expect(o.lead).toEqual({
      lastNameRomaji: 'YAMADA', firstNameRomaji: 'HANAKO',
      lastNameKanji: '山田', firstNameKanji: '花子',
      lastNameKana: 'ヤマダ', firstNameKana: 'ハナコ',
      gender: 'female', birthDate: '1993-07-11',
    })
    expect(o.companions).toEqual([
      { lastNameRomaji: 'YAMADA', firstNameRomaji: 'TARO', gender: 'male', birthDate: '1990-04-16' },
    ])
  })

  it('reads a package tour: two departure choices, both 子供 bands, requests, and stops at the footer', () => {
    const o = parseTupMail(PACKAGE_TOUR_MAIL)!
    expect(o).toMatchObject({
      tourCode: 'NEK803-ABCR',
      productKind: 'tour',
      websiteUrl: 'https://tour.ats-hj.com/detail.php?id=803',
      departureDate1: '2026-10-16',
      departureDate2: undefined,
      departureAirport: '成田',
      adults: 2,
      children: 1,
      websiteSubtotalJpy: 1250000,
      contactMethod: 'phone',
      email: 'sato.test@example.jp',
    })
    expect(o.requests).toBe('窓側の席を希望します。\nベジタリアン食をお願いします。')
    expect(o.companions.map(c => c.firstNameRomaji)).toEqual(['YUKI', 'KEN'])
    // The mailer's footer is not the last companion's sex.
    expect(o.companions[1].gender).toBe('male')
  })

  it('reads the REAL package-tour notification (2026-08-30), which the form-built sample did not match', () => {
    // It used to return null: the website labels the date 希望出発日(第1希望).
    const o = parseTupMail(REAL_TOUR_MAIL)!
    expect(o).not.toBeNull()
    expect(o).toMatchObject({
      inquiryType: '申込み',
      tourCode: 'NEK502',
      productKind: 'tour',
      websiteUrl: 'http://tour.ats-hj.com/detail.php?id=2297504&hf=0',
      departureDate1: '2026-10-09',
      departureDate2: '2026-10-08',
      departureAirport: '成田',
      adults: 3,
      children: 0,
      infants: undefined,
      websiteSubtotalJpy: undefined,
      websiteBaseFare1: { adultJpy: 348000, childJpy: undefined },
      websiteBaseFare2: { adultJpy: 348000, childJpy: undefined },
      contactMethod: 'email',
      email: 'sato.test@example.jp',
      phone: '09000001111',
      postalCode: '100-0001',
      prefecture: '東京都',
      address: '千代田区千代田9-9-9-202',
      requests: undefined,
    })
    // Wrapped mid-phrase by the mailer: no space inside 2大都市.
    expect(o.tourTitle).toBe('★国内線移動で楽々★古代遺跡の宝庫・エジプトを満喫！★2大都市カイロ・ギザ/ルクソール★5日間の旅!')
    // The lead's romaji, sex and birth are top-level fields here, not a ●代表者 block.
    expect(o.lead).toEqual({
      lastNameRomaji: 'SATO', firstNameRomaji: 'HANAKO',
      lastNameKanji: '佐藤', firstNameKanji: '花子',
      lastNameKana: 'サトウ', firstNameKana: 'ハナコ',
      gender: 'female', birthDate: '1997-07-14',
    })
    // A birth date in quotes, and only one of the two companions named.
    expect(o.companions).toEqual([
      { lastNameRomaji: 'SUZUKI', firstNameRomaji: 'MAI', gender: 'female', birthDate: '1998-06-07' },
    ])
    // The inbox router reaches the same reader.
    expect(looksLikeTourUpOrder(REAL_TOUR_MAIL)).toBe(true)
    expect(parseTourUpOrder(REAL_TOUR_MAIL)?.tourCode).toBe('NEK502')
  })

  it('a second date, infants, and 姓/名 sub-labels are read when given', () => {
    const o = parseTupMail(PACKAGE_TOUR_MAIL
      .replace('●出発日(第2希望)：----/--/--', '●出発日(第2希望)：2026/10/23')
      .replace('大人 2人、子供 1人、子供 0人', '大人 2人、子供 1人、幼児 1人')
      .replace('●お名前(漢字)：佐藤 一郎', '●お名前(漢字)：姓 名取 名 一郎'))!
    expect(o.departureDate2).toBe('2026-10-23')
    expect(o.infants).toBe(1)
    expect(o.children).toBe(1)
    // 名 inside the surname is the name, not the sub-label.
    expect([o.lead.lastNameKanji, o.lead.firstNameKanji]).toEqual(['名取', '一郎'])
  })

  it('no code or no date is not an order', () => {
    expect(parseTupMail(OPTIONAL_TOUR_MAIL.replace('●希望利用日：2027/02/24', '●希望利用日：'))).toBeNull()
    expect(parseTupMail(OPTIONAL_TOUR_MAIL.replace('EXR-B12-FD', ''))).toBeNull()
  })

  it('an HTML-only body keeps its lines', () => {
    const html = OPTIONAL_TOUR_MAIL.split('\n').map(l => `${l}<br>`).join('')
    expect(parseTupMail(emailOrderText(null, html))?.lead.firstNameRomaji).toBe('HANAKO')
  })

  it('a website page is the same page however its URL is spelled', () => {
    expect(websitePageKey('https://tour.ats-hj.com/opt_detail.php?id=67')).toBe('opt_detail.php?id=67')
    expect(websitePageKey('http://www.tour.ats-hj.com/opt_detail.php?ref=x&id=67')).toBe('opt_detail.php?id=67')
    expect(websitePageKey('not a url')).toBeNull()
    expect(websitePageKey(null)).toBeNull()
  })
})
