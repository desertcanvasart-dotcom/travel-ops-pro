'use client'

// ============================================
// Departures grid page
// /departures/grid/[templateId]
//
// The office's hand-priced departure sheet, every date priced at its own date
// through the engine. Per date: seats and status (this is where a programme's
// dates are run), 燃油 and LND, then the three flight classes sold side by side
// — economy, business, business one way — each with its typed AIR fare, its
// 合計 and the website rate published for it (rounded up to end in 999 unless
// typed). See lib/pricing/departure-buckets and
// handover/feature-specs/6-departures-grid-spec.md.
// ============================================

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useTierOptions } from '@/hooks/useTierOptions'
import { useVocabOptions } from '@/hooks/useVocabOptions'
import GuideLanguageSelect, { useGuideLanguageChoice } from '@/components/pricing/GuideLanguageSelect'
import { Calendar, Loader2, ArrowLeft, RefreshCw, Download, AlertTriangle, Plane, Check, CalendarPlus, Trash2 } from 'lucide-react'
import GenerateDeparturesModal from '@/components/departures/GenerateDeparturesModal'
import { useConfirm } from '@/components/ConfirmDialog'
import {
  AIR_COLUMN,
  FLIGHT_CLASSES,
  FLIGHT_CLASS_LABELS,
  WEB_COLUMN,
  classColumn,
  type ClassColumn,
  type FlightClass,
} from '@/lib/pricing/departure-buckets'

// ============================================
// TYPES (mirror /api/departures/grid response)
// ============================================

type DepartureStatus = 'draft' | 'open' | 'limited' | 'full' | 'guaranteed' | 'cancelled'

const STATUS_OPTIONS: { value: DepartureStatus; label: string; color: string }[] = [
  { value: 'draft', label: 'Draft', color: 'text-gray-600' },
  { value: 'open', label: 'Open', color: 'text-green-700' },
  { value: 'limited', label: 'Limited', color: 'text-yellow-700' },
  { value: 'full', label: 'Full', color: 'text-red-700' },
  { value: 'guaranteed', label: 'Guaranteed', color: 'text-blue-700' },
  { value: 'cancelled', label: 'Cancelled', color: 'text-gray-400' },
]

interface GridBand {
  departureId: string
  startDate: string
  endDate: string | null
  currency: string
  status: DepartureStatus
  maxPax: number
  minPax: number
  bookedPax: number
  fuelPp: number | null
  landPp: number
  classes: Record<FlightClass, ClassColumn>
  incomplete: boolean
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
  bands: GridBand[]
}

interface TemplateLite {
  id: string
  template_name: string
  template_code: string
}

/** A typed column on tour_departures the grid writes. */
type EditableColumn =
  | 'fuel_surcharge_pp'
  | 'max_pax'
  | (typeof AIR_COLUMN)[FlightClass]
  | (typeof WEB_COLUMN)[FlightClass]

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

const plain = (n: number | null) => (n == null ? '' : Math.round(n).toLocaleString('en-US'))

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

/** Recompute a band's class columns after a typed value changed locally. */
function withClasses(band: GridBand, patch: Partial<Record<EditableColumn, number | null>>): GridBand {
  const fuelPp = 'fuel_surcharge_pp' in patch ? (patch.fuel_surcharge_pp ?? null) : band.fuelPp
  const classes = Object.fromEntries(
    FLIGHT_CLASSES.map(c => {
      const prev = band.classes[c]
      const airPp = AIR_COLUMN[c] in patch ? (patch[AIR_COLUMN[c]] ?? null) : prev.airPp
      const websiteTyped = WEB_COLUMN[c] in patch ? (patch[WEB_COLUMN[c]] ?? null) : prev.websiteTyped ? prev.websitePp : null
      return [c, classColumn({ landPp: band.landPp, fuelPp, airPp, websiteTyped })]
    }),
  ) as Record<FlightClass, ClassColumn>
  return {
    ...band,
    fuelPp,
    classes,
    maxPax: 'max_pax' in patch && patch.max_pax != null ? patch.max_pax : band.maxPax,
  }
}

