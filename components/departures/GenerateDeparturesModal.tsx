'use client'

// ============================================
// Generate departures modal
// ============================================
// Turn a rule into a season of departure dates instead of adding them one by
// one. Three modes — a weekly pattern, a fixed interval, or hand-picked days —
// with a live preview and count. Existing dates are shown struck-through and
// skipped on create (the API enforces the same via the unique key).

import { useMemo, useState } from 'react'
import { X, Loader2, CalendarPlus, Check } from 'lucide-react'
import { todayLocal } from '@/lib/today'
import { datesByWeekday, datesByInterval, normaliseDates } from '@/lib/departures/generate-dates'

type Mode = 'weekly' | 'interval' | 'pick'

const WEEKDAYS = [
  { n: 0, label: 'Sun' },
  { n: 1, label: 'Mon' },
  { n: 2, label: 'Tue' },
  { n: 3, label: 'Wed' },
  { n: 4, label: 'Thu' },
  { n: 5, label: 'Fri' },
  { n: 6, label: 'Sat' },
]

function plusMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}

interface Props {
  templateId: string
  templateName: string
  /** yyyy-MM-dd of departures that already exist, to mark and skip. */
  existingDates: string[]
  onClose: () => void
  onCreated: (result: { created: number; skipped: number }) => void
}

export default function GenerateDeparturesModal({
  templateId,
  templateName,
  existingDates,
  onClose,
  onCreated,
}: Props) {
  const today = todayLocal()
  const [mode, setMode] = useState<Mode>('weekly')
  const [rangeStart, setRangeStart] = useState(today)
  const [rangeEnd, setRangeEnd] = useState(plusMonths(today, 3))
  const [weekdays, setWeekdays] = useState<number[]>([1]) // Monday
  const [stepDays, setStepDays] = useState(7)
  const [picked, setPicked] = useState<string[]>([])
  const [pickInput, setPickInput] = useState('')
  const [status, setStatus] = useState('open')
  const [maxPax, setMaxPax] = useState(20)
  const [minPax, setMinPax] = useState(2)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const existing = useMemo(() => new Set(existingDates.map(d => d.slice(0, 10))), [existingDates])

  const candidates = useMemo(() => {
    if (mode === 'weekly') return datesByWeekday(rangeStart, rangeEnd, weekdays)
    if (mode === 'interval') return datesByInterval(rangeStart, rangeEnd, stepDays)
    return normaliseDates(picked)
  }, [mode, rangeStart, rangeEnd, weekdays, stepDays, picked])

  const toCreate = candidates.filter(d => !existing.has(d))
  const skipCount = candidates.length - toCreate.length

  const toggleWeekday = (n: number) =>
    setWeekdays(prev => (prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n].sort()))

  const addPicked = () => {
    if (!pickInput) return
    setPicked(prev => (prev.includes(pickInput) ? prev : [...prev, pickInput]))
    setPickInput('')
  }

  const create = async () => {
    if (toCreate.length === 0) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/departures/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: templateId,
          dates: candidates, // API skips existing too; send all
          max_pax: maxPax,
          min_pax: minPax,
          status,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Failed to generate departures')
      onCreated({ created: json.data.created, skipped: json.data.skipped })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate departures')
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    'px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]'
  const tab = (m: Mode, label: string) => (
    <button
      onClick={() => setMode(m)}
      className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
        mode === m
          ? 'bg-[#647C47] text-white border-[#647C47]'
          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <CalendarPlus className="w-5 h-5 text-[#647C47]" />
            <h2 className="text-lg font-semibold text-gray-900">Generate departures</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-500">
            For <span className="font-medium text-gray-700">{templateName}</span>. End dates come
            from the tour length; dates that already exist are skipped.
          </p>

          {/* Mode */}
          <div className="flex gap-2">
            {tab('weekly', 'Weekly')}
            {tab('interval', 'Every N days')}
            {tab('pick', 'Pick dates')}
          </div>

          {/* Range (weekly + interval) */}
          {mode !== 'pick' && (
            <div className="flex flex-wrap gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-500">From</span>
                <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} className={inputCls} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-500">To</span>
                <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} className={inputCls} />
              </label>
            </div>
          )}

          {mode === 'weekly' && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-500">On these days</span>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map(w => (
                  <button
                    key={w.n}
                    onClick={() => toggleWeekday(w.n)}
                    className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
                      weekdays.includes(w.n)
                        ? 'bg-[#647C47] text-white border-[#647C47]'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === 'interval' && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-500">Every</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={stepDays}
                  onChange={e => setStepDays(Math.max(1, parseInt(e.target.value || '1', 10)))}
                  className={`${inputCls} w-20`}
                />
                <span className="text-sm text-gray-500">days</span>
              </div>
            </label>
          )}

          {mode === 'pick' && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-gray-500">Add specific dates</span>
              <div className="flex items-center gap-2">
                <input type="date" value={pickInput} onChange={e => setPickInput(e.target.value)} className={inputCls} />
                <button
                  onClick={addPicked}
                  disabled={!pickInput}
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
              {picked.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {normaliseDates(picked).map(d => (
                    <span key={d} className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 rounded">
                      {d}
                      <button
                        onClick={() => setPicked(prev => prev.filter(x => x.slice(0, 10) !== d))}
                        className="text-gray-400 hover:text-red-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Shared defaults */}
          <div className="flex flex-wrap gap-4 pt-2 border-t border-gray-100">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-500">Status</span>
              <select value={status} onChange={e => setStatus(e.target.value)} className={`${inputCls} bg-white`}>
                <option value="draft">Draft</option>
                <option value="open">Open</option>
                <option value="guaranteed">Guaranteed</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-500">Max pax</span>
              <input type="number" min={1} value={maxPax} onChange={e => setMaxPax(Math.max(1, parseInt(e.target.value || '1', 10)))} className={`${inputCls} w-20`} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-500">Min pax</span>
              <input type="number" min={1} value={minPax} onChange={e => setMinPax(Math.max(1, parseInt(e.target.value || '1', 10)))} className={`${inputCls} w-20`} />
            </label>
          </div>

          {/* Preview */}
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
            <div className="text-sm text-gray-700 mb-2">
              <span className="font-semibold text-[#647C47]">{toCreate.length}</span> new departure
              {toCreate.length === 1 ? '' : 's'}
              {skipCount > 0 && <span className="text-gray-400"> · {skipCount} already exist (skipped)</span>}
            </div>
            {candidates.length === 0 ? (
              <p className="text-xs text-gray-400">Choose a range and pattern to preview dates.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {candidates.map(d => (
                  <span
                    key={d}
                    className={`px-2 py-0.5 text-xs rounded ${
                      existing.has(d) ? 'bg-gray-100 text-gray-400 line-through' : 'bg-[#647C47]/10 text-[#4f6238]'
                    }`}
                  >
                    {d}
                  </span>
                ))}
              </div>
            )}
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={create}
            disabled={saving || toCreate.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-[#647C47] text-white rounded-lg hover:bg-[#4f6238] disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Create {toCreate.length > 0 ? toCreate.length : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
