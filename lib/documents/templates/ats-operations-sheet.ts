// ============================================
// A.T.S — CAIRO OPERATIONS SHEET ("ENG. ITIN.")
// ============================================
// A faithful reproduction of the worksheet A.T.S's Japanese offices currently
// type by hand and email to the Cairo ground company, one per departure.
//
// Fidelity is the point. The Cairo team reads this document every day and knows
// where each fact sits on the page; a "cleaner" layout would be a worse
// document, because it would have to be re-learned. So the arrangement below
// follows the spreadsheet: the header block, the three-column day table with
// meals and the overnight code stacked in the right-hand column, and the hotel
// block underneath.
//
// Two deliberate carry-overs from the original:
//
//   * Fields the office fills by hand on the day — confirmed date, guide
//     mobiles, file number — render as ruled BLANKS rather than being omitted
//     or invented. Their own template is blank there too, and a sheet that
//     quietly drops a field the ground team expects is worse than one with a
//     gap to write in.
//   * Meals are ○ / X, not "yes"/"no". That is the notation the Cairo team
//     reads, and ○ carries at a glance in a way a word does not.
//
// Pure: context in, HTML out. Verified against a fixture built from the real
// NEK803-ABCR sheet in __tests__/lib/ats-operations-sheet.test.ts.

import type { DocumentTemplate, OperationsSheetContext } from '../types'