// ============================================
// A compact number cell
// ============================================
// Reads as plain text (with thousands separators) until clicked; saves on
// Enter or leaving the cell, Escape puts the old value back. Blank = no value.

function NumCell({
  value,
  placeholder,
  onSave,
  saving,
  title,
  emphasis = false,
  width = '!w-[84px]',
}: {
  value: number | null
  placeholder?: string
  onSave: (next: number | null) => void
  saving?: boolean
  title?: string
  emphasis?: boolean
  width?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const cleaned = draft.replace(/[^0-9.]/g, '')
    setDraft(null)
    const next = cleaned === '' ? null : Number(cleaned)
    if (next !== null && (!Number.isFinite(next) || next < 0)) return
    if (next === value) return
    onSave(next)
  }
  return (
    <div className="relative inline-flex items-center">
      <input
        type="text"
        inputMode="numeric"
        title={title}
        value={draft ?? plain(value)}
        placeholder={placeholder}
        onFocus={() => setDraft(value == null ? '' : String(Math.round(value)))}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            setDraft(null)
            ;(e.target as HTMLInputElement).blur()
          }
        }}
        // `!` on purpose: globals.css styles every input[type="text"] (full
        // width, border, white) with more specificity than one utility class.
        className={`${width} !h-7 !px-1.5 !text-right tabular-nums !text-sm !bg-transparent !rounded !border !border-transparent hover:!border-gray-200 focus:!border-[#647C47] focus:!bg-white focus:!shadow-none focus:outline-none placeholder:text-gray-400 ${emphasis ? 'font-semibold !text-gray-900' : '!text-gray-700'}`}
      />
      {saving && <Loader2 className="absolute -right-4 w-3 h-3 text-gray-400 animate-spin" />}
    </div>
  )
}

const CLASS_VIEW_KEY = 'departures-grid-class-view'

// ============================================
// PAGE
// ============================================

