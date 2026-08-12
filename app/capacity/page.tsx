'use client'

// ============================================
// CAPACITY — the month grid that maintains operator_capacity
// ============================================
// The capacity CHECK logic, its API and the WhatsApp agent's availability
// replies have all existed for a while, reading operator_capacity. Nothing
// could write it, so the table was empty and every check fell through to
// "unknown". This is the page that fills it in.
//
// Two interactions, because operators think in both:
//   * one day at a time  — "we have three groups out on the 14th"
//   * a range at a time  — "we're closed for the whole of Eid"
// Range selection is the one that matters: a blackout is almost never a single
// date, and clicking twelve days individually is how a page like this goes
// unused.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Save, X, CalendarDays } from 'lucide-react'

type Status = 'available' | 'limited' | 'busy' | 'blackout'

interface CapacityRow {
  id?: string
  date: string
  status: Status
  max_groups: number
  booked_groups: number
  max_guides?: number | null
  booked_guides?: number | null
  max_vehicles?: number | null
  booked_vehicles?: number | null
  notes?: string | null
  internal_notes?: string | null
  reason?: string | null
}

const STATUS_STYLE: Record<Status, { chip: string; cell: string; label: string }> = {
  available: { chip: 'bg-green-100 text-green-700 border-green-200', cell: 'bg-green-50 border-green-200', label: 'Available' },
  limited: { chip: 'bg-amber-100 text-amber-700 border-amber-200', cell: 'bg-amber-50 border-amber-200', label: 'Limited' },
  busy: { chip: 'bg-orange-100 text-orange-700 border-orange-200', cell: 'bg-orange-50 border-orange-200', label: 'Busy' },
  blackout: { chip: 'bg-red-100 text-red-700 border-red-200', cell: 'bg-red-50 border-red-300', label: 'Blackout' },
}

const STATUSES: Status[] = ['available', 'limited', 'busy', 'blackout']

const iso = (d: Date) => d.toISOString().slice(0, 10)

function monthBounds(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1))
  const last = new Date(Date.UTC(year, month + 1, 0))
  return { first, last }
}

