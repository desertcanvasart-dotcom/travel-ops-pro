// ============================================
// A.T.S 予約確認書兼請求書 — booking confirmation and invoice in one
// ============================================
// A copy of the office's own Excel sheet (予約確認書兼請求書_ATS.xlsx, received
// 2026-11-02) — its colours, boxes, wording and fixed price rows, read cell by
// cell from the file rather than approximated:
//   navy #1F4E6E headings and table heads (white text), cream #F6EEDF for the
//   numbered name cells, the total and the payment boxes, pale blue #EAF2F6
//   for the small labels, the title in a #C9894A box, the tour code in that
//   same amber, deadlines in red #C0392B.
// The only deliberate difference is the face: the sheet uses Meiryo UI, which
// the server does not have, so it prints in Noto Sans JP (the Japanese font
// every document here embeds).
//
// One document is BOTH the confirmation and the bill — which is why the price
// rows list the whole trip, not just what is due now (see
// ats-source-defects-and-invoice-model: deposit + balance = trip price).
//
// Pure: context in, HTML out. Money and dates are formatted by the assembler.

import type { DocumentPage, DocumentTemplate } from '../types'
import type { DailyItineraryContext } from './ats-daily-itinerary'

export interface BookingConfirmationContext {
  font_face_css: string
  letterhead: DailyItineraryContext['letterhead'] & {
    email: string
    website: string
  }
  /** The company seal printed beside the greeting, as a data URI. */
  seal_url: string | null
  /** 代表者名 — printed before 様. */
  representative: string
  /** 担当者 — the office member handling the booking. */
  staff: string
  created_date: string
  phone: string
  email: string

  departure_date: string
  tour_code: string
  tour_name: string
  /** Romaji names exactly as the passport, in party order. */
  travellers: string[]

  flights: Array<{
    date: string
    weekday: string
    from: string
    to: string
    flight_no: string
    depart: string
    arrive: string
    status: string
  }>
  /** 「EK＝エミレーツ航空」 for the carriers flown. */
  airline_legend: string[]

  hotels: Array<{
    city: string
    check_in: string
    check_out: string
    nights: string
    rooms: string
    room_type: string
    hotel: string
  }>

  /** 備考 lines, each printed as written. */
  remarks: string[]

  /** The sheet's fixed rows, in its order (see confirmationCharges). */
  charges: Array<{ description: string; unit_price: string; quantity: string; amount: string }>
  total: string

  /** 振込先: the account name line, then the bank line. */
  bank_lines: string[]
  /** ●旅行代金申込金 and ●旅行代金残金 — each a deadline over an amount. */
  deposit: { amount: string; due: string }
  balance: { amount: string; due: string }
}

// The sheet prints with wide margins and scaled down to one page; the 12mm
// margin and the body zoom below reproduce that, so it stays one A4 page.
const PAGE: DocumentPage = { size: 'A4', orientation: 'portrait', margin: '12mm' }

/** The sheet's own company line, as written under the logo. */
export const ATS_COMPANY_LINE = '株式会社　エイ・ティ・エス'

/** The sheet's greeting, word for word. */
const GREETING = [
  'この度は、株式会社 A.T.S　（エイ・ティ・エス） にお申込み頂き、誠に有難うございます。',
  'ご予約頂きました内容を記載致しましたので、ご確認頂き、ご入金のお手続きを何卒よろしくお願い致します。',
]

/** The sheet's 備考, word for word (cells A42–A48). The visa cell holds two
 *  lines; the guide-tip line is indented under the line before it. Company
 *  profile → confirmation_remarks replaces this when filled. */
