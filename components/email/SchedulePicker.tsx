'use client'

// ============================================
// "Send later": when, in whose time zone
// ============================================
// The office is in Egypt and the customers in Japan, so every choice says
// whose 9:00 it is. The presets cover the usual cases; "Pick date & time"
// takes any time in Japan, Egypt or this computer's zone.

import { useMemo, useState } from 'react'
import { Clock } from 'lucide-react'
import { formatInZone, nextAt, zonedTimeToUtc } from '@/lib/time/zoned'

export const ZONES: Array<{ id: string; label: string }> = [
  { id: 'Asia/Tokyo', label: 'Japan' },
  { id: 'Africa/Cairo', label: 'Egypt' },
]

export interface ScheduleChoice {
  sendAt: Date
  timeZone: string
  /** "Fri 16 Oct, 09:00 (Japan)" — for the confirmation. */
  label: string
}

const localZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'UTC' }
}

export default function SchedulePicker({
  onPick,
  onCancel,
  busy,
}: {
  onPick: (choice: ScheduleChoice) => void
  onCancel: () => void
  busy?: boolean
}) {
  const here = localZone()
  const zoneOptions = useMemo(
    () => ZONES.some(z => z.id === here) ? ZONES : [...ZONES, { id: here, label: `This computer (${here})` }],
    [here],
  )
  const zoneLabel = (id: string) => zoneOptions.find(z => z.id === id)?.label.replace(/ \(.*\)$/, '') ?? id

  const presets = useMemo(() => {
    const make = (zone: string, hhmm: string, weekday: number | undefined, title: string) => {
      const at = nextAt(zone, hhmm, weekday)
      return at ? { title, choice: { sendAt: at, timeZone: zone, label: `${formatInZone(at, zone)} (${zoneLabel(zone)})` } } : null
    }
    return [
      make('Asia/Tokyo', '09:00', undefined, 'Tomorrow morning, Japan'),
      make('Africa/Cairo', '09:00', undefined, 'Tomorrow morning, Egypt'),
      make('Asia/Tokyo', '09:00', 1, 'Monday morning, Japan'),
    ].filter((p): p is NonNullable<typeof p> => p !== null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [custom, setCustom] = useState('')
  const [zone, setZone] = useState('Asia/Tokyo')
  const customAt = custom ? zonedTimeToUtc(custom, zone) : null
  const customOk = !!customAt && customAt.getTime() > Date.now() + 60 * 1000

  return (
    <div className="w-80 bg-white rounded-lg shadow-xl border border-gray-200 py-2" role="dialog" aria-label="Schedule send">
      <p className="px-4 pb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Schedule send</p>
      {presets.map(p => (
        <button
          key={p.title}
          type="button"
          disabled={busy}
          onClick={() => onPick(p.choice)}
          className="w-full text-left px-4 py-2 hover:bg-gray-50 disabled:opacity-50"
        >
          <p className="text-sm text-gray-900">{p.title}</p>
          <p className="text-xs text-gray-500">{p.choice.label}</p>
        </button>
      ))}
      <div className="mt-1 pt-2 px-4 border-t border-gray-100 space-y-2">
        <p className="text-xs font-medium text-gray-600 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Pick date &amp; time</p>
        <div className="flex gap-2">
          <input
            type="datetime-local"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className="flex-1 min-w-0 h-8 px-2 text-xs border border-gray-200 rounded"
          />
          <select value={zone} onChange={(e) => setZone(e.target.value)} className="h-8 px-1 text-xs border border-gray-200 rounded">
            {zoneOptions.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
          </select>
        </div>
        {custom && !customOk && <p className="text-[11px] text-red-600">Pick a time at least a minute from now.</p>}
        {customOk && <p className="text-[11px] text-gray-500">Sends {formatInZone(customAt!, zone)} {zoneLabel(zone)} time{zone !== here ? ` · ${formatInZone(customAt!, here)} here` : ''}</p>}
        <div className="flex justify-end gap-2 pb-1">
          <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
          <button
            type="button"
            disabled={!customOk || busy}
            onClick={() => customAt && onPick({ sendAt: customAt, timeZone: zone, label: `${formatInZone(customAt, zone)} (${zoneLabel(zone)})` })}
            className="px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded hover:bg-primary-700 disabled:opacity-50"
          >
            Schedule
          </button>
        </div>
      </div>
    </div>
  )
}