/** Days to render: the month, padded to whole weeks starting Monday. */
function gridDays(year: number, month: number): Array<{ date: string; inMonth: boolean }> {
  const { first, last } = monthBounds(year, month)
  const days: Array<{ date: string; inMonth: boolean }> = []

  // getUTCDay: 0 = Sunday. Shift so Monday is the first column.
  const leading = (first.getUTCDay() + 6) % 7
  for (let i = leading; i > 0; i--) {
    const d = new Date(first)
    d.setUTCDate(d.getUTCDate() - i)
    days.push({ date: iso(d), inMonth: false })
  }
  for (let day = 1; day <= last.getUTCDate(); day++) {
    days.push({ date: iso(new Date(Date.UTC(year, month, day))), inMonth: true })
  }
  while (days.length % 7 !== 0) {
    const d = new Date(`${days[days.length - 1].date}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 1)
    days.push({ date: iso(d), inMonth: false })
  }
  return days
}

function datesBetween(a: string, b: string): string[] {
  const [from, to] = a <= b ? [a, b] : [b, a]
  const out: string[] = []
  const cur = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  while (cur <= end) {
    out.push(iso(cur))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}

export default function CapacityPage() {
  const today = new Date()
  const [year, setYear] = useState(today.getUTCFullYear())
  const [month, setMonth] = useState(today.getUTCMonth())

  const [rows, setRows] = useState<Record<string, CapacityRow>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const [selected, setSelected] = useState<string[]>([])
  const [anchor, setAnchor] = useState<string | null>(null)

  // Draft for the selection's editor. Undefined = "leave as is", which is what
  // lets a bulk edit change only status without flattening everyone's counts.
  const [draft, setDraft] = useState<Partial<CapacityRow>>({})

  const days = useMemo(() => gridDays(year, month), [year, month])
  const rangeStart = days[0]?.date
  const rangeEnd = days[days.length - 1]?.date

  const load = useCallback(async () => {
    if (!rangeStart || !rangeEnd) return
    setLoading(true)
    try {
      const res = await fetch(`/api/capacity?start_date=${rangeStart}&end_date=${rangeEnd}`)
      const json = await res.json()
      if (json.success) {
        const map: Record<string, CapacityRow> = {}
        for (const row of json.data as CapacityRow[]) map[row.date] = row
        setRows(map)
      } else {
        setMessage({ kind: 'error', text: json.error || 'Could not load capacity' })
      }
    } catch {
      setMessage({ kind: 'error', text: 'Could not reach the server' })
    } finally {
      setLoading(false)
    }
  }, [rangeStart, rangeEnd])

  useEffect(() => {
    load()
  }, [load])

  const shiftMonth = (delta: number) => {
    const d = new Date(Date.UTC(year, month + delta, 1))
    setYear(d.getUTCFullYear())
    setMonth(d.getUTCMonth())
    setSelected([])
    setAnchor(null)
    setDraft({})
  }

  const clickDay = (date: string, shiftKey: boolean) => {
    setMessage(null)
    if (shiftKey && anchor) {
      setSelected(datesBetween(anchor, date))
      return
    }
    setAnchor(date)
    setSelected(prev => (prev.length === 1 && prev[0] === date ? [] : [date]))
    // Seed the editor from the day just clicked, so single-day edits start from
    // what is actually there rather than from blank fields.
    const existing = rows[date]
    setDraft(
      existing
        ? {
            status: existing.status,
            max_groups: existing.max_groups,
            max_guides: existing.max_guides ?? undefined,
            max_vehicles: existing.max_vehicles ?? undefined,
            reason: existing.reason ?? undefined,
            notes: existing.notes ?? undefined,
          }
        : {}
    )
  }

  const save = async () => {
    if (!selected.length) return
    setSaving(true)
    setMessage(null)

    try {
      // Only fields the operator actually touched are sent. An undefined here
      // means "keep whatever that day already had" — critical for a range edit,
      // where blindly writing max_groups would wipe per-day figures someone set
      // deliberately.
      const entries = selected.map(date => {
        const existing = rows[date]
        const entry: Record<string, unknown> = { date }
        entry.status = draft.status ?? existing?.status ?? 'available'
        entry.max_groups = draft.max_groups ?? existing?.max_groups ?? 3
        if (draft.max_guides !== undefined) entry.max_guides = draft.max_guides
        else if (existing?.max_guides != null) entry.max_guides = existing.max_guides
        if (draft.max_vehicles !== undefined) entry.max_vehicles = draft.max_vehicles
        else if (existing?.max_vehicles != null) entry.max_vehicles = existing.max_vehicles
        if (draft.reason !== undefined) entry.reason = draft.reason
        else if (existing?.reason) entry.reason = existing.reason
        if (draft.notes !== undefined) entry.notes = draft.notes
        else if (existing?.notes) entry.notes = existing.notes
        return entry
      })

      const res = await fetch('/api/capacity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setMessage({ kind: 'error', text: json.error || 'Could not save' })
        return
      }

      await load()
      setMessage({
        kind: 'ok',
        text: `Saved ${selected.length} day${selected.length === 1 ? '' : 's'}.`,
      })
      setSelected([])
      setAnchor(null)
      setDraft({})
    } catch {
      setMessage({ kind: 'error', text: 'Could not reach the server' })
    } finally {
      setSaving(false)
    }
  }

  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return (
    <div className="container mx-auto px-4 py-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-[#647C47]" />
            Capacity
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            How many groups you can take each day. The availability check and the WhatsApp
            assistant both read this — a day with no entry counts as available.
          </p>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => shiftMonth(-1)}
            className="p-2 border border-gray-300 rounded hover:bg-gray-50"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-gray-900 min-w-[10rem] text-center">{monthLabel}</span>
          <button
            onClick={() => shiftMonth(1)}
            className="p-2 border border-gray-300 rounded hover:bg-gray-50"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-600 flex-wrap">
        {STATUSES.map(s => (
          <span key={s} className={`inline-flex items-center px-2 py-0.5 rounded border ${STATUS_STYLE[s].chip}`}>
            {STATUS_STYLE[s].label}
          </span>
        ))}
        <span className="text-gray-400">·</span>
        <span>Click a day to edit. Shift-click another to select the range between them.</span>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <div key={d} className="px-2 py-2 text-xs font-medium text-gray-600 text-center">
              {d}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="p-12 flex items-center justify-center text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {days.map(({ date, inMonth }) => {
              const row = rows[date]
              const status = (row?.status ?? 'available') as Status
              const isSelected = selected.includes(date)
              const isToday = date === iso(new Date())
              const slotsLeft = row ? Math.max(0, (row.max_groups ?? 0) - (row.booked_groups ?? 0)) : null

              return (
                <button
                  key={date}
                  onClick={e => clickDay(date, e.shiftKey)}
                  className={[
                    'h-24 border-b border-r border-gray-100 p-1.5 text-left align-top transition-colors',
                    inMonth ? '' : 'opacity-40',
                    row ? STATUS_STYLE[status].cell : 'bg-white',
                    isSelected ? 'ring-2 ring-inset ring-[#647C47]' : 'hover:bg-gray-50',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs ${isToday ? 'font-bold text-[#647C47]' : 'text-gray-700'}`}
                    >
                      {Number(date.slice(8, 10))}
                    </span>
                    {row && status !== 'available' && (
                      <span className="text-[10px] uppercase tracking-wide text-gray-500">
                        {STATUS_STYLE[status].label}
                      </span>
                    )}
                  </div>

                  {row ? (
                    <div className="mt-1 space-y-0.5">
                      <div className="text-[11px] text-gray-700">
                        {row.booked_groups ?? 0}/{row.max_groups ?? 0} groups
                      </div>
                      {slotsLeft !== null && (
                        <div className="text-[11px] text-gray-500">{slotsLeft} free</div>
                      )}
                      {row.reason && (
                        <div className="text-[10px] text-gray-500 truncate" title={row.reason}>
                          {row.reason}
                        </div>
                      )}
                    </div>
                  ) : (
                    // Not the same as "available with 0 capacity" — this day has
                    // no entry at all, and the check treats it as open.
                    <div className="mt-1 text-[11px] text-gray-300">not set</div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {message && (
        <p className={`text-sm ${message.kind === 'ok' ? 'text-[#647C47]' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}

      {selected.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              {selected.length === 1
                ? selected[0]
                : `${selected.length} days — ${selected[0]} to ${selected[selected.length - 1]}`}
            </h2>
            <button
              onClick={() => {
                setSelected([])
                setAnchor(null)
                setDraft({})
              }}
              className="p-1 text-gray-400 hover:text-gray-600"
              aria-label="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="block">
              <span className="text-xs text-gray-500">Status</span>
              <select
                value={draft.status ?? ''}
                onChange={e => setDraft(d => ({ ...d, status: (e.target.value || undefined) as Status }))}
                className="mt-1 w-full text-sm border border-gray-300 rounded px-2 py-1.5"
              >
                <option value="">Leave unchanged</option>
                {STATUSES.map(s => (
                  <option key={s} value={s}>
                    {STATUS_STYLE[s].label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs text-gray-500">Max groups</span>
              <input
                type="number"
                min={0}
                value={draft.max_groups ?? ''}
                onChange={e =>
                  setDraft(d => ({
                    ...d,
                    max_groups: e.target.value === '' ? undefined : Number(e.target.value),
                  }))
                }
                placeholder="unchanged"
                className="mt-1 w-full text-sm border border-gray-300 rounded px-2 py-1.5"
              />
            </label>

            <label className="block">
              <span className="text-xs text-gray-500">Max guides</span>
              <input
                type="number"
                min={0}
                value={draft.max_guides ?? ''}
                onChange={e =>
                  setDraft(d => ({
                    ...d,
                    max_guides: e.target.value === '' ? undefined : Number(e.target.value),
                  }))
                }
                placeholder="unchanged"
                className="mt-1 w-full text-sm border border-gray-300 rounded px-2 py-1.5"
              />
            </label>

            <label className="block">
              <span className="text-xs text-gray-500">Max vehicles</span>
              <input
                type="number"
                min={0}
                value={draft.max_vehicles ?? ''}
                onChange={e =>
                  setDraft(d => ({
                    ...d,
                    max_vehicles: e.target.value === '' ? undefined : Number(e.target.value),
                  }))
                }
                placeholder="unchanged"
                className="mt-1 w-full text-sm border border-gray-300 rounded px-2 py-1.5"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs text-gray-500">
              Reason — shown to clients and partners when the day is blacked out or busy
            </span>
            <input
              type="text"
              value={draft.reason ?? ''}
              onChange={e => setDraft(d => ({ ...d, reason: e.target.value }))}
              placeholder="e.g. Eid holiday"
              className="mt-1 w-full text-sm border border-gray-300 rounded px-2 py-1.5"
            />
          </label>

          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#647C47] text-white text-sm rounded hover:bg-[#4a5c35] disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save {selected.length} day{selected.length === 1 ? '' : 's'}
            </button>
            <span className="text-xs text-gray-500">
              Fields left blank keep whatever each day already had.
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