export const DEFAULT_CONFIRMATION_REMARKS = [
  '※乗継地（経由地）でのご搭乗手続きはお客様ご自身で行っていただきます。',
  '※飛行機の座席指定はお客様自身にてお願いしております。（詳細は弊社ホームページのよくある質問をご参照ください。）',
  '※エジプト入国には査証（ビザ）の取得が必要です。2026年8月1日現在、ビザ代30US$+システム利用料6US$：合計36US$',
  '※2027年1月1日より、ビザ代33US$+システム利用料6US$：合計39US$に変更',
  '※当社の基本旅行代金には日本語ガイド・英語ドライバーなどへのチップは含まれておりません。下記、日本で事前にお支払いいただきます。',
  '　１組に付き、日本語ガイドUS$25/日・ドライバーUS$20/日になります。',
  '※ナイル川クルーズ船を含む場合はお一人様US＄5ｘ日数のチップが必要です。下記、日本で事前にお支払いいただきます。',
  '※エジプトでは日本と違いサービスに対してチップを渡す習慣が日常とされています。ベッドメーキング(俗にいう枕銭）・列車車掌・ポーター・トイレチップ等が必要です。ご理解の上、各自、現地でのお支払いをお願いしております。ご理解の上、ご参加下さい。',
].join('\n')

/** The sheet's 振込先 (cells A64, A66). Company profile → bank_transfer
 *  replaces it when filled. */
export const DEFAULT_BANK_LINES = ['口座名　　　 株式会社　エイ・ティ・エス', '振込銀行　三菱UFJ銀行　六本木支店　普通預金　0788648']

const NOTES = [
  '※現地事情・道路状況等により、旅程・見学箇所・訪問順序・食事内容が変更になる場合がございます。',
  '※お振込手数料は、お客様にてご負担して頂きます様お願い申し上げます。',
  '※海外旅行傷害保険のご加入をご希望の場合は、保険料を加算してご入金下さい。',
]
const LAST_NOTE = '※万が一、期限までにお手続きが間に合わない場合は、必ず担当者までご連絡をお願い致します。'

