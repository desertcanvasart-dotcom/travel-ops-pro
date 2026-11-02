// ============================================
// A.T.S 参加申込書 — one page per traveller, passport copy attached
// ============================================
// The paper application form the office used to post out, printed from what
// the traveller already typed into the portal's 海外旅行参加申込書 (and the
// passport page they uploaded). Same boxes in the same order as the office's
// Excel sheet, so a printed copy files beside the old ones unchanged.
//
// Pure: context in, HTML out. The passport image arrives as a data URI.

import type { DocumentPage, DocumentTemplate } from '../types'
import type { DailyItineraryContext } from './ats-daily-itinerary'

export interface ApplicationFormTraveller {
  family_kana: string
  given_kana: string
  family_kanji: string
  given_kanji: string
  /** Romaji as on the passport: FAMILY GIVEN. */
  romaji: string
  /** 男 / 女 / '' */
  gender: string
  /** 「1980年4月1日」 */
  birth_date: string
  postal_code: string
  address: string
  address_kana: string
  home_phone: string
  mobile: string
  email: string
  /** 所属 — the group or workplace, for group bookings. */
  affiliation: string
  emergency_name: string
  emergency_relationship: string
  emergency_phone: string
  passport_number: string
  passport_expiry: string
  /** The passport photo page as a data URI, or null. */
  passport_image: string | null
  /** Why no image prints when one was uploaded (a PDF, an iPhone HEIC). */
  passport_note: string
}

export interface ApplicationFormContext {
  font_face_css: string
  letterhead: DailyItineraryContext['letterhead'] & { email: string; website: string }
  staff: string
  departure_date: string
  tour_code: string
  days: string
  tour_name: string
  travellers: ApplicationFormTraveller[]
}

const PAGE: DocumentPage = { size: 'A4', orientation: 'portrait', margin: '10mm' }