function esc(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** A value, or a ruled blank the office writes into. */
function fill(value: unknown): string {
  const text = esc(value)
  return text ? `<span class="v">${text}</span>` : '<span class="blank"></span>'
}

function mealMark(included: boolean): string {
  return included ? '○' : 'X'
}

function dayRows(context: OperationsSheetContext): string {
  return context.days
    .map(day => {
      // The right-hand column stacks four things against the day's block:
      // breakfast, lunch, dinner, then where the party sleeps.
      const sideRows = [
        ['B', mealMark(day.meals.breakfast)],
        ['L', mealMark(day.meals.lunch)],
        ['D', mealMark(day.meals.dinner)],
        [day.accommodation_code ? esc(day.accommodation_code) : '', ''],
      ]

      const lines = day.lines.length ? day.lines : ['']
      const rowCount = Math.max(lines.length, sideRows.length)

      const rows: string[] = []
      for (let i = 0; i < rowCount; i++) {
        const side = sideRows[i]
        rows.push(`
          <tr>
            ${
              i === 0
                ? `<td class="day-label" rowspan="${rowCount}">${esc(day.label)}${
                    day.date ? `<span class="day-date">${esc(day.date)}</span>` : ''
                  }</td>`
                : ''
            }
            <td class="day-line">${esc(lines[i] ?? '')}</td>
            <td class="meal-key">${side ? side[0] : ''}</td>
            <td class="meal-mark">${side ? side[1] : ''}</td>
          </tr>`)
      }
      return `<tbody class="day">${rows.join('')}</tbody>`
    })
    .join('')
}

function hotelRows(context: OperationsSheetContext): string {
  if (!context.hotels.length) {
    return '<tr><td colspan="7" class="empty">No accommodation recorded</td></tr>'
  }
  return context.hotels
    .map(
      h => `
      <tr>
        <td class="code">${fill(h.city)}</td>
        <td>${fill(h.hotel)}</td>
        <td class="c">${fill(h.check_in)}</td>
        <td class="c">${fill(h.check_out)}</td>
        <td class="c">${fill(h.nights)}</td>
        <td class="c">${fill(h.room)}</td>
        <td>${fill(h.remarks)}</td>
      </tr>`
    )
    .join('')
}

function guideRows(context: OperationsSheetContext): string {
  const guides = context.guides.length
    ? context.guides
    : [
        { role: 'CAI. GUIDE', name: null, mobile: null },
        { role: 'UPP. GUIDE', name: null, mobile: null },
      ]
  return guides
    .map(
      g => `
      <tr>
        <th>${esc(g.role)}</th>
        <td>${fill(g.name)}</td>
        <th class="narrow">MOBILE</th>
        <td>${fill(g.mobile)}</td>
      </tr>`
    )
    .join('')
}

export const atsOperationsSheet: DocumentTemplate<OperationsSheetContext> = {
  slug: 'ats-operations-sheet',
  label: 'Cairo operations sheet (ENG. ITIN.)',
  description:
    'The English worksheet the selling office sends to the Cairo ground company: party size, flights, guides, day-by-day programme with meals, and the hotel block.',
  page: { size: 'A4', orientation: 'portrait', margin: '10mm' },

  render(context: OperationsSheetContext): string {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(context.tour_code || 'Operations sheet')}</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Helvetica Neue", Arial, "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif;
    /* Sized so a standard 8-day programme lands on ONE sheet, as theirs does.
       This is a document the ground team works from in the field; a second page
       is a page that gets left behind. */
    font-size: 7.8pt;
    line-height: 1.22;
    color: #000;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 0.5pt solid #000; padding: 1.5pt 3.5pt; vertical-align: top; }
  th {
    background: #ECECEC;
    font-weight: 700;
    text-align: left;
    font-size: 7pt;
    letter-spacing: 0.03em;
    white-space: nowrap;
  }
  .v { font-weight: 600; }
  /* Fields the office completes by hand keep their space on the page. */
  .blank { display: block; min-height: 9pt; }
  .c { text-align: center; }
  .code { font-weight: 700; letter-spacing: 0.04em; }
  .narrow { width: 52pt; }
  .empty { text-align: center; color: #555; font-style: italic; }

  h1 {
    font-size: 11pt;
    letter-spacing: 0.09em;
    margin: 0 0 3pt;
    text-align: center;
    text-transform: uppercase;
  }
  .sheet-sub {
    text-align: center;
    font-size: 7.4pt;
    letter-spacing: 0.05em;
    margin: 0 0 6pt;
    color: #333;
  }

  .head { margin-bottom: 6pt; }
  .head th { width: 78pt; }
  .head-split { display: flex; gap: 6pt; margin-bottom: 6pt; }
  .head-split > * { flex: 1; }

  /* --- day table --- */
  .days { margin-bottom: 8pt; }
  .days thead th { text-align: center; }
  /* A day is one instruction set. Split across a page break, its meal column
     orphans onto the next page and the ground team reads half a day. */
  .days tbody.day { break-inside: avoid; page-break-inside: avoid; }
  .days .day-label {
    width: 40pt;
    font-weight: 700;
    text-align: center;
    border-top: 1pt solid #000;
  }
  .day-date { display: block; font-weight: 400; font-size: 7pt; margin-top: 2pt; }
  .days .day-line { border-top: none; border-bottom: none; }
  .days tbody.day tr:first-child .day-line { border-top: 1pt solid #000; }
  .days .meal-key {
    width: 20pt;
    text-align: center;
    font-weight: 700;
    border-top: none;
    border-bottom: none;
  }
  .days .meal-mark {
    width: 26pt;
    text-align: center;
    border-top: none;
    border-bottom: none;
  }
  .days tbody.day tr:first-child .meal-key,
  .days tbody.day tr:first-child .meal-mark { border-top: 1pt solid #000; }
  .days tbody.day:last-child tr:last-child td { border-bottom: 1pt solid #000; }

  .block-title {
    font-size: 8.6pt;
    font-weight: 700;
    letter-spacing: 0.08em;
    margin: 0 0 3pt;
  }
  .hotels th { text-align: center; }
  .hotels td:first-child, .hotels th:first-child { width: 44pt; }

  .foot {
    margin-top: 8pt;
    font-size: 7pt;
    color: #444;
    display: flex;
    justify-content: space-between;
  }
</style>
</head>
<body>

  <h1>Itinerary &amp; Operations Sheet</h1>
  <p class="sheet-sub">${fill(context.operator)}</p>

  <div class="head-split">
    <table class="head">
      <tr><th>ITINERARY</th><td>${fill(context.tour_code)}</td></tr>
      <tr><th>FILE NO.</th><td>${fill(context.file_no)}</td></tr>
      <tr><th>GROUP REF.</th><td>${fill(context.group_ref)}</td></tr>
      <tr><th>NO. OF PAX</th><td>${fill(context.pax_count)}</td></tr>
      <tr><th>ROOMS</th><td>${fill(context.room_count)}</td></tr>
    </table>

    <table class="head">
      <tr><th>CFMD DATE</th><td>${fill(context.confirmed_date)}</td></tr>
      <tr><th>FINAL DATE</th><td>${fill(context.final_date)}</td></tr>
      <tr><th>DATE OF ARRIVAL</th><td>${fill(context.arrival_date)}</td></tr>
      <tr><th>DATE OF DEPARTURE</th><td>${fill(context.departure_date)}</td></tr>
      <tr><th>NO. OF NTS</th><td>${fill(context.nights)}</td></tr>
    </table>
  </div>

  <table class="head">
    ${guideRows(context)}
    <tr>
      <th>FLIGHT IN</th><td>${fill(context.arrival_flight)}</td>
      <th class="narrow">FLIGHT OUT</th><td>${fill(context.departure_flight)}</td>
    </tr>
    <tr>
      <th>REMARKS</th><td colspan="3">${fill(context.remarks)}</td>
    </tr>
  </table>

  <table class="days">
    <thead>
      <tr>
        <th style="width:40pt">Date</th>
        <th>Itinerary</th>
        <th colspan="2" style="width:46pt">Meals / Accom.</th>
      </tr>
    </thead>
    ${dayRows(context)}
  </table>

  <p class="block-title">HOTELS</p>
  <table class="hotels">
    <thead>
      <tr>
        <th>CITY</th><th>HOTEL</th><th>IN</th><th>OUT</th>
        <th>NGTS</th><th>ROOM</th><th>REMARKS</th>
      </tr>
    </thead>
    <tbody>${hotelRows(context)}</tbody>
  </table>

  <div class="foot">
    <span>${esc(context.tour_code || '')}</span>
    <span>Times shown as 【00:00】 are to be confirmed by the office.</span>
  </div>

</body>
</html>`
  },
}
