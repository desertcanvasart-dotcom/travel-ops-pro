'use client'

// ============================================
// Building blocks for a rate form
// ============================================
// The rate forms each drew their own modal: numbered circles in four colours,
// labels of two sizes, help paragraphs that set one column three times taller
// than its neighbours. These pieces give a form one look — a titled section,
// a labelled field with a one-line hint, a hint that opens for the long
// explanation, an on/off switch and a summary line — so the next form to be
// redone reads like this one. The guide rate form is the first user.

import { useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

export const inputClass =
  'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 ' +
  'focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-transparent disabled:bg-gray-50'

/** A titled group of fields. */
export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-[#4a5c35]">
        {title}
        <span className="h-px flex-1 bg-gray-200" aria-hidden="true" />
      </h3>
      {children}
    </section>
  )
}

/** A label, the control, and an optional one-line hint under it. */
export function Field({
  label, required, hint, htmlFor, children, className = '',
}: {
  label: string
  required?: boolean
  hint?: ReactNode
  htmlFor: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-gray-700">
        {label}{required && <span className="text-red-600"> *</span>}
      </label>
      {children}
      {hint && <div className="text-xs leading-snug text-gray-500">{hint}</div>}
    </div>
  )
}

/** A short hint whose long explanation opens on request. */
export function MoreHint({ summary, more, toggle }: { summary: string; more: string; toggle: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <span>
        {summary}{' '}
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-controls={id}
          className="inline-flex items-center gap-0.5 font-medium text-[#4a5c35] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#647C47] rounded"
        >
          {toggle}
          <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </span>
      {open && <p id={id} className="rounded-md bg-gray-50 px-2.5 py-2 text-gray-600">{more}</p>}
    </div>
  )
}

/** An accessible on/off switch with its label. */
export function SwitchField({ checked, onChange, label, id }: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  id: string
}) {
  return (
    <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-800">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#647C47] focus-visible:ring-offset-2 ${checked ? 'bg-[#647C47]' : 'bg-gray-300'}`}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
      {label}
    </label>
  )
}