function esc(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function footer(ctx: ApplicationFormContext): string {
  const lh = ctx.letterhead
  return `<div class="foot">
    <div class="co">
      <div class="nm">${esc(lh.company_name)}</div>
      ${lh.email ? `<div>${esc(lh.email)}</div>` : ''}
      ${lh.website ? `<div>${esc(lh.website)}</div>` : ''}
    </div>
    ${lh.offices
      .map(
        o => `<div class="office"><b>${esc(o.label)}</b><br />${o.postal_code ? `〒${esc(o.postal_code)}<br />` : ''}${esc(o.address)}${o.tel ? `<br />TEL ${esc(o.tel)}` : ''}${o.fax ? `　FAX ${esc(o.fax)}` : ''}</div>`
      )
      .join('')}
  </div>`
}

function travellerPage(ctx: ApplicationFormContext, p: ApplicationFormTraveller): string {
  return `<section class="pg">
  <div class="top">
    <h1>参加申込書</h1>
    <div class="lead">この申込書は皆様の渡航資料と致しますので、正確にご記入ください。</div>
  </div>
  <table class="staff"><tr><td class="l">担当者</td><td>${esc(ctx.staff)}</td></tr></table>

  <table class="f">
    <tr><td class="l">ご出発日</td><td>${esc(ctx.departure_date)}</td><td class="l">ツアーコード</td><td>${esc(ctx.tour_code)}</td><td class="l">期間</td><td>${esc(ctx.days)}${ctx.days ? '日間' : ''}</td></tr>
    <tr><td class="l">ツアー名</td><td colspan="5">${esc(ctx.tour_name)}</td></tr>
  </table>

  <table class="f">
    <tr><td class="l">フリガナ</td><td>(姓) ${esc(p.family_kana)}</td><td>(名) ${esc(p.given_kana)}</td><td class="l">性別</td><td class="c">${esc(p.gender) || '男　・　女'}</td></tr>
    <tr><td class="l">氏名</td><td class="big">(姓) ${esc(p.family_kanji)}</td><td class="big">(名) ${esc(p.given_kanji)}</td><td class="l">ローマ字</td><td class="romaji">${esc(p.romaji)}</td></tr>
    <tr><td class="l">生年月日</td><td colspan="4">（西暦）${esc(p.birth_date)}</td></tr>
    <tr><td class="l">フリガナ</td><td colspan="4">${esc(p.address_kana)}</td></tr>
    <tr><td class="l" rowspan="2">現住所</td><td colspan="4">〒${esc(p.postal_code)}　${esc(p.address)}</td></tr>
    <tr><td colspan="4">電話　${esc(p.home_phone)}　　　携帯　${esc(p.mobile)}</td></tr>
    <tr><td class="l">メールアドレス</td><td colspan="4">${esc(p.email)}</td></tr>
    <tr><td class="l">所属</td><td colspan="4">${esc(p.affiliation)}<span class="hint">（団体のお客様のみ）</span></td></tr>
    <tr><td class="l" rowspan="2">渡航中の<br />国内緊急連絡先</td><td colspan="2">氏名　${esc(p.emergency_name)}</td><td class="l">続柄</td><td>${esc(p.emergency_relationship)}</td></tr>
    <tr><td colspan="4">携帯電話　${esc(p.emergency_phone)}</td></tr>
    <tr><td class="l">旅券番号</td><td colspan="2">${esc(p.passport_number)}</td><td class="l">有効期限</td><td>${esc(p.passport_expiry)}</td></tr>
  </table>

  <div class="sec">■ パスポートのコピー（顔写真のページ）</div>
  <div class="passport">
    ${
      p.passport_image
        ? `<img src="${esc(p.passport_image)}" alt="" />`
        : `<div class="empty">${esc(p.passport_note) || 'パスポートの顔写真のページをこちらに貼り付けてください'}</div>`
    }
  </div>
  <div class="notes">
    <div>エジプト入国時には、パスポートの有効残存期間が6か月以上必要です。</div>
    <div>本書面およびパスポートのコピーは、旅行終了後すみやかに裁断・廃棄いたします。</div>
  </div>
  ${footer(ctx)}
</section>`
}

export const atsApplicationForm: DocumentTemplate<ApplicationFormContext> = {
  slug: 'ats-application-form',
  label: '参加申込書 (Application form)',
  description: 'Each traveller’s application form with the passport photo page, printed from the portal.',
  page: PAGE,

  render(ctx: ApplicationFormContext): string {
    const travellers = ctx.travellers.length
      ? ctx.travellers
      : [
          {
            family_kana: '', given_kana: '', family_kanji: '', given_kanji: '', romaji: '', gender: '', birth_date: '',
            postal_code: '', address: '', address_kana: '', home_phone: '', mobile: '', email: '', affiliation: '',
            emergency_name: '', emergency_relationship: '', emergency_phone: '', passport_number: '', passport_expiry: '',
            passport_image: null, passport_note: '',
          },
        ]
    return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>${esc(ctx.tour_code)} 参加申込書</title>
<style>
  ${ctx.font_face_css}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'NotoSansJP', "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif; font-size: 9pt; line-height: 1.45; color: #111; }
  .pg { break-after: page; display: flex; flex-direction: column; min-height: 274mm; }
  .pg:last-child { break-after: auto; }
  table { border-collapse: collapse; width: 100%; }
  td { border: 0.6pt solid #333; padding: 3pt 5pt; vertical-align: middle; height: 17pt; }
  .l { background: #f1f1f1; width: 14%; text-align: center; font-weight: 700; white-space: nowrap; }
  .c { text-align: center; }
  .big { font-size: 11pt; font-weight: 700; }
  .romaji { font-weight: 700; letter-spacing: 0.04em; }
  .hint { font-size: 7.5pt; color: #555; margin-left: 6pt; }
  .top { display: flex; align-items: baseline; gap: 14pt; margin-bottom: 4pt; }
  .top h1 { font-size: 20pt; letter-spacing: 0.25em; }
  .top .lead { font-size: 8.5pt; }
  .staff { width: 35%; margin-left: auto; margin-bottom: 6pt; }
  .staff .l { width: 40%; }
  .f { margin-bottom: 6pt; }
  .sec { font-weight: 700; margin: 6pt 0 3pt; }
  .passport { flex: 1; min-height: 80mm; border: 0.8pt dashed #555; display: flex; align-items: center; justify-content: center; padding: 6pt; }
  .passport img { max-width: 100%; max-height: 95mm; object-fit: contain; }
  .passport .empty { color: #666; font-size: 9pt; text-align: center; }
  .notes { margin: 5pt 0; font-size: 8.5pt; }
  .foot { display: flex; gap: 14pt; border-top: 1pt solid #333; padding-top: 5pt; font-size: 7.5pt; line-height: 1.4; }
  .foot .co .nm { font-size: 10pt; font-weight: 700; }
</style>
</head>
<body>
${travellers.map(p => travellerPage(ctx, p)).join('\n')}
</body>
</html>`
  },
}
