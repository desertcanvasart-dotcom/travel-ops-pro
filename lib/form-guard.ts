// ============================================
// Why a form refused to submit
// ============================================
// A `required` field the browser blocks is only helpful when the browser can
// SHOW its complaint. Inside a scrolling modal it often points at a control
// that is off-screen, so the save button appears dead: no message, no request,
// nothing. That is what happened on the transportation rates form, where nine
// rates could not be edited at all and nothing on screen said why.
//
// The fix is not to write per-field validation twelve times. The browser
// already knows exactly which control is invalid and why; it is only bad at
// saying so. So a form marks itself `noValidate`, calls this on submit, and
// gets back a sentence naming the field — while the control itself is scrolled
// into view and focused, which is where the operator needs to look anyway.

/** A human name for a control: its label, aria-label, placeholder, or name. */
function fieldLabel(el: Element): string | null {
  const control = el as HTMLInputElement

  const aria = control.getAttribute('aria-label')
  if (aria) return aria.trim()

  const id = control.getAttribute('id')
  if (id) {
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`)
    if (label?.textContent) return clean(label.textContent)
  }

  const wrapping = control.closest('label')
  if (wrapping?.textContent) return clean(wrapping.textContent)

  // The common shape in this app: a <label> as a sibling above the control.
  const container = control.closest('div')
  const sibling = container?.querySelector('label')
  if (sibling?.textContent) return clean(sibling.textContent)

  const placeholder = control.getAttribute('placeholder')
  if (placeholder) return clean(placeholder)

  const name = control.getAttribute('name')
  if (name) {
    // supplier_id is a column name, not a field name: nobody fills in an "Id".
    return name
      .replace(/_id$/, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
  }

  return null
}

function clean(text: string): string {
  // Labels here carry a red asterisk and stray whitespace from the markup.
  return text.replace(/\*/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * The form behind whatever raised the event.
 *
 * Several modals in this app put their save button OUTSIDE the <form> and wire
 * it with onClick, so the handler receives a button, not a form — and those
 * forms were never natively validated at all. Resolve in order: the form
 * itself, the button's form association, an enclosing form, then the single
 * form on the page if there is exactly one.
 */
function resolveForm(source: unknown): HTMLFormElement | null {
  if (source instanceof HTMLFormElement) return source
  if (source instanceof HTMLElement) {
    const owned = (source as HTMLButtonElement).form
    if (owned) return owned
    const enclosing = source.closest('form')
    if (enclosing) return enclosing
  }
  if (typeof document !== 'undefined') {
    const forms = document.querySelectorAll('form')
    if (forms.length === 1) return forms[0] as HTMLFormElement
  }
  return null
}

/**
 * Check a form the browser's way, report it in a way a person can act on.
 *
 * Returns null when the form is valid — or when there is no form to check,
 * because a guard that cannot find its form must not block a save.
 * Otherwise scrolls the first invalid control into view, focuses it, and
 * returns a sentence for the page's own error banner or toast.
 */
export function firstInvalidMessage(source: unknown): string | null {
  const form = resolveForm(source)
  if (!form) return null
  if (form.checkValidity()) return null

  const invalid = form.querySelector(':invalid')
  if (!invalid) return 'Please complete the required fields before saving'

  if (invalid instanceof HTMLElement) {
    invalid.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Focus after the scroll starts; focusing first fights the smooth scroll.
    setTimeout(() => invalid.focus({ preventScroll: true }), 150)
  }

  const label = fieldLabel(invalid)
  const reason = (invalid as HTMLInputElement).validationMessage

  if (label && reason) return `${label}: ${reason}`
  if (label) return `${label} is required`
  return reason || 'Please complete the required fields before saving'
}
