'use client'

// ============================================
// Departures grid page
// /departures/grid/[templateId]
//
// The office's hand-priced departure sheet, but every date band priced at its
// own date through the engine: AIR / 燃油 / LND / 合計 per person. The engine
// knows hotel/cruise rate periods and ticket seasons, so a July band and a
// January band that the hand sheet prints at the same land figure come out
// correctly different. Fuel (燃油) is the one manual number — editable in place.
// See handover/feature-specs/6-departures-grid-spec.md.
// ============================================

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useTierOptions } from '@/hooks/useTierOptions'
import { useVocabOptions } from '@/hooks/useVocabOptions'
import GuideLanguageSelect, { useGuideLanguageChoice } from '@/components/pricing/GuideLanguageSelect'
import {
  Calendar,
  Loader2,
  ArrowLeft,
  RefreshCw,
  Download,
  AlertTriangle,
  Plane,
  Check,
  FileText,
  CalendarPlus,
} from 'lucide-react'
import GenerateDeparturesModal from '@/components/departures/GenerateDeparturesModal'

// ============================================
// TYPES (mirror /api/departures/grid response)
// ============================================

interface GridBand {
  departureId: string
  startDate: string
  endDate: string | null
  flightClass: string | null
  airPp: number
  fuelPp: number | null
  landPp: number
  totalPp: number
  incomplete: boolean
  currency: string
  holes: string[]
}

interface GridResponse {
  template_id: string
  tier: string
  num_pax: number
  is_eur_passport: boolean
  rate_currency: string
  target_currency: string
  fx: number
  margin_percent: number
  /** The template's variation for this tier — the B2B calculator's key. Null
   *  when the template has no variation at this tier, so "Create quote" is off. */
  variation_id: string | null
  bands: GridBand[]
}

interface TemplateLite {
  id: string
  template_name: string
  template_code: string
}

// ============================================
// HELPERS
// ============================================

/** Whole-unit currencies (JPY) show no decimals; everything else shows two. */
function money(amount: number | null, currency: string): string {
  if (amount == null) return '—'
  const zeroDecimal = currency === 'JPY' || currency === 'KRW'
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: zeroDecimal ? 0 : 2,
      maximumFractionDigits: zeroDecimal ? 0 : 2,
    }).format(amount)
  } catch {
    return `${Math.round(amount).toLocaleString()} ${currency}`
  }
}

function dateBand(start: string, end: string | null): string {
  const fmt = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const startLabel = new Date(start + 'T12:00:00').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  return end && end !== start ? `${startLabel} – ${fmt(end)}` : startLabel
}

// ============================================
// PAGE
// ============================================

