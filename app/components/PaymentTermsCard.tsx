'use client'

// ============================================
// The organisation's payment terms, from Settings
// ============================================
// Three numbers that used to live only in SQL: the deposit share, how soon it
// falls due, and how long before departure the balance is owed. Every booking
// derives its schedule from these (lib/payment-schedule.ts).
//
// A BLANK field means "use the standing rule" and stores NULL — the default is
// shown as the placeholder, not copied into the box. Storing the copy would
// freeze today's default into the org and quietly stop tracking the rule.
//
// Self-contained like PortalLinkCard: fetches and saves its own state, so the
// 1,400-line settings page doesn't grow another thread of it.

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Banknote, Loader2, Check } from 'lucide-react'

interface Terms {
  deposit_percent: number | null
  deposit_due_days: number | null
  balance_due_days_before_departure: number | null
}
interface Defaults {
  deposit_percent: number
  deposit_due_days: number
  balance_due_days_before_departure: number
}

type Field = keyof Terms

export default function PaymentTermsCard() {
  const t = useTranslations('settings.paymentTerms')
  // Strings, because an input's empty state is '' and that emptiness is the
  // point: it is how an owner says "back to the standing rule".
  const [form, setForm] = useState<Record<Field, string>>({
    deposit_percent: '',
    deposit_due_days: '',
    balance_due_days_before_departure: '',
  })
  const [defaults, setDefaults] = useState<Defaults | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/payment-terms')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDefaults(data.defaults)
      setForm({
        deposit_percent: data.terms.deposit_percent ?? '',
        deposit_due_days: data.terms.deposit_due_days ?? '',
        balance_due_days_before_departure:
          data.terms.balance_due_days_before_departure ?? '',
      })
    } catch {
      setError(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    load()
  }, [load])

  const set = (field: Field) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSaved(false)
    setError(null)
    setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/payment-terms', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deposit_percent: form.deposit_percent === '' ? null : Number(form.deposit_percent),
          deposit_due_days:
            form.deposit_due_days === '' ? null : Number(form.deposit_due_days),
          balance_due_days_before_departure:
            form.balance_due_days_before_departure === ''
              ? null
              : Number(form.balance_due_days_before_departure),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? t('saveFailed'))
        return
      }
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  // The sentence the numbers actually mean, effective values included, so an
  // owner reads their terms back rather than three bare inputs.
  const eff = (field: Field) =>
    form[field] !== '' ? Number(form[field]) : defaults?.[field] ?? 0

  if (loading) return null

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-6">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-lg bg-[#647C47]/10 flex items-center justify-center flex-shrink-0">
          <Banknote className="w-6 h-6 text-[#647C47]" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">{t('title')}</h3>
          <p className="text-sm text-gray-600 mb-1">{t('description')}</p>
          <p className="text-sm text-gray-500 mb-4">
            {t('summary', {
              percent: eff('deposit_percent'),
              depositDays: eff('deposit_due_days'),
              balanceDays: eff('balance_due_days_before_departure'),
            })}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(
              [
                ['deposit_percent', t('depositPercent'), '%'],
                ['deposit_due_days', t('depositDueDays'), t('days')],
                ['balance_due_days_before_departure', t('balanceDueDays'), t('days')],
              ] as Array<[Field, string, string]>
            ).map(([field, label, unit]) => (
              <label key={field} className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    value={form[field]}
                    onChange={set(field)}
                    placeholder={String(defaults?.[field] ?? '')}
                    className="w-full px-3 py-2 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#647C47] focus:border-transparent text-sm"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                    {unit}
                  </span>
                </div>
              </label>
            ))}
          </div>

          <p className="text-xs text-gray-500 mt-2">{t('blankHint')}</p>

          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#4a5c35] disabled:opacity-50 text-sm font-medium flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {t('save')}
            </button>
            {saved && (
              <span className="text-sm text-green-700 flex items-center gap-1">
                <Check className="w-4 h-4" /> {t('savedNote')}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