export default function DeparturesGridPage() {
  const params = useParams()
  const router = useRouter()
  const templateId = String(params.templateId)
  // Tier labels live under b2bCalculator.tiers; the root namespace has no
  // 'tiers', which rendered the raw key ("tiers.standard") on screen.
  const t = useTranslations('b2bCalculator')
  const tierOptions = useTierOptions(key => t(`tiers.${key}`))
  const confirmDialog = useConfirm()

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

  // Which class the table shows — one at a time keeps it narrow; "All
  // classes" puts them side by side. Remembered per browser.
  const [classView, setClassView] = useState<FlightClass | 'all'>('economy')
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CLASS_VIEW_KEY)
      if (saved === 'all' || (FLIGHT_CLASSES as readonly string[]).includes(saved ?? '')) setClassView(saved as FlightClass | 'all')
    } catch {
      /* storage unavailable — economy */
    }
  }, [])
  const chooseClassView = (v: FlightClass | 'all') => {
    setClassView(v)
    try {
      localStorage.setItem(CLASS_VIEW_KEY, v)
    } catch {
      /* not remembered — fine */
    }
  }
  const visible: readonly FlightClass[] = classView === 'all' ? FLIGHT_CLASSES : [classView]

  // Per-cell saving and row actions
  const [savingCell, setSavingCell] = useState<string | null>(null)
  const [deletingRow, setDeletingRow] = useState<string | null>(null)
  const [showGenerate, setShowGenerate] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // "+ Add dates" on the departures list lands here with ?generate=1.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('generate') === '1') setShowGenerate(true)
  }, [])

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

  /** Save one typed column for one date, then update the row locally — AIR,
   *  fuel and the website rate never change LND, so no reprice is needed. */
  const saveColumn = async (band: GridBand, column: EditableColumn, value: number | null) => {
    if (column === 'max_pax') {
      if (value == null || value < 1) {
        setError('Seats must be at least 1')
        return
      }
      if (value < band.bookedPax) {
        setError(`This date already has ${band.bookedPax} booked — seats cannot go below that`)
        return
      }
    }
    const cellKey = `${band.departureId}:${column}`
    setSavingCell(cellKey)
    setError(null)
    try {
      const res = await fetch(`/api/departures/${band.departureId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [column]: value }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Failed to save')
      setGrid(prev =>
        prev
          ? { ...prev, bands: prev.bands.map(b => (b.departureId === band.departureId ? withClasses(b, { [column]: value }) : b)) }
          : prev,
      )
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSavingCell(null)
    }
  }

  const saveStatus = async (band: GridBand, status: DepartureStatus) => {
    const cellKey = `${band.departureId}:status`
    setSavingCell(cellKey)
    setError(null)
    try {
      const res = await fetch(`/api/departures/${band.departureId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Failed to update status')
      setGrid(prev =>
        prev ? { ...prev, bands: prev.bands.map(b => (b.departureId === band.departureId ? { ...b, status } : b)) } : prev,
      )
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update status')
    } finally {
      setSavingCell(null)
    }
  }

  const deleteDeparture = async (band: GridBand) => {
    const label = dateBand(band.startDate, band.endDate)
    const warning = band.bookedPax > 0 ? ` It has ${band.bookedPax} booked.` : ''
    if (!(await confirmDialog(`Delete the ${label} departure?${warning}`))) return
    setDeletingRow(band.departureId)
    setError(null)
    try {
      const res = await fetch(`/api/departures/${band.departureId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Failed to delete departure')
      setGrid(prev => (prev ? { ...prev, bands: prev.bands.filter(b => b.departureId !== band.departureId) } : prev))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete departure')
    } finally {
      setDeletingRow(null)
    }
  }

  const exportCsv = () => {
    if (!grid) return
    const cur = grid.target_currency
    const header = [
      'Departure', 'Status', 'Booked', 'Seats', `Fuel 燃油 (${cur})`, `LND (${cur})`,
      // Every class, whatever the table shows — the export is the full sheet.
      ...FLIGHT_CLASSES.flatMap(c => [`${FLIGHT_CLASS_LABELS[c]} AIR`, `${FLIGHT_CLASS_LABELS[c]} Total`, `${FLIGHT_CLASS_LABELS[c]} Website`]),
      'Complete',
    ]
    const n = (v: number | null) => (v == null ? '' : Math.round(v))
    const rows = grid.bands.map(b => [
      dateBand(b.startDate, b.endDate),
      b.status,
      b.bookedPax,
      b.maxPax,
      n(b.fuelPp),
      n(b.landPp),
      ...FLIGHT_CLASSES.flatMap(c => [n(b.classes[c].airPp), n(b.classes[c].totalPp), n(b.classes[c].websitePp)]),
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
  // `!` on purpose: globals.css gives inputs and selects full width, padding
  // and a border with more specificity than a utility class.
  const control = '!h-8 !py-0 !px-2 !border !border-gray-200 !rounded-md !text-sm !bg-white focus:outline-none focus:!ring-2 focus:!ring-[#647C47]'
  const th = 'px-2 py-2 font-medium text-[11px] uppercase tracking-wide text-gray-500 bg-gray-50 whitespace-nowrap'
  const groupEdge = 'border-l border-gray-200'

  return (
    <div className="px-6 py-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="mb-4">
        <Link href="/departures" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#647C47] mb-2">
          <ArrowLeft className="w-4 h-4" />
          Departures
        </Link>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 bg-[#647C47]/10 rounded-lg flex items-center justify-center shrink-0">
              <Plane className="w-5 h-5 text-[#647C47]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-gray-900 truncate">{template?.template_name || 'Departures grid'}</h1>
              <p className="text-xs text-gray-500">
                Each date priced at its own season · per person{grid ? ` · gross in ${grid.target_currency}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setShowGenerate(true)} className="flex items-center gap-1.5 h-8 px-3 border border-gray-200 rounded-md text-sm hover:bg-gray-50">
              <CalendarPlus className="w-4 h-4" />
              Generate dates
            </button>
            <button
              onClick={() => load(true)}
              disabled={repricing || loading}
              className="flex items-center gap-1.5 h-8 px-3 border border-gray-200 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${repricing ? 'animate-spin' : ''}`} />
              Reprice all
            </button>
            <button
              onClick={exportCsv}
              disabled={!grid || grid.bands.length === 0}
              className="flex items-center gap-1.5 h-8 px-3 bg-[#647C47] text-white rounded-md text-sm hover:bg-[#4f6238] disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
          <Check className="w-4 h-4" />
          {notice}
        </div>
      )}

      {/* Settings — one slim row */}
      <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <select
          value={templateId}
          onChange={e => {
            if (e.target.value && e.target.value !== templateId) router.push(`/departures/grid/${e.target.value}`)
          }}
          className={`${control} !w-auto max-w-[280px]`}
          title="Programme"
        >
          {templates.length === 0 && <option value={templateId}>{template?.template_name || 'This template'}</option>}
          {templates.map(tpl => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.template_code ? `${tpl.template_code} — ` : ''}
              {tpl.template_name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-gray-500">
          Tier
          <select value={tier} onChange={e => setTier(e.target.value)} className={`${control} !w-auto`}>
            {tierOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-gray-500">
          Pax
          <input
            type="number"
            min={1}
            value={numPax}
            onChange={e => setNumPax(Math.max(1, parseInt(e.target.value || '1', 10)))}
            className={`${control} !w-14`}
          />
        </label>
        <label className="flex items-center gap-1.5 text-gray-500">
          Passport
          <select value={isEur ? 'eur' : 'non_eur'} onChange={e => setIsEur(e.target.value === 'eur')} className={`${control} !w-auto`}>
            <option value="non_eur">Non-EU</option>
            <option value="eur">EU</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-gray-500">
          Guide
          <GuideLanguageSelect choice={guideLang} className={`${control} !w-auto`} />
          <select
            value={guideMode}
            onChange={e => setGuideMode(e.target.value === 'throughout' ? 'throughout' : 'spot')}
            className={`${control} !w-auto`}
          >
            {guideModeOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-gray-500">
          FX{grid ? ` 1 ${grid.rate_currency} =` : ''}
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder={grid ? String(grid.fx) : 'default'}
            value={fxInput}
            onChange={e => setFxInput(e.target.value)}
            onBlur={() => load(false)}
            className={`${control} !w-20`}
          />
          {grid ? grid.target_currency : ''}
        </label>
        {grid && (
          <span className="ml-auto text-xs text-gray-400">
            margin {grid.margin_percent}% · rates in {grid.rate_currency}
          </span>
        )}
      </div>

      {/* Which class the table shows */}
      <div className="flex flex-wrap items-center gap-2 mb-3 text-sm">
        <label className="flex items-center gap-1.5 text-gray-500">
          Class
          <select
            value={classView}
            onChange={e => chooseClassView(e.target.value as FlightClass | 'all')}
            className={`${control} !w-auto font-medium !text-gray-900`}
          >
            {FLIGHT_CLASSES.map(c => (
              <option key={c} value={c}>{FLIGHT_CLASS_LABELS[c]}</option>
            ))}
            <option value="all">All classes</option>
          </select>
        </label>
        <span className="ml-auto text-xs text-gray-400">Website = total rounded up to end in 999, unless typed · CSV includes every class</span>
      </div>

      {anyIncomplete && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Some dates have unpriced services (rate holes) — their totals are not complete prices. Fill the missing rates, then
          reprice.
        </div>
      )}

      {/* Grid — as wide as its columns (one class is narrow), scrolling sideways when wider */}
      <div className={`bg-white border border-gray-200 rounded-lg shadow-sm ${grid && grid.bands.length > 0 && !loading ? 'w-fit max-w-full' : ''}`}>
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-[#647C47] animate-spin" />
          </div>
        ) : !grid || grid.bands.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Calendar className="w-12 h-12 mb-3 text-gray-300" />
            <p className="font-medium">No departures for this programme</p>
            <p className="text-sm mb-3">Generate a season of dates to price them.</p>
            <button
              onClick={() => setShowGenerate(true)}
              className="flex items-center gap-2 h-8 px-3 bg-[#647C47] text-white rounded-md text-sm hover:bg-[#4f6238]"
            >
              <CalendarPlus className="w-4 h-4" />
              Generate dates
            </button>
          </div>
        ) : (
          <div className="overflow-auto max-h-[calc(100vh-280px)] rounded-lg">
            <table className="w-max text-sm border-separate border-spacing-0">
              <thead className="sticky top-0 z-20">
                <tr>
                  <th rowSpan={2} className={`${th} text-left sticky left-0 z-30 border-b border-gray-200`}>Departure</th>
                  <th rowSpan={2} className={`${th} text-right border-b border-gray-200`}>Seats</th>
                  <th rowSpan={2} className={`${th} text-left border-b border-gray-200`}>Status</th>
                  <th rowSpan={2} className={`${th} text-right border-b border-gray-200 ${groupEdge}`}>燃油 Fuel</th>
                  <th rowSpan={2} className={`${th} text-right border-b border-gray-200`}>LND ランド</th>
                  {visible.map(c => (
                    <th key={c} colSpan={3} className={`${th} text-center text-gray-700 ${groupEdge} border-b border-gray-100`}>
                      {FLIGHT_CLASS_LABELS[c]}
                    </th>
                  ))}
                  <th rowSpan={2} className={`${th} border-b border-gray-200`} />
                </tr>
                <tr>
                  {visible.map(c => (
                    <FragmentHeads key={c} th={th} edge={groupEdge} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.bands.map(band => {
                  const cell = (col: string) => savingCell === `${band.departureId}:${col}`
                  const td = 'px-2 py-1 border-b border-gray-100'
                  return (
                    <tr key={band.departureId} className={`group hover:bg-gray-50 ${band.status === 'cancelled' ? 'opacity-50' : ''}`}>
                      <td className={`${td} sticky left-0 z-10 bg-white group-hover:bg-gray-50 whitespace-nowrap`}>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-gray-900">{dateBand(band.startDate, band.endDate)}</span>
                          {band.incomplete && (
                            <span
                              title={band.holes.length ? `Unpriced: ${band.holes.join(', ')}` : 'Incomplete price'}
                              className="inline-flex items-center gap-0.5 px-1 py-0.5 text-[10px] font-medium rounded bg-amber-100 text-amber-700"
                            >
                              <AlertTriangle className="w-3 h-3" />
                              incomplete
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={`${td} text-right whitespace-nowrap`} title="Booked / seats — seats are editable">
                        <span className={`tabular-nums ${band.bookedPax >= band.maxPax ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                          {band.bookedPax} /
                        </span>
                        <NumCell
                          value={band.maxPax}
                          width="!w-10"
                          saving={cell('max_pax')}
                          onSave={v => saveColumn(band, 'max_pax', v)}
                        />
                      </td>
                      <td className={td}>
                        <select
                          value={band.status}
                          disabled={cell('status')}
                          onChange={e => saveStatus(band, e.target.value as DepartureStatus)}
                          className={`!w-auto !h-7 !py-0 !pl-1.5 !pr-6 !text-xs !rounded !border !border-transparent hover:!border-gray-200 !bg-transparent focus:outline-none focus:!border-[#647C47] focus:!shadow-none ${STATUS_OPTIONS.find(o => o.value === band.status)?.color ?? ''}`}
                        >
                          {STATUS_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className={`${td} text-right ${groupEdge}`}>
                        <NumCell
                          value={band.fuelPp}
                          placeholder="—"
                          title="燃油 — one amount per person, whatever the class"
                          saving={cell('fuel_surcharge_pp')}
                          onSave={v => saveColumn(band, 'fuel_surcharge_pp', v)}
                        />
                      </td>
                      <td className={`${td} text-right tabular-nums text-gray-700 pr-3`} title="Engine-priced land, domestic flights included">
                        {plain(band.landPp)}
                      </td>
                      {visible.map(c => {
                        const col = band.classes[c]
                        return (
                          <ClassCells
                            key={c}
                            td={td}
                            edge={groupEdge}
                            col={col}
                            currency={currency}
                            savingAir={cell(AIR_COLUMN[c])}
                            savingWeb={cell(WEB_COLUMN[c])}
                            onAir={v => saveColumn(band, AIR_COLUMN[c], v)}
                            onWeb={v => saveColumn(band, WEB_COLUMN[c], v)}
                          />
                        )
                      })}
                      <td className={`${td} text-right`}>
                        <button
                          onClick={() => deleteDeparture(band)}
                          disabled={deletingRow === band.departureId}
                          title="Delete this departure date"
                          className="p-1 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                        >
                          {deletingRow === band.departureId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-gray-400">
        AIR is the international fare, typed per class — leave it blank where a class is not sold. LND is priced by the
        engine per date and includes domestic flights; international flights (e.g. Tokyo → Cairo) are left out of
        LND — they are the AIR you type. 燃油 is one amount for every class. Website is the total rounded up
        to end in 999 (grey); type over it to publish your own (black), clear it to go back. FX is provisional pending
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

/** The AIR / Total / Website sub-headings under one class. */
function FragmentHeads({ th, edge }: { th: string; edge: string }) {
  return (
    <>
      <th className={`${th} text-right ${edge} border-b border-gray-200`}>AIR</th>
      <th className={`${th} text-right border-b border-gray-200`}>合計 Total</th>
      <th className={`${th} text-right border-b border-gray-200`}>Website</th>
    </>
  )
}

/** One class's three cells for a date. */
function ClassCells({
  td,
  edge,
  col,
  currency,
  savingAir,
  savingWeb,
  onAir,
  onWeb,
}: {
  td: string
  edge: string
  col: ClassColumn
  currency: string
  savingAir: boolean
  savingWeb: boolean
  onAir: (v: number | null) => void
  onWeb: (v: number | null) => void
}) {
  return (
    <>
      <td className={`${td} text-right ${edge}`}>
        <NumCell value={col.airPp} placeholder="—" title="International AIR fare, per person" saving={savingAir} onSave={onAir} />
      </td>
      <td className={`${td} text-right tabular-nums font-medium text-gray-900 pr-3 whitespace-nowrap`}>
        {col.totalPp == null ? <span className="text-gray-300">—</span> : money(col.totalPp, currency)}
      </td>
      <td className={`${td} text-right`}>
        {col.totalPp == null && !col.websiteTyped ? (
          <span className="pr-1.5 text-gray-300">—</span>
        ) : (
          <NumCell
            value={col.websiteTyped ? col.websitePp : null}
            placeholder={col.websiteSuggested != null ? col.websiteSuggested.toLocaleString('en-US') : '—'}
            title={
              col.websiteTyped
                ? `Typed website rate — clear it to go back to ${col.websiteSuggested?.toLocaleString('en-US') ?? 'the suggestion'}`
                : 'Suggested: the total rounded up to end in 999 — type to publish your own'
            }
            emphasis={col.websiteTyped}
            saving={savingWeb}
            onSave={onWeb}
          />
        )}
      </td>
    </>
  )
}
