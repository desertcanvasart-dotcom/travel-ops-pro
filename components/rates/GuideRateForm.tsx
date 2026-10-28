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
import {
  FormSection, Field, MoreHint, inputClass, RateFormModal, MoneyInput, CurrencyPicker, ValidityFields, shortDate,
} from '@/components/rates/RateFormKit'
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

export { monthsBetween } from '@/components/rates/RateFormKit'

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
  const unitKey = UNIT_KEY[values.tour_duration]
  const unit = unitKey ? f(unitKey) : ''
  const labelOf = (opts: Option[], v: string, fallback?: string) => opts.find(o => o.value === v)?.label ?? fallback ?? v
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
    <RateFormModal
      formId={FORM_ID}
      title={editing ? t('editRate') : t('addGuideRate')}
      code={values.service_code}
      onClose={onClose}
      onSubmit={onSubmit}
      after={footerExtra}
      summary={summary}
      active={{ checked: values.is_active, onChange: v => onPatch({ is_active: v }), label: f('activeLabel') }}
      submitLabel={editing ? f('update') : f('create')}
      cancelLabel={f('cancel')}
    >
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
            <MoneyInput id="gr-rate" name="base_rate_eur" value={values.base_rate_eur} onChange={onField} currency={currency} unit={unit} required />
          </Field>
          <CurrencyPicker id="gr-currency" value={values.rate_currency} onChange={v => onPatch({ rate_currency: v })} orgCurrency={orgRateCurrency} />
        </div>
      </FormSection>

      <FormSection title={f('sectionDates')}>
        <ValidityFields idPrefix="gr" from={values.rate_valid_from} to={values.rate_valid_to} onChange={onField} fromLabel={f('validFrom')} toLabel={f('validTo')} />
      </FormSection>

      <Field label={f('notes')} htmlFor="gr-notes">
        <textarea id="gr-notes" name="notes" value={values.notes} onChange={onField} rows={2} className={inputClass} />
      </Field>
    </RateFormModal>
  )
}
