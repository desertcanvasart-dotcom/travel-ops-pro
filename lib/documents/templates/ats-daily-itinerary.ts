// ============================================
// A.T.S 日程表 — the customer-facing daily itinerary
// ============================================
// The digital edition of the Word documents the Tokyo office has always sent:
// a header block with the office contacts, the programme code top-right, then
// one table — day number, a blank date slot filled per departure, the
// overnight place (宿泊地), and the day's schedule with the meal marks on the
// last line (朝：〇 昼：dish 夜：機内). A disclaimer and the 利用ホテル table
// close the document.
//
// Faithful means faithful to their layout, not to their file quirks: the
// source wrote 〇 and ○ interchangeably and misspelled スケジュール in the
// footer once; this template settles on one spelling of each.
//
// Pure: context in, HTML out. The Japanese font arrives IN the context
// (@font-face CSS from lib/pdf-fonts-server.ts) because templates must not
// read the filesystem.

import type { DocumentPage, DocumentTemplate } from '../types'

export interface DailyItineraryDay {
  day: number
  /** Filled per departure: month/day and Japanese weekday. Null = blank slot. */
  date: { md: string; wd: string } | null
  /** 宿泊地 — カイロ, 船中泊, 機中泊 … Empty string on the final day. */
  overnight_label: string
  /** Schedule text, one line per line the office wrote. */
  schedule_lines: string[]
  /** ◎ sightseeing bullets, shown after the schedule text. */
  attractions: string[]
  /** Display value per slot: 〇, ×, 機内, or a dish name. */
  meals: { breakfast: string; lunch: string; dinner: string }
}

export interface DailyItineraryContext {
  program_code: string
  /** 「山田様」— the traveller this copy is for, printed opposite the programme
   *  code. Empty string on the bare programme document, which is how the
   *  office's own masters read. */
  customer_name: string
  /** 作成日 as the office writes it, e.g. "17 August 2026". */
  created_date: string
  days: DailyItineraryDay[]
  /** 利用ホテル rows — the programme's standard hotels, blanks staying blank.
   *  An empty list still draws one empty row to keep the table fillable. */
  hotel_rows: Array<{
    hotel: string
    check_in: string
    check_out: string
    phone: string
    address: string
  }>
  /** @font-face CSS for NotoSansJP; empty string is valid (tests, preview). */
  font_face_css: string
  /** Company letterhead — everything optional; absent facts render nothing. */
  letterhead: {
    logo_url: string | null
    company_name: string
    /** Address / phone / email / website, one per line, blanks filtered.
     *  Used only when no offices are defined. */
    lines: string[]
    /** The letterhead's real shape: first two offices print side by side
     *  (label 〒postal / address / TEL・FAX), the rest as full-width lines. */
    offices: Array<{
      label: string
      postal_code: string
      address: string
      tel: string
      fax: string
    }>
  }
  /** 作成者 — who generated this departure's document. Blank on the template. */
  author: string
  /** Values for the header contact slots; blank prints blank. */
  office_contacts: {
    cairo_guide: string
    south_guide: string
    emergency_japan: string
    cairo_office: string
  }
}

const PAGE: DocumentPage = { size: 'A4', orientation: 'portrait', margin: '12mm' }