export default function DeparturesGridPage() {
  const params = useParams()
  const router = useRouter()
  const templateId = String(params.templateId)
  const t = useTranslations()
  const tierOptions = useTierOptions(key => t(`tiers.${key}`))

  const [loading, setLoading] = useState(true)
  const [repricing, setRepricing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [grid, setGrid] = useState<GridResponse | null>(null)
  const [template, setTemplate] = useState<TemplateLite | null>(null)
  const [templates, setTemplates] = useState<TemplateLite[]>([])

  // Controls
  const [tier, setTier] = useState('standard')
  const [numPax, setNumPax] = useState(2)
  const [isEur, setIsEur] = useState(false) // ATS: JP passports → non-EUR
  const [fxInput, setFxInput] = useState<string>('') // blank = use org/office default
  // Guide language auto-selects the first with a rate (Japanese for ATS), so
  // the grid no longer hard-defaults to English. Mode = spot vs throughout.
  const guideLang = useGuideLanguageChoice()
  const [guideMode, setGuideMode] = useState<'spot' | 'throughout'>('spot')
  const guideModeOptions = useVocabOptions('guide_mode', [
    { value: 'spot', label: 'Spot (per touring day)' },
    { value: 'throughout', label: 'Throughout (one guide)' },
  ])

  // Per-row inline editing (燃油, manual AIR fare, class)
  const [fuelEdits, setFuelEdits] = useState<Record<string, string>>({})
  const [savingFuel, setSavingFuel] = useState<string | null>(null)
  const [airEdits, setAirEdits] = useState<Record<string, string>>({})
  const [savingAir, setSavingAir] = useState<string | null>(null)
  const [classEdits, setClassEdits] = useState<Record<string, string>>({})
  const [savingClass, setSavingClass] = useState<string | null>(null)
  const [showGenerate, setShowGenerate] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(
    async (reprice = false) => {
      if (reprice) setRepricing(true)
      else setLoading(true)
      setError(null)
      try {
        const qs = new URLSearchParams({
          template_id: templateId,
          tier,
          num_pax: String(numPax),
          is_eur: String(isEur),
        })
        if (fxInput.trim() !== '' && Number(fxInput) > 0) qs.set('fx', fxInput.trim())
        if (guideLang.value) qs.set('language', guideLang.value)
        qs.set('guide_mode', guideMode)
        if (reprice) qs.set('reprice', '1')

        const res = await fetch(`/api/departures/grid?${qs.toString()}`)
        const json = await res.json()
        if (!json.success) throw new Error(json.error || 'Failed to load grid')
        setGrid(json.data)
        setFuelEdits({})
        setAirEdits({})
        setClassEdits({})
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load grid')
      } finally {
        setLoading(false)
        setRepricing(false)
      }
    },
    [templateId, tier, numPax, isEur, fxInput, guideLang.value, guideMode],
  )

  useEffect(() => {
    load(false)
  }, [load])

  // Template name for the header.
  useEffect(() => {
    let active = true
    fetch('/api/tours/templates?is_active=true')
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        if (!active || !j?.data) return
        const list = j.data as TemplateLite[]
        setTemplates(list)
        const found = list.find(x => x.id === templateId)
        if (found) setTemplate(found)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [templateId])

  // Save an edited 燃油 cell, then reflect it locally without a full reprice —
  // AIR and LND did not change, only the fuel add-on and the 合計.
  const saveFuel = async (band: GridBand) => {
    const raw = fuelEdits[band.departureId]
    if (raw === undefined) return
    const trimmed = raw.trim()
    const value = trimmed === '' ? null : Number(trimmed)
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      setError('Fuel surcharge must be a non-negative number')
      return
    }
    setSavingFuel(band.departureId)
    setError(null)
    try {
      const res = await fetch(`/api/departures/${band.departureId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fuel_surcharge_pp: value }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Failed to save fuel surcharge')
      setGrid(prev =>
        prev
          ? {
              ...prev,
              bands: prev.bands.map(b =>
                b.departureId === band.departureId
                  ? { ...b, fuelPp: value, totalPp: b.airPp + (value ?? 0) + b.landPp }
                  : b,
              ),
            }
          : prev,
      )
      setFuelEdits(prev => {
        const next = { ...prev }
        delete next[band.departureId]
        return next
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save fuel surcharge')
    } finally {
      setSavingFuel(null)
    }
  }

  // Save a manual AIR fare. A number overrides the engine's estimate; clearing
  // it (blank) reverts to the engine figure, which only a reprice knows, so we
  // reload in that case. LND is untouched either way.
  const saveAir = async (band: GridBand) => {
    const raw = airEdits[band.departureId]
    if (raw === undefined) return
    const trimmed = raw.trim()
    const value = trimmed === '' ? null : Number(trimmed)
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      setError('AIR fare must be a non-negative number')
      return
    }
    setSavingAir(band.departureId)
    setError(null)
    try {
      const res = await fetch(`/api/departures/${band.departureId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ air_pp: value }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Failed to save AIR fare')
      if (value === null) {
        // Reverting to the engine estimate needs a fresh price.
        await load(false)
        return
      }
      setGrid(prev =>
        prev
          ? {
              ...prev,
              bands: prev.bands.map(b =>
                b.departureId === band.departureId
                  ? { ...b, airPp: value, totalPp: value + (b.fuelPp ?? 0) + b.landPp }
                  : b,
              ),
            }
          : prev,
      )
      setAirEdits(prev => {
        const next = { ...prev }
        delete next[band.departureId]
        return next
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save AIR fare')
    } finally {
      setSavingAir(null)
    }
  }

  // Save the booked flight class (a recorded label, no price impact).
  const saveClass = async (band: GridBand) => {
    const raw = classEdits[band.departureId]
    if (raw === undefined) return
    const value = raw.trim() === '' ? null : raw.trim()
    setSavingClass(band.departureId)
    setError(null)
    try {
      const res = await fetch(`/api/departures/${band.departureId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flight_class: value }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Failed to save class')
      setGrid(prev =>
        prev
          ? {
              ...prev,
              bands: prev.bands.map(b =>
                b.departureId === band.departureId ? { ...b, flightClass: value } : b,
              ),
            }
          : prev,
      )
      setClassEdits(prev => {
        const next = { ...prev }
        delete next[band.departureId]
        return next
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save class')
    } finally {
      setSavingClass(null)
    }
  }

  const exportCsv = () => {
    if (!grid) return
    const header = ['Departure', 'Class', `AIR (${grid.target_currency})`, `Fuel 燃油`, `LND`, `Total 合計`, 'Complete']
    const rows = grid.bands.map(b => [
      dateBand(b.startDate, b.endDate),
      b.flightClass ?? '',
      Math.round(b.airPp),
      b.fuelPp == null ? '' : Math.round(b.fuelPp),
      Math.round(b.landPp),
      Math.round(b.totalPp),
      b.incomplete ? 'INCOMPLETE' : 'yes',
    ])
    const csv = [header, ...rows]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `departures-${template?.template_code || templateId}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const currency = grid?.target_currency || 'JPY'
  const anyIncomplete = grid?.bands.some(b => b.incomplete) ?? false

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/departures"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#647C47] mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          Departures
        </Link>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#647C47]/10 rounded-lg flex items-center justify-center">
              <Plane className="w-5 h-5 text-[#647C47]" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                {template?.template_name || 'Departures grid'}
              </h1>
              <p className="text-sm text-gray-500">
                Each date priced at its own season · per person
                {grid ? ` · gross in ${grid.target_currency}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGenerate(true)}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
            >
              <CalendarPlus className="w-4 h-4" />
              Generate dates
            </button>
            <button
              onClick={() => load(true)}
              disabled={repricing || loading}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${repricing ? 'animate-spin' : ''}`} />
              Reprice all
            </button>
            <button
              onClick={exportCsv}
              disabled={!grid || grid.bands.length === 0}
              className="flex items-center gap-2 px-3 py-2 bg-[#647C47] text-white rounded-lg text-sm hover:bg-[#4f6238] disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {notice && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
          <Check className="w-4 h-4" />
          {notice}
        </div>
      )}

      {/* Controls */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 min-w-[220px]">
            <span className="text-xs font-medium text-gray-500">Program (tour template)</span>
            <select
              value={templateId}
              onChange={e => {
                if (e.target.value && e.target.value !== templateId) {
                  router.push(`/departures/grid/${e.target.value}`)
                }
              }}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
            >
              {templates.length === 0 && (
                <option value={templateId}>{template?.template_name || 'This template'}</option>
              )}
              {templates.map(tpl => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.template_code ? `${tpl.template_code} — ` : ''}
                  {tpl.template_name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">Tier</span>
            <select
              value={tier}
              onChange={e => setTier(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
            >
              {tierOptions.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">Pax</span>
            <input
              type="number"
              min={1}
              value={numPax}
              onChange={e => setNumPax(Math.max(1, parseInt(e.target.value || '1', 10)))}
              className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">Passport</span>
            <select
              value={isEur ? 'eur' : 'non_eur'}
              onChange={e => setIsEur(e.target.value === 'eur')}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
            >
              <option value="non_eur">Non-EU</option>
              <option value="eur">EU</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">Guide language</span>
            <GuideLanguageSelect
              choice={guideLang}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">Guide mode</span>
            <select
              value={guideMode}
              onChange={e => setGuideMode(e.target.value === 'throughout' ? 'throughout' : 'spot')}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
            >
              {guideModeOptions.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">
              FX {grid ? `(1 ${grid.rate_currency} → ${grid.target_currency})` : ''}
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder={grid ? String(grid.fx) : 'default'}
              value={fxInput}
              onChange={e => setFxInput(e.target.value)}
              onBlur={() => load(false)}
              className="w-28 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]"
            />
          </label>

          {grid && (
            <div className="ml-auto text-xs text-gray-400 self-end">
              margin {grid.margin_percent}% · rates in {grid.rate_currency}
            </div>
          )}
        </div>
      </div>

      {/* Incomplete banner */}
      {anyIncomplete && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Some dates have unpriced services (rate holes) — their totals are not
          complete prices. Fill the missing rates, then reprice.
        </div>
      )}

      {/* Grid */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-[#647C47] animate-spin" />
          </div>
        ) : !grid || grid.bands.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Calendar className="w-12 h-12 mb-3 text-gray-300" />
            <p className="font-medium">No departures for this template</p>
            <p className="text-sm mb-3">Generate a season of dates, or add them individually.</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowGenerate(true)}
                className="flex items-center gap-2 px-3 py-2 bg-[#647C47] text-white rounded-lg text-sm hover:bg-[#4f6238]"
              >
                <CalendarPlus className="w-4 h-4" />
                Generate dates
              </button>
              <Link
                href="/departures"
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 text-gray-600"
              >
                Departures page
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <th className="text-left font-medium px-4 py-3">Departure</th>
                  <th className="text-left font-medium px-4 py-3">Class</th>
                  <th className="text-right font-medium px-4 py-3">AIR 航空</th>
                  <th className="text-right font-medium px-4 py-3">燃油 Fuel</th>
                  <th className="text-right font-medium px-4 py-3">LND ランド</th>
                  <th className="text-right font-medium px-4 py-3">合計 Total</th>
                  <th className="text-right font-medium px-4 py-3">Quote</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {grid.bands.map(band => {
                  const editing = fuelEdits[band.departureId]
                  const isSaving = savingFuel === band.departureId
                  const airEditing = airEdits[band.departureId]
                  const airIsSaving = savingAir === band.departureId
                  const classEditing = classEdits[band.departureId]
                  const classIsSaving = savingClass === band.departureId
                  return (
                    <tr key={band.departureId} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">
                            {dateBand(band.startDate, band.endDate)}
                          </span>
                          {band.incomplete && (
                            <span
                              title={
                                band.holes.length
                                  ? `Unpriced: ${band.holes.join(', ')}`
                                  : 'Incomplete price'
                              }
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium rounded bg-amber-100 text-amber-700"
                            >
                              <AlertTriangle className="w-3 h-3" />
                              incomplete
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={classEditing !== undefined ? classEditing : band.flightClass ?? ''}
                            placeholder="—"
                            onChange={e =>
                              setClassEdits(prev => ({ ...prev, [band.departureId]: e.target.value }))
                            }
                            onBlur={() => saveClass(band)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                            }}
                            className="w-28 px-2 py-1 text-gray-700 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                          />
                          {classIsSaving && <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min={0}
                            value={airEditing !== undefined ? airEditing : band.airPp || ''}
                            placeholder="—"
                            title="Manual AIR fare — overrides the engine estimate; leave blank to use it"
                            onChange={e =>
                              setAirEdits(prev => ({ ...prev, [band.departureId]: e.target.value }))
                            }
                            onBlur={() => saveAir(band)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                            }}
                            className="w-24 px-2 py-1 text-right tabular-nums border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                          />
                          {airIsSaving ? (
                            <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />
                          ) : (
                            airEditing !== undefined && <Check className="w-3.5 h-3.5 text-gray-300" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min={0}
                            value={editing !== undefined ? editing : band.fuelPp ?? ''}
                            placeholder="—"
                            onChange={e =>
                              setFuelEdits(prev => ({ ...prev, [band.departureId]: e.target.value }))
                            }
                            onBlur={() => saveFuel(band)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                            }}
                            className="w-24 px-2 py-1 text-right tabular-nums border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                          />
                          {isSaving ? (
                            <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />
                          ) : (
                            editing !== undefined && <Check className="w-3.5 h-3.5 text-gray-300" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                        {money(band.landPp, currency)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                        {money(band.totalPp, currency)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {grid.variation_id ? (
                          <Link
                            href={`/b2b/calculator/${grid.variation_id}?travel_date=${band.startDate}&num_pax=${grid.num_pax}&passport=${grid.is_eur_passport ? 'eu' : 'non_eu'}`}
                            title={
                              band.incomplete
                                ? 'Open a quote for this departure (has unpriced services — fill the rates)'
                                : 'Open a quote for this departure in the calculator'
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-[#647C47]/40 text-[#647C47] hover:bg-[#647C47]/10 transition-colors"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            Create quote
                          </Link>
                        ) : (
                          <span
                            title="No tour variation for this tier — add one in Tour Templates to quote from here"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-gray-300 cursor-not-allowed"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            Create quote
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-gray-400">
        AIR, 燃油 and class are entered by hand — AIR defaults to the engine
        estimate until you type a fare, and overriding it never shifts LND. LND
        (land) is priced by the engine per date. FX is provisional pending
        operator sign-off.
      </p>

      {showGenerate && (
        <GenerateDeparturesModal
          templateId={templateId}
          templateName={template?.template_name || 'this template'}
          existingDates={grid?.bands.map(b => b.startDate) ?? []}
          onClose={() => setShowGenerate(false)}
          onCreated={({ created, skipped }) => {
            setShowGenerate(false)
            setNotice(
              created > 0
                ? `Created ${created} departure${created === 1 ? '' : 's'}${skipped ? `, ${skipped} already existed` : ''}.`
                : 'No new departures — all those dates already existed.',
            )
            setTimeout(() => setNotice(null), 5000)
            load(false)
          }}
        />
      )}
    </div>
  )
}
