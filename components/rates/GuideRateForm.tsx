'use client'

// ============================================
// Add / edit a guide rate
// ============================================
// The form the Guide Rates page opens. It used to be drawn inline in
// app/rates/guides/guide-rates-content.tsx: four fields squeezed into one row
// (the currency picker cut to "Organisation de…"), a 0 pre-filled into a rate
// the save refuses, and two help paragraphs that made one column three times
// taller than the rest. Same fields, same save — the page still owns the
// values and the request; this file only lays them out (RateFormKit).

import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { X, Check } from 'lucide-react'
import { FormSection, Field, MoreHint, SwitchField, inputClass } from '@/components/rates/RateFormKit'
import { RATE_CURRENCIES } from '@/lib/org-rate-currency'
import { CURRENCY_SYMBOLS } from '@/lib/currency-service'
import { NO_SUPPLIER_SENTINEL } from '@/lib/suppliers/supplier-field-constants'

export interface GuideRateFormValues {
  service_code: string
  guide_language: string
  guide_type: string
  city: string
  tour_duration: string
  guide_mode: string
  base_rate_eur: number
  rate_currency: string
  rate_valid_from: string
  rate_valid_to: string
  supplier_id: string
  notes: string
  is_active: boolean
}

type Option = { value: string; label: string }

export interface GuideRateFormProps {
  editing: boolean
  values: GuideRateFormValues
  /** The page's own change handler (inputs carry `name`). */
  onField: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void
  onPatch: (patch: Partial<GuideRateFormValues>) => void
  onGuideChange: (supplierId: string) => void
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  onClose: () => void
  languageOptions: Option[]
  gradeOptions: Option[]
  modeOptions: Option[]
  durationOptions: Option[]
  /** Guides matching the form's city, and how many there are in all. */
  guides: Array<{ id: string; name: string }>
  totalGuides: number
  /** The organisation's rate currency — what a blank currency means. */
  orgRateCurrency: string
  /** <option>s for the city picker (CityOptions). */
  cityOptions: ReactNode
  /** Labels for a stored value the vocabulary no longer lists. */
  legacyLanguageLabel?: string
  legacyModeLabel?: string
  /** Shown under the form when editing (the rate's change history). */
  footerExtra?: ReactNode
}

const FORM_ID = 'guide-rate-form'

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

/** "28 Oct 2026" (in the viewer's locale) from an ISO date; the input as-is if it is not one. */
function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
}

const UNIT_KEY: Record<string, string> = {
  full_day: 'perDay',
  half_day: 'perHalfDay',
  extended: 'perExtended',
  hourly: 'perHour',
  meet_greet: 'perMeetAssist',
}

