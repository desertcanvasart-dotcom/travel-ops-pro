// One CSV cell, safe to open in a spreadsheet.
//
// Two things go wrong when a value is just wrapped in quotes: a quote inside it
// ends the cell early (the rest spills into the next columns), and a value that
// starts with = + - @ (or a tab / carriage return) is run as a FORMULA by Excel
// and Google Sheets — a client named =HYPERLINK(...) is code, not a name. The
// formula trigger gets a leading single quote so it is shown literally; the
// quotes inside are doubled; the whole is wrapped.
export function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}
