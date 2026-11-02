// ============================================
// A.T.S 予約確認書兼請求書 — booking confirmation and invoice in one
// ============================================
// The digital edition of the Excel sheet the Tokyo office sends once a
// booking is taken: letterhead, who booked and who handles it, the tour, every
// traveller's name as on the passport, the flight schedule, the planned
// hotels, the standing remarks, the price stack, the bank account, and the
// two payment deadlines. One document is BOTH the confirmation and the bill —
// which is why the charges list the whole trip, not just what is due now (see
// ats-source-defects-and-invoice-model: deposit + balance = trip price).
//
// Pure: context in, HTML out. Formatting of money and dates happens in the
// assembler, so this file only arranges strings.

import type { DocumentPage, DocumentTemplate } from '../types'
import type { DailyItineraryContext } from './ats-daily-itinerary'

export interface BookingConfirmationContext {
  font_face_css: string
  letterhead: DailyItineraryContext['letterhead'] & {
    email: string
    website: string
  }
  /** 代表者名 — printed with 様. */
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
  /** 「EK＝エミレーツ航空」 lines for the carriers flown. */
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

  /** 備考 lines, each printed as written (the office's ※ included). */
  remarks: string[]

  charges: Array<{ description: string; unit_price: string; quantity: string; amount: string }>
  total: string

  /** 振込先 lines (bank, branch, account, holder). */
  bank_lines: string[]
  /** The amounts due and by when: ●旅行代金申込金 then ●旅行代金残金 on a
   *  deposit invoice, one ●旅行代金 line when the trip is billed at once. */
  payments: Array<{ label: string; amount: string; due: string }>
}

const PAGE: DocumentPage = { size: 'A4', orientation: 'portrait', margin: '10mm' }

/** The office's standing remarks on every confirmation. Prefilled in the
 *  dialog, where they can be edited per booking (the visa fee changes). */
export const DEFAULT_CONFIRMATION_REMARKS = [
  '※乗継地（経由地）でのご搭乗手続きはお客様ご自身で行っていただきます。',
  '※飛行機の座席指定はお客様自身にてお願いしております。（詳細は弊社ホームページのよくある質問をご参照ください。）',
  '※エジプト入国には査証（ビザ）の取得が必要です。ビザ代30US$＋システム利用料6US$：合計36US$を現地にてカードでお支払いください。',
  '※当社の基本旅行代金には日本語ガイド・英語ドライバーなどへのチップは含まれておりません。下記、日本で事前にお支払いいただきます。',
  '　１組に付き、日本語ガイドUS$25/日・ドライバーUS$20/日になります。',
  '※ナイル川クルーズ船を含む場合はお一人様US＄5ｘ日数のチップが必要です。下記、日本で事前にお支払いいただきます。',
  '※エジプトでは日本と違いサービスに対してチップを渡す習慣が日常とされています。ベッドメーキング（枕銭）・列車車掌などへのチップはお客様ご自身でお願いいたします。',
].join('\n')

const NOTES = [
  '※現地事情・道路状況等により、旅程・見学箇所・訪問順序・食事内容が変更になる場合がございます。',
  '※お振込手数料は、お客様にてご負担して頂きます様お願い申し上げます。',
  '※海外旅行傷害保険のご加入をご希望の場合は、保険料を加算してご入金下さい。',
  '※万が一、期限までにお手続きが間に合わない場合は、必ず担当者までご連絡をお願い致します。',
]

