// ============================================
// Print an email (or its whole conversation)
// ============================================
// A clean page — subject, who, when, the message — in a new window, then the
// browser's print dialog, as Gmail's Print does. The bodies are customer HTML:
// sanitised by the caller, and scripts in the print window are never run.

export interface PrintableMessage {
  from: string
  to: string
  cc?: string
  date: string
  /** Already sanitised HTML. */
  bodyHtml: string
}

const esc = (s: string) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function printDocumentHtml(subject: string, messages: PrintableMessage[]): string {
  const parts = messages.map(m => `
    <section class="msg">
      <div class="meta">
        <div><b>From:</b> ${esc(m.from)}</div>
        <div><b>To:</b> ${esc(m.to)}</div>
        ${m.cc ? `<div><b>Cc:</b> ${esc(m.cc)}</div>` : ''}
        <div><b>Date:</b> ${esc(m.date)}</div>
      </div>
      <div class="body">${m.bodyHtml}</div>
    </section>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src * data:; style-src 'unsafe-inline'">
<title>${esc(subject)}</title>
<style>
  body { font: 13px/1.5 -apple-system, "Segoe UI", "Hiragino Sans", "Yu Gothic", sans-serif; color: #111; margin: 24px; }
  h1 { font-size: 18px; margin: 0 0 16px; }
  .msg { border-top: 1px solid #ccc; padding: 12px 0; page-break-inside: avoid; }
  .meta { color: #444; margin-bottom: 10px; }
  .body img { max-width: 100%; }
  @media print { body { margin: 0; } }
</style></head><body>
<h1>${esc(subject || '(No subject)')}</h1>
${parts}
</body></html>`
}

/** Open the print window. False when the browser blocked the pop-up. */
export function printEmail(subject: string, messages: PrintableMessage[]): boolean {
  const w = window.open('', '_blank', 'width=800,height=900')
  if (!w) return false
  w.document.open()
  w.document.write(printDocumentHtml(subject, messages))
  w.document.close()
  w.focus()
  // Let images load before the dialog.
  setTimeout(() => { w.print() }, 300)
  return true
}
