'use client'

// ============================================
// Settings › Preferences — your own defaults in this company
// ============================================
// Default tier, margin and currency, per (person, company) — user_preferences
// UNIQUE (user_id, org_id). Self-contained (fetches and saves its own state)
// because it is shown in two places: the Preferences tab of /settings, and
// /settings/preferences, which agents can open (they have no other Settings
// page, and the WhatsApp parser sends them here).
//
// The margin FOLLOWS the company's default until the person moves the
// slider: saving only a new currency must not freeze today's company margin
// onto them (lib/settings/preferences marginToStore).

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Crown, Loader2, Save, CheckCircle, AlertCircle } from 'lucide-react'
import { useTierOptions } from '@/hooks/useTierOptions'
import { usePreferences } from '@/app/contexts/PreferencesContext'
import { RATE_CURRENCIES } from '@/lib/org-rate-currency'

// The default-tier cards list whatever Settings → Vocabulary holds
// (useTierOptions). What stays local is a PRESET's i18n label/description
// keys, used when the vocabulary has no word of its own.
const TIER_LABEL_KEYS: Record<string, string> = {
  budget: 'tierBudget', standard: 'tierStandard', deluxe: 'tierDeluxe', luxury: 'tierLuxury',
}
const TIER_DESC_KEYS: Record<string, string> = {
  budget: 'tierBudgetDesc', standard: 'tierStandardDesc', deluxe: 'tierDeluxeDesc', luxury: 'tierLuxuryDesc',
}
const SYMBOLS: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', EGP: 'E£', JPY: '¥' }

interface Form {
  default_tier: string
  default_margin_percent: number
  /** True while the margin shown is the company's, not the person's own. */
  margin_follows_company: boolean
  default_currency: string
}

export default function PreferencesPanel() {
  const t = useTranslations('settings')
  const tierOptions = useTierOptions(key => t(TIER_LABEL_KEYS[key]))
  // Saving MUST go through the app-wide context, not a direct DB write: every
  // page formats money via PreferencesContext, and a direct write leaves its
  // in-memory currency stale until a full reload — Settings said USD, Rates
  // kept showing €.
  const { updatePreferences } = usePreferences()

  const [form, setForm] = useState<Form>({
    default_tier: 'standard',
    default_margin_percent: 25,
    margin_follows_company: true,
    default_currency: 'USD',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let alive = true
    // Through the API: preferences are per (person, company), and only the
    // server knows the active company (getCurrentOrgId).
    fetch('/api/user-preferences')
      .then(r => (r.ok ? r.json() : null))
      .then(json => {
        const data = json?.data
        if (!alive || !data) return
        setForm({
          default_tier: data.default_tier || 'standard',
          default_margin_percent: data.default_margin_percent ?? 25,
          margin_follows_company: data.margin_follows_company === true,
          default_currency: data.default_currency || 'USD',
        })
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const save = async () => {
    setSaving(true)
    setNotice(null)
    try {
      // Persists via PUT /api/user-preferences AND updates the context's
      // in-memory state, so Rates/dashboards re-format in the new currency
      // immediately — no reload, no window refocus.
      const ok = await updatePreferences({
        default_tier: form.default_tier,
        default_margin_percent: form.default_margin_percent,
        margin_follows_company: form.margin_follows_company,
        default_currency: form.default_currency,
      })
      setNotice(ok ? { ok: true, text: t('savedSuccessfully') } : { ok: false, text: t('failedToSave') })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-[#647C47] animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900">{t('itineraryPreferences')}</h3>
        <p className="text-sm text-gray-500 mt-1">{t('configureDefaults')}</p>
      </div>

      {/* Default Tier Setting */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <Crown className="w-5 h-5 text-amber-600" />
          <h4 className="text-sm font-bold text-gray-900">{t('defaultServiceTier')}</h4>
        </div>
        <p className="text-xs text-gray-600 mb-4">{t('tierDescription')}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {tierOptions.map(tier => {
            const isSelected = form.default_tier === tier.value
            const descKey = TIER_DESC_KEYS[tier.value]
            const desc = tier.description || (descKey ? t(descKey) : '')
            return (
              <button
                key={tier.value}
                type="button"
                onClick={() => setForm(prev => ({ ...prev, default_tier: tier.value }))}
                className={`p-3 rounded-lg border-2 text-center transition-all ${
                  isSelected
                    ? tier.value === 'luxury'
                      ? 'border-amber-500 bg-amber-50'
                      : tier.value === 'deluxe'
                      ? 'border-purple-500 bg-purple-50'
                      : tier.value === 'standard'
                      ? 'border-blue-500 bg-blue-50'
                      : tier.value === 'budget'
                      ? 'border-gray-500 bg-gray-50'
                      : 'border-[#647C47] bg-green-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-center gap-1 mb-1">
                  {tier.value === 'luxury' && <Crown className="w-4 h-4 text-amber-600" />}
                  <span className={`text-sm font-semibold ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>{tier.label}</span>
                </div>
                {desc && <p className="text-xs text-gray-500">{desc}</p>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Default Margin Setting */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">💰</span>
          <h4 className="text-sm font-bold text-gray-900">{t('defaultProfitMargin')}</h4>
        </div>
        <p className="text-xs text-gray-600 mb-4">{t('marginDescription')}</p>
        <label className="flex items-center gap-2 mb-3 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={form.margin_follows_company}
            onChange={e => setForm(prev => ({ ...prev, margin_follows_company: e.target.checked }))}
            className="accent-[#647C47]"
          />
          {t('marginFollowsCompany')}
        </label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="0"
            max="50"
            step="5"
            value={form.default_margin_percent}
            onChange={e => setForm(prev => ({
              ...prev,
              default_margin_percent: parseInt(e.target.value),
              // Touching the slider is choosing a margin of one's own.
              margin_follows_company: false,
            }))}
            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#647C47]"
          />
          <div className="w-20 text-center">
            <span className={`text-2xl font-bold ${form.margin_follows_company ? 'text-gray-400' : 'text-[#647C47]'}`}>
              {form.default_margin_percent}%
            </span>
          </div>
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-500">
          <span>0%</span>
          <span>25%</span>
          <span>50%</span>
        </div>
        {form.margin_follows_company && (
          <p className="text-xs text-gray-500 mt-2">{t('marginFollowsCompanyHint')}</p>
        )}
      </div>

      {/* Default Currency Setting */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">💱</span>
          <h4 className="text-sm font-bold text-gray-900">{t('defaultCurrency')}</h4>
        </div>
        <p className="text-xs text-gray-600 mb-4">{t('currencyDescription')}</p>
        <div className="flex gap-2 flex-wrap">
          {RATE_CURRENCIES.map(currency => {
            const isSelected = form.default_currency === currency
            return (
              <button
                key={currency}
                type="button"
                onClick={() => setForm(prev => ({ ...prev, default_currency: currency }))}
                className={`px-4 py-2 rounded-lg border-2 font-medium transition-all ${
                  isSelected
                    ? 'border-[#647C47] bg-[#647C47]/5 text-[#647C47]'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }`}
              >
                {SYMBOLS[currency]} {currency}
              </button>
            )
          })}
        </div>
      </div>

      {notice && (
        <p className={`text-sm flex items-center gap-1.5 ${notice.ok ? 'text-green-700' : 'text-red-600'}`}>
          {notice.ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />} {notice.text}
        </p>
      )}

      <div className="flex justify-end pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? t('saving') : t('saveChanges')}
        </button>
      </div>
    </div>
  )
}
