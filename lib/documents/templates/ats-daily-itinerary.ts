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
    /** Address / phone / email / website, one per line, blanks filtered. */
    lines: string[]
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

  .letterhead {
    display: flex;
    align-items: center;
    gap: 10pt;
    border: none;
    margin-bottom: 6pt;
  }
  .letterhead img { max-height: 34pt; max-width: 120pt; object-fit: contain; }
  .letterhead .co { flex: 1; }
  .letterhead .co .nm { font-size: 12pt; font-weight: 700; }
  .letterhead .co .ln { font-size: 7.5pt; color: #333; }

  .office td { font-size: 8pt; }
  .office .l { width: 22%; background: #f3f3f3; }
  .office .v { width: 28%; }

  .codeline { text-align: right; font-size: 11pt; font-weight: 700; margin: 8pt 0 3pt; letter-spacing: 0.05em; }

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
  ${
    ctx.letterhead.company_name || ctx.letterhead.logo_url
      ? `<div class="letterhead">
    ${ctx.letterhead.logo_url ? `<img src="${esc(ctx.letterhead.logo_url)}" alt="" />` : ''}
    <div class="co">
      <div class="nm">${esc(ctx.letterhead.company_name)}</div>
      ${ctx.letterhead.lines.map(l => `<div class="ln">${esc(l)}</div>`).join('')}
    </div>
  </div>`
      : ''
  }
  <table class="office">
    <tr><td class="l">カイロガイド</td><td class="v">${esc(ctx.office_contacts.cairo_guide)}</td><td class="l">作成日</td><td class="v">${esc(ctx.created_date)}</td></tr>
    <tr><td class="l">南部ガイド</td><td class="v">${esc(ctx.office_contacts.south_guide)}</td><td class="l">作成者</td><td class="v">${esc(ctx.author)}</td></tr>
    <tr><td class="l">緊急連絡先（日本）</td><td class="v">${esc(ctx.office_contacts.emergency_japan)}</td><td class="l">カイロ</td><td class="v">${esc(ctx.office_contacts.cairo_office)}</td></tr>
  </table>

  <div class="codeline">${esc(ctx.program_code)}</div>

  <table class="itin">
    <tr><th style="width:5%"></th><th style="width:8%">日</th><th style="width:12%">宿泊地</th><th style="width:75%">日程</th></tr>
    ${ctx.days.map(dayRow).join('\n')}
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