function esc(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function dayRow(day: DailyItineraryDay): string {
  const schedule = day.schedule_lines.map(l => `<div>${esc(l)}</div>`).join('')
  const attractions = day.attractions.map(a => `<div>◎${esc(a)}</div>`).join('')
  return `<tr class="day">
    <td class="num">${day.day}</td>
    <td class="date">${day.date ? `${esc(day.date.md)}<br />(${esc(day.date.wd)})` : '/<br />(&#12288;)'}</td>
    <td class="stay">${esc(day.overnight_label)}</td>
    <td class="sched">
      ${schedule}
      ${attractions ? `<div class="sights">${attractions}</div>` : ''}
      <div class="meals">
        <span>朝：${esc(day.meals.breakfast)}</span>
        <span>昼：${esc(day.meals.lunch)}</span>
        <span>夜：${esc(day.meals.dinner)}</span>
      </div>
    </td>
  </tr>`
}

function renderLetterhead(lh: DailyItineraryContext['letterhead']): string {
  if (!lh.company_name && !lh.logo_url && lh.offices.length === 0) return ''

  // With offices defined, the letterhead takes the office's own shape: logo
  // left, the first two offices as columns, further offices as full-width
  // lines, then the double-dash rule their documents draw under the header.
  if (lh.offices.length) {
    const columns = lh.offices.slice(0, 2)
    const wide = lh.offices.slice(2)
    const col = (o: (typeof columns)[number]) => `<div class="office">
      <div class="hd1">${esc(o.label)}${o.postal_code ? `　〒${esc(o.postal_code)}` : ''}</div>
      ${o.address ? `<div>${esc(o.address)}</div>` : ''}
      ${o.tel || o.fax ? `<div class="tf">${o.tel ? `TEL:${esc(o.tel)}` : ''}${o.tel && o.fax ? '　' : ''}${o.fax ? `FAX:${esc(o.fax)}` : ''}</div>` : ''}
    </div>`
    const wideLine = (o: (typeof wide)[number]) =>
      `<div class="officewide">${esc(o.label)}　${esc(o.address)}${o.tel ? `　Tel: ${esc(o.tel)}` : ''}${o.fax ? `　Fax: ${esc(o.fax)}` : ''}</div>`
    return `<div class="letterhead">
    ${lh.logo_url ? `<img src="${esc(lh.logo_url)}" alt="" />` : `<div class="co"><div class="nm">${esc(lh.company_name)}</div></div>`}
    <div class="offices">${columns.map(col).join('')}</div>
  </div>
  ${wide.map(wideLine).join('')}
  <div class="lhdivider"></div>`
  }

  return `<div class="letterhead">
    ${lh.logo_url ? `<img src="${esc(lh.logo_url)}" alt="" />` : ''}
    <div class="co">
      <div class="nm">${esc(lh.company_name)}</div>
      ${lh.lines.map(l => `<div class="ln">${esc(l)}</div>`).join('')}
    </div>
  </div>`
}

export const atsDailyItinerary: DocumentTemplate<DailyItineraryContext> = {
  slug: 'ats-daily-itinerary',
  label: '日程表 (Daily Itinerary)',
  description: 'The customer-facing Japanese daily itinerary, in the office’s own document layout.',
  page: PAGE,

  render(ctx: DailyItineraryContext): string {
    const rows = ctx.hotel_rows.length
      ? ctx.hotel_rows
      : [{ hotel: '', check_in: '', check_out: '', phone: '', address: '' }]
    const hotelRows = rows
      .map(
        h =>
          `<tr><td>${esc(h.hotel) || '&nbsp;'}</td><td>${esc(h.check_in)}</td><td>${esc(h.check_out)}</td><td>${esc(h.phone)}</td><td>${esc(h.address)}</td></tr>`
      )
      .join('')

    return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>${esc(ctx.program_code)} 日程表</title>
<style>
  ${ctx.font_face_css}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'NotoSansJP', "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif;
    font-size: 9pt;
    line-height: 1.55;
    color: #111;
  }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 0.6pt solid #333; padding: 3pt 5pt; vertical-align: top; }
  /* The outer frame. With border-collapse alone, a table split across pages
     loses its right edge and the rules at the page cut; the table's own
     border keeps the sides continuous on every page fragment, the repeating
     thead re-draws the top on each page, and the tfoot rule closes the
     bottom of every fragment. */
  .itin { border: 1pt solid #333; }
  .itin thead { display: table-header-group; }
  .itin tfoot td { border: none; border-top: 0.6pt solid #333; padding: 0; height: 0; }

  .letterhead {
    display: flex;
    align-items: flex-start;
    gap: 12pt;
    border: none;
    margin-bottom: 4pt;
  }
  .letterhead img { max-height: 44pt; max-width: 130pt; object-fit: contain; }
  .letterhead .co { flex: 1; }
  .letterhead .co .nm { font-size: 12pt; font-weight: 700; }
  .letterhead .co .ln { font-size: 7.5pt; color: #333; }
  .offices { flex: 1; display: flex; flex-wrap: wrap; gap: 2pt 18pt; justify-content: flex-end; }
  .offices .office { font-size: 8.5pt; line-height: 1.5; }
  .offices .office .hd1 { font-size: 10pt; }
  .offices .office .tf { font-size: 8pt; color: #222; }
  .officewide { font-size: 8.5pt; margin: 2pt 0; }
  .lhdivider { border-top: 1.6pt dashed #222; margin: 4pt 0 8pt; }

  .office td { font-size: 8pt; }
  .office .l { width: 22%; background: #f3f3f3; }
  .office .v { width: 28%; }

  /* The traveller's name sits opposite the programme code. With no name the
     span is empty and the code stays hard right, exactly as the bare
     programme document has always printed it. */
  .codeline { display: flex; justify-content: space-between; align-items: baseline;
              font-size: 11pt; font-weight: 700; margin: 8pt 0 3pt; letter-spacing: 0.05em; }
  .codeline .cust { letter-spacing: 0.02em; }

  .itin th { background: #f3f3f3; font-weight: 700; text-align: center; }
  .itin .num { width: 5%; text-align: center; font-weight: 700; }
  .itin .date { width: 8%; text-align: center; color: #333; }
  .itin .stay { width: 12%; text-align: center; }
  .itin .sched { width: 75%; }
  .itin tr.day { break-inside: avoid; }
  .sights { margin-top: 4pt; }
  .meals {
    margin-top: 6pt;
    padding-top: 3pt;
    border-top: 0.4pt dotted #999;
    display: flex;
  }
  .meals span { flex: 1; }
  .disclaimer { margin: 6pt 0 12pt; font-size: 8pt; }
  .hotels-title { font-weight: 700; margin-bottom: 3pt; }
  .hotels td { height: 14pt; font-size: 8pt; }
  .hotels .h { background: #f3f3f3; font-weight: 700; text-align: center; }
</style>
</head>
<body>
  ${renderLetterhead(ctx.letterhead)}
  <table class="office">
    <tr><td class="l">カイロガイド</td><td class="v">${esc(ctx.office_contacts.cairo_guide)}</td><td class="l">作成日</td><td class="v">${esc(ctx.created_date)}</td></tr>
    <tr><td class="l">南部ガイド</td><td class="v">${esc(ctx.office_contacts.south_guide)}</td><td class="l">作成者</td><td class="v">${esc(ctx.author)}</td></tr>
    <tr><td class="l">緊急連絡先（日本）</td><td class="v">${esc(ctx.office_contacts.emergency_japan)}</td><td class="l">カイロ</td><td class="v">${esc(ctx.office_contacts.cairo_office)}</td></tr>
  </table>

  <div class="codeline">
    <span class="cust">${esc(ctx.customer_name)}</span>
    <span>${esc(ctx.program_code)}</span>
  </div>

  <table class="itin">
    <thead>
      <tr><th style="width:5%"></th><th style="width:8%">日</th><th style="width:12%">宿泊地</th><th style="width:75%">日程</th></tr>
    </thead>
    <tfoot><tr><td colspan="4"></td></tr></tfoot>
    <tbody>
    ${ctx.days.map(dayRow).join('\n')}
    </tbody>
  </table>

  <p class="disclaimer">※現地事情により観光スケジュール変更がある場合がございます。予めご了承ください。</p>

  <div class="hotels-title">利用ホテル</div>
  <table class="hotels">
    <tr><td class="h" style="width:30%">ホテル</td><td class="h" style="width:12%">イン</td><td class="h" style="width:12%">アウト</td><td class="h" style="width:18%">電話</td><td class="h" style="width:28%">住所</td></tr>
    ${hotelRows}
  </table>
</body>
</html>`
  },
}