function esc(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Pad a list to at least `min` rows with blanks — the sheet's empty rows the
 *  office fills by hand. */
function padded<T>(rows: T[], min: number, blank: T): T[] {
  const out = [...rows]
  while (out.length < min) out.push(typeof blank === 'object' ? { ...blank } : blank)
  return out
}

function header(ctx: BookingConfirmationContext): string {
  const lh = ctx.letterhead
  const offices = lh.offices
    .slice(0, 2)
    .map(
      o => `<div class="office">
      <div class="olbl">${esc(o.label)}</div>
      <div class="olines">
        ${o.postal_code ? `<div>〒${esc(o.postal_code)}</div>` : ''}
        <div>${esc(o.address)}</div>
        ${o.tel || o.fax ? `<div>Ｔｅｌ：${esc(o.tel)}${o.fax ? `　ＦＡＸ：${esc(o.fax)}` : ''}</div>` : ''}
      </div>
    </div>`
    )
    .join('')
  return `<div class="head">
    <div class="hl">
      ${lh.logo_url ? `<img class="logo" src="${esc(lh.logo_url)}" alt="" />` : ''}
      <div class="coname">${esc(lh.company_name || ATS_COMPANY_LINE)}</div>
      <div class="title">予約確認書兼請求書</div>
    </div>
    <div class="hr">
      ${offices}
      <div class="web">${lh.email ? `<span>${esc(lh.email)}</span>` : ''}${lh.website ? `<span>${esc(lh.website)}</span>` : ''}</div>
    </div>
  </div>`
}

export const atsBookingConfirmation: DocumentTemplate<BookingConfirmationContext> = {
  slug: 'ats-booking-confirmation',
  label: '予約確認書兼請求書 (Booking confirmation & invoice)',
  description: 'The booking confirmation that is also the invoice, in the office’s own Japanese layout.',
  page: PAGE,

  render(ctx: BookingConfirmationContext): string {
    const names = padded(ctx.travellers, 6, '')
    while (names.length % 3) names.push('')
    const nameRows: string[] = []
    for (let i = 0; i < names.length; i += 3) {
      nameRows.push(
        `<tr>${names
          .slice(i, i + 3)
          .map((n, j) => `<td class="nn">${i + j + 1}</td><td class="nv">${esc(n)}</td>`)
          .join('')}</tr>`
      )
    }
    const flights = padded(ctx.flights, 4, { date: '', weekday: '', from: '', to: '', flight_no: '', depart: '', arrive: '', status: '' })
    const hotels = padded(ctx.hotels, 3, { city: '', check_in: '', check_out: '', nights: '', rooms: '', room_type: '', hotel: '' })

    return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>${esc(ctx.tour_code)} 予約確認書兼請求書</title>
<style>
  ${ctx.font_face_css}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'NotoSansJP', "Meiryo UI", "Meiryo", "Hiragino Sans", "Yu Gothic", sans-serif;
    font-size: 7.6pt;
    line-height: 1.35;
    color: #1D2A36;
    zoom: 0.88;
  }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 0.6pt solid #8FA5B5; padding: 0.8pt 3pt; vertical-align: middle; }
  th { background: #1F4E6E; color: #fff; font-weight: 700; text-align: center; font-size: 7.3pt; border-color: #fff #8FA5B5; white-space: nowrap; }
  .sec { color: #1F4E6E; font-weight: 700; font-size: 8pt; margin: 4pt 0 1pt; }

  /* letterhead */
  .head { display: flex; justify-content: space-between; align-items: flex-start; }
  .hl { width: 50%; }
  .hl .logo { height: 40pt; display: block; margin-left: 14pt; }
  .hl .coname { color: #1F4E6E; font-weight: 700; font-size: 10pt; margin: 1pt 0 0 34pt; letter-spacing: 0.08em; }
  .hl .title { color: #1F4E6E; font-weight: 700; font-size: 15pt; letter-spacing: 0.06em; text-align: center;
               border: 0.9pt solid #C9894A; padding: 4pt 0; margin: 9pt 0 0 14pt; width: 88%; }
  .hr { width: 46%; font-size: 7.8pt; line-height: 1.5; }
  .office { display: flex; gap: 6pt; }
  .office .olbl { color: #1F4E6E; font-weight: 700; text-decoration: underline; min-width: 22pt; }
  .web { display: flex; justify-content: space-between; padding: 1pt 10pt 0 30pt; text-decoration: underline; font-size: 8.4pt; }

  /* who */
  .who { display: flex; align-items: flex-end; margin-top: 6pt; }
  .who .rep { flex: 1; display: flex; align-items: baseline; gap: 8pt; padding-left: 40pt; }
  .who .rep .l { color: #1F4E6E; font-weight: 700; font-size: 7.8pt; }
  .who .rep .v { font-size: 10.5pt; font-weight: 700; min-width: 120pt; text-align: center; }
  .who .rep .sama { font-size: 10.5pt; font-weight: 700; }
  .who .meta { display: flex; gap: 4pt; font-size: 7pt; }
  .who .meta .l { background: #EAF2F6; color: #1F4E6E; font-weight: 700; padding: 1pt 4pt; }
  .who .meta .v { min-width: 56pt; padding: 1pt 3pt; }
  .contact { width: 84%; margin: 6pt 0 0 auto; }
  .contact td { height: 13pt; }
  .contact .l { background: #EAF2F6; color: #1F4E6E; font-weight: 700; text-align: center; width: 15%; }

  .greet { position: relative; margin: 8pt 0 4pt; font-size: 7.8pt; }
  .greet .seal { position: absolute; right: 18pt; top: -2pt; width: 44pt; }

  .facts { width: 100%; margin-top: 3pt; }
  .facts td { border: none; padding: 1pt 0; vertical-align: top; }
  .facts .l { width: 14%; color: #1F4E6E; font-weight: 700; font-size: 7.8pt; border-right: 0.6pt solid #8FA5B5; }
  .facts .v { padding-left: 8pt; }
  .facts .code { color: #C9894A; font-weight: 700; font-size: 8.6pt; }
  .facts .tname { color: #1F4E6E; font-weight: 700; font-size: 9.6pt; line-height: 1.45; height: 34pt; }

  .namehead { display: flex; gap: 40pt; align-items: baseline; margin-top: 5pt; }
  .namehead .note { font-size: 6.4pt; font-weight: 700; }
  .names td { height: 14pt; }
  .names .nn { width: 3.2%; background: #F6EEDF; color: #1F4E6E; font-weight: 700; font-size: 9pt; text-align: center; }
  .names .nv { width: 30.1%; font-weight: 700; font-size: 9pt; text-align: center; letter-spacing: 0.03em; }

  .flights td, .hotels td { text-align: center; height: 12.4pt; font-size: 7.3pt; }
  .flights .legend td { height: 14pt; font-weight: 700; font-size: 7.8pt; }
  .flights .legend .l { background: #EAF2F6; color: #1F4E6E; }
  .after { font-weight: 700; font-size: 7.8pt; margin-top: 1pt; }
  .hotels .unit { width: 4%; font-size: 6.6pt; }
  .hotels .hn { font-weight: 700; }
  .equiv { text-align: right; font-weight: 700; font-size: 7.3pt; padding-right: 50pt; }

  .remarks { border: 0.6pt solid #8FA5B5; padding: 2pt 4pt; font-size: 7.1pt; line-height: 1.55; }

  .money { width: 72%; }
  .money td { height: 11.6pt; font-size: 7.8pt; }
  .money .num { text-align: right; }
  .money .tot td { background: #F6EEDF; color: #1F4E6E; font-weight: 700; font-size: 9.4pt; height: 14pt; }
  .money .tot .blank { background: none; border: none; }

  .pay { display: flex; gap: 8pt; margin-top: 1pt; }
  .bank { width: 55%; background: #F6EEDF; border: 0.6pt solid #8FA5B5; color: #1F4E6E; font-weight: 700; text-align: center;
          display: flex; flex-direction: column; justify-content: center; gap: 6pt; padding: 6pt 4pt; }
  .bank .b1 { font-size: 11pt; letter-spacing: 0.04em; }
  .bank .b2 { font-size: 8.6pt; }
  .due { flex: 1; }
  .due td { background: #F6EEDF; height: 13pt; }
  .due .l { color: #1F4E6E; font-weight: 700; font-size: 8.4pt; width: 40%; }
  .due .d { color: #C0392B; font-weight: 700; font-size: 9pt; text-align: center; }
  .due .a { font-weight: 700; font-size: 10.5pt; text-align: center; }

  .notes { margin-top: 5pt; font-size: 7.8pt; }
  .notes .top { display: flex; justify-content: space-between; padding-right: 22%; }
  .notes .last { font-weight: 700; text-decoration: underline; }
</style>
</head>
<body>
  ${header(ctx)}

  <div class="who">
    <div class="rep"><span class="l">代表者名</span><span class="v">${esc(ctx.representative)}</span><span class="sama">様</span></div>
    <div class="meta"><span class="l">担当者</span><span class="v">${esc(ctx.staff)}</span><span class="l">作成日</span><span class="v">${esc(ctx.created_date)}</span></div>
  </div>
  <table class="contact"><tr>
    <td class="l">電話番号</td><td style="width:28%">${esc(ctx.phone)}</td>
    <td class="l">メールアドレス</td><td>${esc(ctx.email)}</td>
  </tr></table>

  <div class="greet">
    ${GREETING.map(g => `<div>${esc(g)}</div>`).join('')}
    ${ctx.seal_url ? `<img class="seal" src="${esc(ctx.seal_url)}" alt="" />` : ''}
  </div>

  <table class="facts">
    <tr><td class="l">【出発日】</td><td class="v">${esc(ctx.departure_date)}</td></tr>
    <tr><td class="l">【ツアーコード】</td><td class="v code">${esc(ctx.tour_code)}</td></tr>
    <tr><td class="l" style="vertical-align:middle">【ツアー名】</td><td class="v tname">${esc(ctx.tour_name)}</td></tr>
  </table>

  <div class="namehead"><span class="sec" style="margin:0">【お客様名】</span><span class="note">(※パスポートに記載のローマ字と同一かをご確認下さい。一文字でも違うと飛行機に搭乗出来ませんので、ご注意下さい。）</span></div>
  <table class="names">${nameRows.join('')}</table>

  <div class="sec">【フライトスケジュール】</div>
  <table class="flights">
    <tr><th style="width:10%">日付</th><th style="width:6%">曜日</th><th style="width:18%">出発地</th><th style="width:18%">到着地</th><th style="width:8%">便名</th><th style="width:8%">出発時間</th><th style="width:8%">到着時間</th><th>予約状況</th></tr>
    ${flights
      .map(
        f =>
          `<tr><td>${esc(f.date)}</td><td>${esc(f.weekday)}</td><td>${esc(f.from)}</td><td>${esc(f.to)}</td><td>${esc(f.flight_no)}</td><td>${esc(f.depart)}</td><td>${esc(f.arrive)}</td><td>${esc(f.status)}</td></tr>`
      )
      .join('')}
    <tr class="legend"><td class="l" colspan="2">略語説明</td><td colspan="4" style="text-align:left">${(ctx.airline_legend.length ? ctx.airline_legend : ['EK＝エミレーツ航空']).map(esc).join('　')}　　　　+1＝翌日着</td><td colspan="2" style="text-align:left">※表記時間は現地時間です。</td></tr>
  </table>
  <div class="after">※上記スケジュールは、ご予約時点での予定であり、予告なく変更となる場合がございます。</div>

  <div class="sec">【予定ご宿泊ホテル】</div>
  <table class="hotels">
    <tr><th style="width:16%">宿泊都市</th><th style="width:10%">チェックイン</th><th style="width:10%">チェックアウト</th><th colspan="2" style="width:9%">宿泊数</th><th colspan="2" style="width:9%">部屋数</th><th style="width:10%">お部屋タイプ</th><th>ホテル名</th></tr>
    ${hotels
      .map(
        h =>
          `<tr><td>${esc(h.city)}</td><td>${esc(h.check_in)}</td><td>${esc(h.check_out)}</td><td>${esc(h.nights)}</td><td class="unit">泊</td><td>${esc(h.rooms)}</td><td class="unit">部屋</td><td>${esc(h.room_type)}</td><td class="hn">${esc(h.hotel)}</td></tr>`
      )
      .join('')}
  </table>
  <div class="equiv">又は同等クラス</div>

  <div class="sec" style="margin-top:0">【備考】</div>
  <div class="remarks">${ctx.remarks.map(r => `<div>${esc(r)}</div>`).join('')}</div>

  <div class="sec">【ご請求額】</div>
  <table class="money">
    <tr><th>摘要</th><th style="width:18%">単価</th><th style="width:11%">人数</th><th style="width:22%">金額</th></tr>
    ${ctx.charges
      .map(
        c =>
          `<tr><td>${esc(c.description) || '&nbsp;'}</td><td class="num">${esc(c.unit_price)}</td><td class="num" style="text-align:center">${esc(c.quantity)}</td><td class="num">${esc(c.amount)}</td></tr>`
      )
      .join('')}
    <tr class="tot"><td class="blank"></td><td class="blank"></td><td style="text-align:center">合計</td><td class="num">${esc(ctx.total)}</td></tr>
  </table>

  <div class="sec">■振込先■</div>
  <div class="pay">
    <div class="bank">
      ${ctx.bank_lines.map((l, i) => `<div class="${i === 0 ? 'b1' : 'b2'}">${esc(l)}</div>`).join('')}
    </div>
    <div class="due">
      <table>
        <tr><td class="l" rowspan="2">●旅行代金申込金</td><td class="d">${esc(ctx.deposit.due) || '&nbsp;'}</td></tr>
        <tr><td class="a">${esc(ctx.deposit.amount)}</td></tr>
        <tr><td class="l" rowspan="2">●旅行代金残金</td><td class="d">${esc(ctx.balance.due) || '&nbsp;'}</td></tr>
        <tr><td class="a">${esc(ctx.balance.amount)}</td></tr>
      </table>
    </div>
  </div>

  <div class="notes">
    <div class="top"><span class="sec" style="margin:0">【ご注意】</span><span>（※期限厳守でお願い致します。）</span></div>
    ${NOTES.map(n => `<div>${esc(n)}</div>`).join('')}
    <div class="last">${esc(LAST_NOTE)}</div>
  </div>
</body>
</html>`
  },
}
