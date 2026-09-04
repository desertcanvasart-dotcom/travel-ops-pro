import { describe, it, expect } from 'vitest'
import { parseTourUpOrder, looksLikeTourUpOrder, matchTemplateCode, parseJaDate } from '@/lib/intake/tour-up-order'

// The email is the form's labels and the customer's answers, one per line.
const ORDER = `お問合せフォーム

問合せ種別：申込み
ツアーコード：NEK803-ABCR
ツアータイトル：★ナイル川クルーズの旅、ゆっくり縦断【ギザ地区1泊＆アブシンベル1泊、ナイル川クルーズ船３泊】ハイライト８日間
希望出発日
出発日(第1希望)：２０２６年９月１８日
出発日(第2希望)：----年--月--日
出発地：成田
参加人数：大人 2人 子供 1人 子供 0人
希望連絡方法：メール
メールアドレス：Hanako.Suzuki@example.jp
メールアドレス：Hanako.Suzuki@example.jp
電話番号：03-1111-2222
お名前(漢字)：姓 鈴木 名 花子
お名前(カナ)：セイ スズキ メイ ハナコ
性別：女
生年月日：西暦：1985年4月2日
ご要望・質問など：
窓側の席を希望します。
アレルギーはありません。

お名前：姓 SUZUKI 名 HANAKO
ご住所：〒 150-0001 東京都
渋谷区神宮前1-2-3
`

describe('tour-up.jp order form', () => {
  it('recognises the form and nothing else', () => {
    expect(looksLikeTourUpOrder(ORDER)).toBe(true)
    expect(looksLikeTourUpOrder('Hi, we would like a quote for Cairo in November for 2 people.')).toBe(false)
    expect(parseTourUpOrder('Hi, we would like a quote')).toBeNull()
  })

  it('reads every field of the form, full-width digits and all', () => {
    const o = parseTourUpOrder(ORDER)!
    expect(o).toMatchObject({
      inquiryType: '申込み',
      tourCode: 'NEK803-ABCR',
      departureDate1: '2026-09-18',
      departureDate2: undefined,
      departureAirport: '成田',
      adults: 2,
      children: 1,
      contactMethod: 'email',
      email: 'hanako.suzuki@example.jp',
      phone: '03-1111-2222',
      postalCode: '150-0001',
      prefecture: '東京都',
      address: '渋谷区神宮前1-2-3',
    })
    expect(o.tourTitle).toContain('ナイル川クルーズの旅')
    expect(o.lead).toEqual({
      lastNameRomaji: 'SUZUKI', firstNameRomaji: 'HANAKO',
      lastNameKanji: '鈴木', firstNameKanji: '花子',
      lastNameKana: 'スズキ', firstNameKana: 'ハナコ',
      gender: 'female', birthDate: '1985-04-02',
    })
    expect(o.requests).toBe('窓側の席を希望します。\nアレルギーはありません。')
    expect(o.companions).toEqual([])
  })

  it('reads a second date and companions when given', () => {
    const o = parseTourUpOrder(ORDER.replace('出発日(第2希望)：----年--月--日', '出発日(第2希望)：2026年10月2日') + `
同行者1
お名前：姓 SUZUKI 名 TARO
性別：男
生年月日：1983年12月24日
同行者2
お名前：姓 SUZUKI 名 KEN
性別：男
生年月日：2015年6月1日
`)!
    expect(o.departureDate2).toBe('2026-10-02')
    expect(o.companions).toEqual([
      { lastNameRomaji: 'SUZUKI', firstNameRomaji: 'TARO', gender: 'male', birthDate: '1983-12-24' },
      { lastNameRomaji: 'SUZUKI', firstNameRomaji: 'KEN', gender: 'male', birthDate: '2015-06-01' },
    ])
  })

  it('dates: 年月日, slashes, dashes; garbage is undefined', () => {
    expect(parseJaDate('２０２６年９月１８日')).toBe('2026-09-18')
    expect(parseJaDate('2026/9/8')).toBe('2026-09-08')
    expect(parseJaDate('----年--月--日')).toBeUndefined()
  })

  it('matches the programme by exact code, then by a unique stem, never by a guess', () => {
    const T = [{ template_code: 'NEK803-CR-ABS' }, { template_code: 'NEK804-CR' }, { template_code: 'NMS803-CR-ABS' }]
    expect(matchTemplateCode('NEK803-CR-ABS', T)?.template_code).toBe('NEK803-CR-ABS')
    expect(matchTemplateCode('nek803-abcr', T)?.template_code).toBe('NEK803-CR-ABS')
    expect(matchTemplateCode('NEK803', [...T, { template_code: 'NEK803-LND' }])).toBeNull()
    expect(matchTemplateCode('XYZ1-AB', T)).toBeNull()
  })
})
