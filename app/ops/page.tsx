'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { RefreshCw, ChevronDown, ChevronUp, MapPin } from 'lucide-react'
import PushToggle from './PushToggle'

// The ops board: a phone-first view of every trip on the ground today, each
// expandable to its checkpoint timeline. Polls every 30s. The office-side
// counterpart to the staff tap-links. (The traveller-chat embed + unread badge
// are a follow-up that bridges portal_messages.)

const KIND_LABEL: Record<string, string> = {
  departed: 'Departed', en_route: 'En route', arrived: 'Arrived',
  picked_up: 'Picked up', dropped_off: 'Dropped off', checked_in: 'Checked in',
  checked_out: 'Checked out', completed: 'Completed', delayed: 'Running late', note: 'Note',
}

interface TripEvent { id?: string; event_kind: string; occurred_at: string; actor_name: string | null; lat: number | null; lng: number | null; note?: string | null }
interface Trip {
  id: string; trip_name: string | null; client_name: string | null
  start_date: string; end_date: string; status: string | null
  latest_event: TripEvent | null
}

function fmtTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } catch { return iso }
}

export default function OpsBoard() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [timeline, setTimeline] = useState<Record<string, TripEvent[]>>({})

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/trip-events/today')
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load')
      setTrips(data.trips)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const poll = setInterval(() => { if (document.visibilityState === 'visible') load() }, 30000)
    return () => clearInterval(poll)
  }, [load])

  const toggle = async (id: string) => {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    if (!timeline[id]) {
      try {
        const res = await fetch(`/api/trip-events?itinerary_id=${id}`)
        const data = await res.json()
        if (res.ok && data.success) setTimeline(prev => ({ ...prev, [id]: data.events }))
      } catch { /* leave the timeline empty on error */ }
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white px-4 py-4 sticky top-0 z-10 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">On the ground today</h1>
          <p className="text-xs text-gray-400">{trips.length} active trip{trips.length === 1 ? '' : 's'}</p>
        </div>
        <div className="flex items-center gap-2">
          <PushToggle />
          <button onClick={load} className="p-2 rounded-lg bg-white/10 hover:bg-white/20" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-3 py-4 space-y-2">
        {error && <p className="text-sm text-red-600 text-center py-4">{error}</p>}
        {!error && !loading && trips.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-12">No trips on the ground today.</p>
        )}
        {trips.map(t => {
          const ev = t.latest_event
          const isOpen = expanded === t.id
          return (
            <div key={t.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button onClick={() => toggle(t.id)} className="w-full flex items-center justify-between px-4 py-3 text-left">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{t.trip_name || 'Trip'}</p>
                  <p className="text-xs text-gray-500 truncate">{t.client_name || ''}</p>
                </div>
                <div className="flex items-center gap-3 flex-none">
                  {ev ? (
                    <span className={`text-xs font-medium ${ev.event_kind === 'delayed' ? 'text-amber-600' : 'text-gray-700'}`}>
                      {KIND_LABEL[ev.event_kind] ?? ev.event_kind} · {fmtTime(ev.occurred_at)}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">no checkpoints yet</span>
                  )}
                  {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                  <ol className="space-y-1.5">
                    {(timeline[t.id] ?? []).length === 0 && (
                      <li className="text-xs text-gray-400">No checkpoints logged.</li>
                    )}
                    {(timeline[t.id] ?? []).map((e, i) => (
                      <li key={e.id ?? i} className="flex items-center justify-between text-sm">
                        <span className="text-gray-900">
                          {KIND_LABEL[e.event_kind] ?? e.event_kind}
                          {e.actor_name && <span className="text-gray-400"> — {e.actor_name}</span>}
                          {(e.lat != null && e.lng != null) && (
                            <a
                              href={`https://maps.google.com/?q=${e.lat},${e.lng}`}
                              target="_blank" rel="noreferrer"
                              className="inline-flex items-center text-gray-400 hover:text-gray-600 ml-1"
                              title="Open pin"
                            ><MapPin className="w-3.5 h-3.5" /></a>
                          )}
                        </span>
                        <span className="text-gray-500 text-xs">{fmtTime(e.occurred_at)}</span>
                      </li>
                    ))}
                  </ol>
                  <Link href={`/itineraries/${t.id}`} className="inline-block mt-3 text-xs font-medium text-[#647C47] hover:underline">
                    Open trip →
                  </Link>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </main>
  )
}