export default function GuideRateForm(props: GuideRateFormProps) {
  const {
    editing, values, onField, onPatch, onGuideChange, onSubmit, onClose,
    languageOptions, gradeOptions, modeOptions, durationOptions,
    guides, totalGuides, orgRateCurrency, cityOptions, legacyLanguageLabel, legacyModeLabel, footerExtra,
  } = props
  const t = useTranslations('rates.guides')
  const f = useTranslations('rates.guides.form')
  const tCommon = useTranslations('rates.common')

  const currency = values.rate_currency || orgRateCurrency
  const symbol = CURRENCY_SYMBOLS[currency] || currency
  const unitKey = UNIT_KEY[values.tour_duration]
  const unit = unitKey ? f(unitKey) : ''
  const labelOf = (opts: Option[], v: string, fallback?: string) => opts.find(o => o.value === v)?.label ?? fallback ?? v
  const months = monthsBetween(values.rate_valid_from, values.rate_valid_to)
  const datesBackwards = months !== null && values.rate_valid_to < values.rate_valid_from
  const guideName = values.supplier_id === NO_SUPPLIER_SENTINEL
    ? tCommon('noSupplierDirect')
    : guides.find(g => g.id === values.supplier_id)?.name

  const amount = Number(values.base_rate_eur) || 0
  const summary = [
    [labelOf(languageOptions, values.guide_language, legacyLanguageLabel), labelOf(gradeOptions, values.guide_type)].filter(Boolean).join(' '),
    guideName,
    labelOf(modeOptions, values.guide_mode, legacyModeLabel),
    labelOf(durationOptions, values.tour_duration),
    amount > 0
      ? `${new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)}${unit ? ` ${unit}` : ''}`
      : f('noRateYet'),
    values.city || null,
    values.rate_valid_from && values.rate_valid_to ? `${shortDate(values.rate_valid_from)} – ${shortDate(values.rate_valid_to)}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-rate-form-title"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id="guide-rate-form-title" className="text-lg font-semibold text-gray-900">
              {editing ? t('editRate') : t('addGuideRate')}
            </h2>
            {values.service_code && (
              <span className="w-fit rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600" title={f('serviceCode')}>
                {values.service_code}
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label={f('cancel')} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex flex-col gap-6 overflow-y-auto px-5 py-5">
        <form id={FORM_ID} noValidate onSubmit={onSubmit} className="flex flex-col gap-6">
          <FormSection title={f('sectionGuide')}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label={f('language')} required htmlFor="gr-language">
                <select id="gr-language" name="guide_language" value={values.guide_language} onChange={onField} required className={inputClass}>
                  {languageOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  {/* A language since removed from the vocabulary still shows. */}
                  {values.guide_language && !languageOptions.some(o => o.value === values.guide_language) && (
                    <option value={values.guide_language}>{legacyLanguageLabel ?? values.guide_language}</option>
                  )}
                </select>
              </Field>
              <Field label={f('guideType')} required htmlFor="gr-grade">
                <select id="gr-grade" name="guide_type" value={values.guide_type} onChange={onField} required className={inputClass}>
                  {gradeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label={f('cityOptional')} htmlFor="gr-city">
                <select id="gr-city" name="city" value={values.city} onChange={onField} className={inputClass}>
                  <option value="">{f('anyCity')}</option>
                  {cityOptions}
                </select>
              </Field>
            </div>
            <Field
              label={f('guideSupplier')}
              required
              htmlFor="gr-supplier"
              hint={guides.length === 0 && totalGuides > 0
                ? <span className="text-amber-700">{f('noGuidesMatch')}</span>
                : f('guideSupplierHint')}
            >
              <select id="gr-supplier" required name="supplier_id" value={values.supplier_id} onChange={e => onGuideChange(e.target.value)} className={inputClass}>
                <option value="" disabled>
                  {f('selectGuide')}{guides.length < totalGuides ? ` (${f('matching', { count: guides.length })})` : ''}
                </option>
                <option value={NO_SUPPLIER_SENTINEL}>{tCommon('noSupplierDirect')}</option>
                {guides.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </Field>
          </FormSection>

          <FormSection title={f('sectionService')}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={f('guideMode')} htmlFor="gr-mode">
                <select id="gr-mode" name="guide_mode" value={values.guide_mode} onChange={onField} className={inputClass} data-testid="guide-mode">
                  {modeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  {values.guide_mode && !modeOptions.some(o => o.value === values.guide_mode) && (
                    <option value={values.guide_mode}>{legacyModeLabel ?? values.guide_mode}</option>
                  )}
                </select>
              </Field>
              <Field label={f('tourDuration')} htmlFor="gr-duration">
                <select id="gr-duration" name="tour_duration" value={values.tour_duration} onChange={onField} className={inputClass}>
                  {durationOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            </div>
            <div className="text-xs leading-snug text-gray-500">
              <MoreHint summary={f('durationHintShort')} more={f('durationHint')} toggle={f('howPricingUses')} />
            </div>
          </FormSection>

          <FormSection title={f('sectionPrice')}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label={f('eurRate')} required htmlFor="gr-rate" className="sm:col-span-2">
                <div className="flex items-stretch overflow-hidden rounded-lg border border-gray-300 focus-within:ring-2 focus-within:ring-[#647C47] focus-within:border-transparent">
                  <span className="flex items-center bg-gray-50 px-3 text-sm text-gray-600 border-r border-gray-300">{symbol}</span>
                  <input
                    id="gr-rate"
                    type="number"
                    name="base_rate_eur"
                    inputMode="decimal"
                    placeholder="0.00"
                    // Blank, not 0: a guide rate of 0 is refused (unpriced),
                    // so a pre-filled 0 only had to be deleted first.
                    value={amount > 0 ? values.base_rate_eur : ''}
                    onChange={onField}
                    required
                    min="0.01"
                    step="0.01"
                    // `!` beats globals.css, which borders every number input;
                    // here the wrapper draws the one border.
                    className="min-w-0 flex-1 !border-0 !rounded-none !shadow-none bg-white px-3 py-2 text-sm text-gray-900 tabular-nums focus:outline-none focus:ring-0"
                  />
                  {unit && <span className="flex items-center px-3 text-xs text-gray-500 whitespace-nowrap">{unit}</span>}
                </div>
              </Field>
              <Field label={tCommon('rateCurrency')} htmlFor="gr-currency" hint={f('currencyHintShort')}>
                <select id="gr-currency" value={values.rate_currency} onChange={e => onPatch({ rate_currency: e.target.value })} className={inputClass}>
                  <option value="">{f('currencyDefault', { currency: orgRateCurrency })}</option>
                  {RATE_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>
          </FormSection>

          <FormSection title={f('sectionDates')}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={f('validFrom')} htmlFor="gr-from">
                <input id="gr-from" type="date" name="rate_valid_from" value={values.rate_valid_from} onChange={onField} className={inputClass} />
              </Field>
              <Field
                label={f('validTo')}
                htmlFor="gr-to"
                hint={datesBackwards
                  ? <span className="text-red-700">{f('datesBackwards')}</span>
                  : months !== null ? f('months', { count: months }) : undefined}
              >
                <input id="gr-to" type="date" name="rate_valid_to" value={values.rate_valid_to} onChange={onField} className={inputClass} />
              </Field>
            </div>
          </FormSection>

          <Field label={f('notes')} htmlFor="gr-notes">
            <textarea id="gr-notes" name="notes" value={values.notes} onChange={onField} rows={2} className={inputClass} />
          </Field>
        </form>
        {/* Outside the form: its buttons must never submit the rate. */}
        {footerExtra}
        </div>

        <footer className="flex flex-col gap-3 border-t border-gray-200 bg-gray-50/60 px-5 py-4">
          <p className="text-xs text-gray-600">
            <span className="font-medium text-gray-800">{f('summary')}:</span> {summary}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SwitchField id="gr-active" checked={values.is_active} onChange={v => onPatch({ is_active: v })} label={f('activeLabel')} />
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                {f('cancel')}
              </button>
              <button type="submit" form={FORM_ID} className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
                <Check className="h-4 w-4" />
                {editing ? f('update') : f('create')}
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