function esc(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function letterhead(ctx: BookingConfirmationContext): string {
  const lh = ctx.letterhead
  const offices = lh.offices.slice(0, 3).map(
    o => `<div class="office">
      <div class="lbl">${esc(o.label)}</div>
      <div>${o.postal_code ? `〒${esc(o.postal_code)}<br />` : ''}${esc(o.address)}</div>
      ${o.tel || o.fax ? `<div>${o.tel ? `Tel：${esc(o.tel)}` : ''}${o.tel && o.fax ? '　' : ''}${o.fax ? `Fax：${esc(o.fax)}` : ''}</div>` : ''}
    </div>`
  )
  const contact = [lh.email, lh.website].filter(Boolean).map(esc).join('　')
  return `<div class="lh">
    <div class="left">
      ${lh.logo_url ? `<img src="${esc(lh.logo_url)}" alt="" />` : ''}
      <div class="co">${esc(lh.company_name)}</div>
      <div class="title">予約確認書兼請求書</div>
    </div>
    <div class="right">
      ${offices.join('')}
      ${lh.offices.length === 0 ? lh.lines.map(l => `<div>${esc(l)}</div>`).join('') : ''}
      ${contact ? `<div class="contact">${contact}</div>` : ''}
    </div>
  </div>`
}

function travellerGrid(names: string[]): string {
  // Three to a row, numbered, at least two rows — the sheet's own grid, which
  // the office fills by hand when names are still to come.
  const cells = [...names]
  while (cells.length < 6 || cells.length % 3) cells.push('')
  const rows: string[] = []
  for (let i = 0; i < cells.length; i += 3) {
    rows.push(
      `<tr>${cells
        .slice(i, i + 3)
        .map((n, j) => `<td class="n">${i + j + 1}</td><td class="pax">${esc(n)}</td>`)
        .join('')}</tr>`
    )
  }
  return `<table class="names">${rows.join('')}</table>`
}

export const atsBookingConfirmation: DocumentTemplate<BookingConfirmationContext> = {
  slug: 'ats-booking-confirmation',
  label: '予約確認書兼請求書 (Booking confirmation & invoice)',
  description: 'The booking confirmation that is also the invoice, in the office’s own Japanese layout.',
  page: PAGE,

  render(ctx: BookingConfirmationContext): string {
    const flights = ctx.flights.length
      ? ctx.flights
      : [{ date: '', weekday: '', from: '', to: '', flight_no: '', depart: '', arrive: '', status: '' }]
    const hotels = ctx.hotels.length
      ? ctx.hotels
      : [{ city: '', check_in: '', check_out: '', nights: '', rooms: '', room_type: '', hotel: '' }]

    return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>${esc(ctx.tour_code)} 予約確認書兼請求書</title>
<style>
  ${ctx.font_face_css}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'NotoSansJP', "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif;
    font-size: 8pt;
    line-height: 1.38;
    color: #111;
  }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 0.6pt solid #333; padding: 1.2pt 4pt; vertical-align: middle; }
  th { background: #eef2e8; font-weight: 700; text-align: center; }
  .sec { font-weight: 700; margin: 5pt 0 1.5pt; }

  .lh { display: flex; justify-content: space-between; align-items: flex-start; gap: 10pt;
        border-bottom: 1.4pt solid #333; padding-bottom: 5pt; }
  .lh .left img { max-height: 36pt; max-width: 120pt; object-fit: contain; display: block; margin-bottom: 2pt; }
  .lh .co { font-size: 11pt; font-weight: 700; }
  .lh .title { font-size: 16pt; font-weight: 700; letter-spacing: 0.12em; margin-top: 4pt; }
  .lh .right { font-size: 7.5pt; line-height: 1.45; display: flex; flex-wrap: wrap; gap: 3pt 12pt;
               justify-content: flex-end; max-width: 60%; }
  .lh .office .lbl { font-weight: 700; }
  .lh .contact { width: 100%; text-align: right; }

  .who { margin-top: 6pt; }
  .who .l { background: #f3f3f3; width: 11%; text-align: center; }
  .who .rep { font-size: 11pt; font-weight: 700; }
  .greet { margin: 4pt 0; }

  .facts td { border: none; padding: 1pt 0; }
  .facts .l { width: 15%; font-weight: 700; white-space: nowrap; }

  .names td { height: 13pt; }
  .names .n { width: 4%; text-align: center; background: #f3f3f3; }
  .names .pax { width: 29.3%; font-weight: 700; letter-spacing: 0.03em; }
  .warn { font-size: 7.5pt; color: #b00; }

  .flights td, .hotels td { text-align: center; height: 12pt; }
  .hotels th { white-space: nowrap; }
  .hotels td.h { text-align: left; }
  .legend { display: flex; justify-content: space-between; font-size: 7.5pt; margin-top: 2pt; }
  .equiv { text-align: right; font-size: 7.5pt; margin-top: 1pt; }

  .remarks div { font-size: 7.3pt; }

  .charges td.num { text-align: right; white-space: nowrap; }
  .charges .tot td { font-weight: 700; background: #eef2e8; }

  .pay { display: flex; gap: 10pt; margin-top: 7pt; }
  .pay .bank { flex: 1.2; border: 0.6pt solid #333; padding: 4pt 6pt; }
  .pay .due { flex: 1; }
  .pay .due td { height: 13pt; }
  .pay .due .l { background: #f3f3f3; width: 42%; }
  .pay .due .num { text-align: right; font-weight: 700; }
  .strict { font-size: 7.5pt; text-align: right; }
  .notes { margin-top: 6pt; }
  .notes div { font-size: 7.3pt; }
  .avoid { break-inside: avoid; }
</style>
</head>
<body>
  ${letterhead(ctx)}

  <table class="who">
    <tr>
      <td class="l">代表者名</td><td class="rep" style="width:34%">${esc(ctx.representative)}${ctx.representative ? '　様' : ''}</td>
      <td class="l">担当者</td><td style="width:16%">${esc(ctx.staff)}</td>
      <td class="l">作成日</td><td>${esc(ctx.created_date)}</td>
    </tr>
    <tr>
      <td class="l">電話番号</td><td>${esc(ctx.phone)}</td>
      <td class="l">メール</td><td colspan="3">${esc(ctx.email)}</td>
    </tr>
  </table>

  <div class="greet">
    この度は、${esc(ctx.letterhead.company_name)}にお申込み頂き、誠に有難うございます。<br />
    ご予約頂きました内容を記載致しましたので、ご確認頂き、ご入金のお手続きを何卒よろしくお願い致します。
  </div>

  <table class="facts">
    <tr><td class="l">【出発日】</td><td>${esc(ctx.departure_date)}</td></tr>
    <tr><td class="l">【ツアーコード】</td><td>${esc(ctx.tour_code)}</td></tr>
    <tr><td class="l">【ツアー名】</td><td>${esc(ctx.tour_name)}</td></tr>
  </table>

  <div class="sec">【お客様名】<span class="warn">（※パスポートに記載のローマ字と同一かをご確認下さい。一文字でも違うと飛行機に搭乗出来ませんので、ご注意下さい。）</span></div>
  ${travellerGrid(ctx.travellers)}

  <div class="avoid">
  <div class="sec">【フライトスケジュール】</div>
  <table class="flights">
    <tr><th style="width:9%">日付</th><th style="width:6%">曜日</th><th>出発地</th><th>到着地</th><th style="width:11%">便名</th><th style="width:11%">出発時間</th><th style="width:11%">到着時間</th><th style="width:10%">予約状況</th></tr>
    ${flights
      .map(
        f =>
          `<tr><td>${esc(f.date)}</td><td>${esc(f.weekday)}</td><td>${esc(f.from)}</td><td>${esc(f.to)}</td><td>${esc(f.flight_no)}</td><td>${esc(f.depart)}</td><td>${esc(f.arrive)}</td><td>${esc(f.status)}</td></tr>`
      )
      .join('')}
  </table>
  <div class="legend">
    <span>略語説明　${ctx.airline_legend.map(esc).join('　')}　　+1＝翌日着</span>
    <span>※表記時間は現地時間です。</span>
  </div>
  <div class="legend"><span>※上記スケジュールは、ご予約時点での予定であり、予告なく変更となる場合がございます。</span></div>
  </div>

  <div class="avoid">
  <div class="sec">【予定ご宿泊ホテル】</div>
  <table class="hotels">
    <tr><th style="width:13%">宿泊都市</th><th style="width:11%">チェックイン</th><th style="width:12%">チェックアウト</th><th style="width:7%">宿泊数</th><th style="width:7%">部屋数</th><th style="width:13%">お部屋タイプ</th><th>ホテル名</th></tr>
    ${hotels
      .map(
        h =>
          `<tr><td>${esc(h.city)}</td><td>${esc(h.check_in)}</td><td>${esc(h.check_out)}</td><td>${h.nights ? `${esc(h.nights)}泊` : ''}</td><td>${h.rooms ? `${esc(h.rooms)}部屋` : ''}</td><td>${esc(h.room_type)}</td><td class="h">${esc(h.hotel)}</td></tr>`
      )
      .join('')}
  </table>
  <div class="equiv">又は同等クラス</div>
  </div>

  ${
    ctx.remarks.length
      ? `<div class="avoid"><div class="sec">【備考】</div><div class="remarks">${ctx.remarks.map(r => `<div>${esc(r)}</div>`).join('')}</div></div>`
      : ''
  }

  <div class="avoid">
  <div class="sec">【ご請求額】</div>
  <table class="charges">
    <tr><th>摘要</th><th style="width:16%">単価</th><th style="width:8%">人数</th><th style="width:18%">金額</th></tr>
    ${ctx.charges
      .map(
        c =>
          `<tr><td>${esc(c.description)}</td><td class="num">${esc(c.unit_price)}</td><td class="num">${esc(c.quantity)}</td><td class="num">${esc(c.amount)}</td></tr>`
      )
      .join('')}
    <tr class="tot"><td colspan="3" style="text-align:right">合計</td><td class="num">${esc(ctx.total)}</td></tr>
  </table>

  <div class="pay">
    <div class="bank">
      <div class="sec" style="margin-top:0">■振込先■</div>
      ${ctx.bank_lines.length ? ctx.bank_lines.map(l => `<div>${esc(l)}</div>`).join('') : '<div>&nbsp;</div>'}
    </div>
    <div class="due">
      <table>
        ${ctx.payments
          .map(
            p => `<tr><td class="l">●${esc(p.label)}</td><td class="num">${esc(p.amount)}</td></tr>
        <tr><td class="l">　お支払い期限</td><td>${esc(p.due)}</td></tr>`
          )
          .join('')}
      </table>
      <div class="strict">（※期限厳守でお願い致します。）</div>
    </div>
  </div>
  </div>

  <div class="notes avoid">
    <div class="sec">【ご注意】</div>
    ${NOTES.map(n => `<div>${esc(n)}</div>`).join('')}
  </div>
</body>
</html>`
  },
}
