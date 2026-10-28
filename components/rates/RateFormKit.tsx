'use client'

// ============================================
// Building blocks for a rate form
// ============================================
// The rate forms each drew their own modal: numbered circles in four colours,
// labels of two sizes, help paragraphs that set one column three times taller
// than its neighbours. These pieces give a form one look — a titled section,
// a labelled field with a one-line hint, a hint that opens for the long
// explanation, an on/off switch and a summary line — so the next form to be
// redone reads like this one.

import { useId, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Check, ChevronDown, X } from 'lucide-react'
import { RATE_CURRENCIES } from '@/lib/org-rate-currency'
import { CURRENCY_SYMBOLS } from '@/lib/currency-service'

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

// --------------------------------------------
// The modal, the money box, the currency picker and the validity dates
// --------------------------------------------
// Every rate form had the same frame drawn by hand: a header, a form that
// scrolls, an audit log, and a footer whose Save called the submit handler
// from OUTSIDE the form (so the browser never checked required fields on a
// click). RateFormModal is that frame, with Save a real submit.

/** "28 Oct 2026" in the viewer's locale from an ISO date; the input if it is not one. */
export function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
}

/** Whole months from one ISO date to another, or null when either is missing. */
export function monthsBetween(from: string, to: string): number | null {
  if (!from || !to) return null
  const a = new Date(from + 'T00:00:00')
  const b = new Date(to + 'T00:00:00')
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
  if (b.getDate() < a.getDate()) m -= 1
  return m
}

export function RateFormModal({
  formId, title, code, onClose, onSubmit, children, after, summary,
  active, submitLabel, cancelLabel, maxWidth = 'max-w-2xl', submitting = false,
}: {
  formId: string
  title: string
  /** The row's service code, shown as a read-only tag. */
  code?: string
  onClose: () => void
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  children: ReactNode
  /** Below the form, inside the scroll (the audit log) — its buttons never submit. */
  after?: ReactNode
  /** One line read back above Save. */
  summary?: string
  active?: { checked: boolean; onChange: (v: boolean) => void; label: string }
  submitLabel: string
  cancelLabel: string
  maxWidth?: string
  /** True while the save is in flight: Save is disabled, so a double click saves once. */
  submitting?: boolean
}) {
  const t = useTranslations('rates.common')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby={`${formId}-title`} className={`flex max-h-[92vh] w-full ${maxWidth} flex-col overflow-hidden rounded-xl bg-white shadow-xl`}>
        <header className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id={`${formId}-title`} className="text-lg font-semibold text-gray-900">{title}</h2>
            {code && <span className="w-fit rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600">{code}</span>}
          </div>
          <button type="button" onClick={onClose} aria-label={t('formClose')} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex flex-col gap-6 overflow-y-auto px-5 py-5">
          <form id={formId} noValidate onSubmit={onSubmit} className="flex flex-col gap-6">{children}</form>
          {after}
        </div>
        <footer className="flex flex-col gap-3 border-t border-gray-200 bg-gray-50/60 px-5 py-4">
          {summary && (
            <p className="text-xs text-gray-600"><span className="font-medium text-gray-800">{t('formSummary')}:</span> {summary}</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {active ? <SwitchField id={`${formId}-active`} checked={active.checked} onChange={active.onChange} label={active.label} /> : <span />}
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">{cancelLabel}</button>
              <button type="submit" form={formId} disabled={submitting} className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60">
                <Check className="h-4 w-4" />{submitLabel}
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

/** A money input with the currency symbol in front and an optional unit after. */
export function MoneyInput({
  id, name, value, onChange, currency, unit, required, allowZero, placeholder = '0.00',
}: {
  id: string
  name?: string
  value: number | string | null | undefined
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  currency: string
  unit?: string
  required?: boolean
  /** Optional amounts may be 0; a required rate never is (blank = unpriced). */
  allowZero?: boolean
  placeholder?: string
}) {
  const n = Number(value)
  // A required rate opens blank, not 0: 0 is refused (unpriced), so a
  // pre-filled 0 only had to be deleted first.
  const shown = value === null || value === undefined || value === '' || (!allowZero && n === 0) ? '' : value
  const symbol = CURRENCY_SYMBOLS[currency] || currency
  return (
    <div className="flex items-stretch overflow-hidden rounded-lg border border-gray-300 bg-white focus-within:border-transparent focus-within:ring-2 focus-within:ring-[#647C47]">
      <span className="flex items-center border-r border-gray-300 bg-gray-50 px-3 text-sm text-gray-600">{symbol}</span>
      <input
        id={id}
        type="number"
        name={name}
        inputMode="decimal"
        placeholder={placeholder}
        value={shown}
        onChange={onChange}
        required={required}
        min={required && !allowZero ? '0.01' : '0'}
        step="0.01"
        // `!` beats globals.css, which borders every number input; the
        // wrapper draws the one border.
        className="min-w-0 flex-1 !rounded-none !border-0 !shadow-none bg-white px-3 py-2 text-sm text-gray-900 tabular-nums focus:outline-none focus:ring-0"
      />
      {unit && <span className="flex items-center whitespace-nowrap px-3 text-xs text-gray-500">{unit}</span>}
    </div>
  )
}

/** The contract currency picker: blank = the organisation's rate currency. */
export function CurrencyPicker({ id, value, onChange, orgCurrency }: {
  id: string
  value: string
  onChange: (v: string) => void
  orgCurrency: string
}) {
  const t = useTranslations('rates.common')
  return (
    <Field label={t('rateCurrency')} htmlFor={id} hint={t('currencyHintShort')}>
      <select id={id} value={value} onChange={e => onChange(e.target.value)} className={inputClass}>
        <option value="">{t('currencyDefaultWith', { currency: orgCurrency })}</option>
        {RATE_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </Field>
  )
}

/** Valid from / to, with the length in months and a warning when reversed. */
export function ValidityFields({ idPrefix, from, to, onChange, fromLabel, toLabel, fromName = 'rate_valid_from', toName = 'rate_valid_to', required = false }: {
  idPrefix: string
  from: string
  to: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  fromLabel: string
  toLabel: string
  fromName?: string
  toName?: string
  required?: boolean
}) {
  const t = useTranslations('rates.common')
  const months = monthsBetween(from, to)
  const backwards = months !== null && to < from
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label={fromLabel} required={required} htmlFor={`${idPrefix}-from`}>
        <input id={`${idPrefix}-from`} type="date" name={fromName} value={from} onChange={onChange} required={required} className={inputClass} />
      </Field>
      <Field
        label={toLabel}
        required={required}
        htmlFor={`${idPrefix}-to`}
        hint={backwards ? <span className="text-red-700">{t('validBackwards')}</span> : months !== null ? t('validMonths', { count: months }) : undefined}
      >
        <input id={`${idPrefix}-to`} type="date" name={toName} value={to} onChange={onChange} required={required} className={inputClass} />
      </Field>
    </div>
  )
}
