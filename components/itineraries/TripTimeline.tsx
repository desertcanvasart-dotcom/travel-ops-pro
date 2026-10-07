'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link2, Loader2, MapPin, Radio, Undo2 } from 'lucide-react'
import { formatPhoneForWhatsApp, generateWhatsAppLink } from '@/lib/whatsapp-link'

// ============================================
// TRIP TIMELINE — the office view of trip_events (the live log)
// ============================================
// The checkpoint log the guides and drivers write from their staff links
// (/staff/[token]), seen from the office: internal notes and who logged each
// entry are visible here, the log refreshes while the page is open, and the
// office can log entries itself — including notes, which never reach the
// client.
//
// Quick-tap: one tap logs a checkpoint. trip_events is append-only (no edit,
// no delete — corrections are new events), so a tap waits a few seconds with
// Undo before it is sent; a mis-tap never reaches the log.
//
// Before the trip, with nothing logged, it is one line: there is nothing to
// read yet. Ported from autoura-saas (app/components/TripTimeline.tsx), with
// the staff links it refers to.

interface TripEvent {
  id: string
  itinerary_resource_id: string | null
  event_kind: string
  occurred_at: string
  lat: number | null
  lng: number | null
  note: string | null
  actor_name: string | null
}

export interface TimelinePerson {
  /** itinerary_resources.id — the assignment the checkpoint is for. */
  id: string
  label: string
}

const KINDS = ['departed', 'en_route', 'arrived', 'picked_up', 'dropped_off', 'checked_in', 'checked_out', 'completed', 'delayed', 'note'] as const
const DOT: Record<string, string> = {
  departed: 'bg-blue-500', en_route: 'bg-blue-500',
  arrived: 'bg-green-500', picked_up: 'bg-green-500', dropped_off: 'bg-green-500',
  checked_in: 'bg-indigo-500', checked_out: 'bg-indigo-500',
  completed: 'bg-emerald-600', delayed: 'bg-amber-500', note: 'bg-gray-400',
}
/** One-tap checkpoints the office logs most. */
const QUICK = ['picked_up', 'arrived', 'dropped_off', 'delayed', 'completed'] as const
/** How long a tap waits for Undo before it is sent. */
const UNDO_MS = 5000
/** The log is written from the road, not from this tab. */
const POLL_MS = 30000

const dayOf = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export default function TripTimeline({ itineraryId, tripName, startDate, endDate, today, people = [] }: {
  itineraryId: string
  /** For the staff-link message. */
  tripName?: string | null
  /** With the dates, entries group under "Day N", and the empty log folds to one line before the trip. */
  startDate?: string | null
  endDate?: string | null
  /** YYYY-MM-DD, the agency's today. */
  today?: string
  /** The trip's assignments, so a checkpoint can say whose it is, and each can get a staff link. */
  people?: TimelinePerson[]
}) {
  const t = useTranslations('itineraries.detail.timeline')
  const [events, setEvents] = useState<TripEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState('')
  const [who, setWho] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<{ kind: string; note: string | null; who: string } | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [linking, setLinking] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const kindLabel = (kind: string) => ((KINDS as readonly string[]).includes(kind) ? t(`kind_${kind}`) : kind)

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/trip-events?itinerary_id=${itineraryId}`)
      const data = await res.json()
      if (res.ok && data.success) setEvents(data.events)
    } catch {
      // Polling — a failed cycle just waits for the next one.
    } finally {
      setLoading(false)
    }
  }, [itineraryId])

  useEffect(() => {
    fetchEvents()
    const id = setInterval(fetchEvents, POLL_MS)
    return () => clearInterval(id)
  }, [fetchEvents])

  const send = useCallback(async (entry: { kind: string; note: string | null; who: string }) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/trip-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itinerary_id: itineraryId,
          event_kind: entry.kind,
          note: entry.note,
          itinerary_resource_id: entry.who || null,
          actor_name: t('office'),
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || t('logFailed'))
      await fetchEvents()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('logFailed'))
    } finally {
      setSaving(false)
    }
  }, [itineraryId, fetchEvents, t])

  // A tapped checkpoint waits UNDO_MS, then goes; a new tap sends the waiting one first.
  const tap = (kind: string) => {
    if (timer.current) { clearTimeout(timer.current); if (pending) send(pending) }
    const entry = { kind, note: note.trim() || null, who }
    setPending(entry)
    setNote('')
    timer.current = setTimeout(() => { timer.current = null; setPending(null); send(entry) }, UNDO_MS)
  }
  const undo = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (pending?.note) setNote(pending.note)
    setPending(null)
  }
  // Leaving the page sends what is waiting rather than losing it.
  const pendingRef = useRef(pending)
  useEffect(() => { pendingRef.current = pending }, [pending])
  useEffect(() => () => {
    if (timer.current && pendingRef.current) { clearTimeout(timer.current); send(pendingRef.current) }
  }, [send])

  const addNote = async () => {
    if (!note.trim()) { setError(t('noteEmpty')); return }
    const text = note.trim()
    setNote('')
    await send({ kind: 'note', note: text, who })
  }

  // The guide's or driver's tap link, handed over on the office's own
  // WhatsApp when their number is known; copied otherwise.
  const staffLink = async (person: TimelinePerson) => {
    // Opened inside the click so the browser does not block it.
    const win = window.open('', '_blank')
    setLinking(person.id)
    setError(null)
    try {
      const res = await fetch(`/api/itinerary-resources/${person.id}/staff-link`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success || !data.url) throw new Error(data.error || t('linkFailed'))
      const phone = data.contact?.phone as string | null | undefined
      if (phone) {
        const text = t('staffMessage', { name: data.contact?.name || '', trip: tripName || '', link: data.url })
        const href = generateWhatsAppLink(formatPhoneForWhatsApp(phone), text)
        if (win) win.location.href = href
        else window.open(href, '_blank')
      } else {
        win?.close()
        await navigator.clipboard.writeText(data.url)
        setCopied(person.id)
        setTimeout(() => setCopied(c => (c === person.id ? null : c)), 4000)
      }
    } catch (e) {
      win?.close()
      setError(e instanceof Error ? e.message : t('linkFailed'))
    } finally {
      setLinking(null)
    }
  }

  const fmtTime = (iso: string) => {
    try { return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) } catch { return iso }
  }

  const start = startDate ? String(startDate).slice(0, 10) : null
  const end = endDate ? String(endDate).slice(0, 10) : null
  const before = !!start && !!today && today < start
  const personLabel = (id: string | null) => (id ? people.find(p => p.id === id)?.label ?? null : null)

  // Grouped by trip day (newest first), when the dates are known.
  const groups: { key: string; title: string; items: TripEvent[] }[] = []
  for (const e of events) {
    const d = dayOf(e.occurred_at)
    const n = start ? daysBetween(start, d) + 1 : null
    const title = n == null
      ? shortDate(e.occurred_at)
      : n < 1 ? t('beforeTrip')
      : end && d > end ? t('afterTrip')
      : t('dayHeading', { number: n, date: shortDate(`${d}T00:00:00`) })
    const last = groups[groups.length - 1]
    if (last && last.title === title) last.items.push(e)
    else groups.push({ key: `${title}-${e.id}`, title, items: [e] })
  }

  // Folded: before the trip, nothing logged.
  if (!loading && events.length === 0 && before && !expanded && !pending) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-3 flex flex-wrap items-center justify-between gap-2" data-testid="trip-timeline">
        <p className="text-sm text-gray-600 flex items-center gap-2">
          <Radio className="w-4 h-4 text-gray-400" />
          <span className="font-medium text-gray-900">{t('title')}</span>
          <span className="text-gray-500">· {t('foldedNothingYet', { days: daysBetween(today!, start!) })}</span>
        </p>
        <button type="button" onClick={() => setExpanded(true)} className="text-xs font-medium text-primary-600 hover:underline">{t('open')}</button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4" data-testid="trip-timeline">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Radio className="w-4 h-4 text-gray-500" />
          {t('title')}
        </h3>
        <span className="text-xs text-gray-400">{events.length > 0 && `${t('entries', { count: events.length })} · `}{t('refreshes')}</span>
      </div>

      {/* The tap links the guides and drivers log from. */}
      {people.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-gray-500">{t('staffLinks')}</span>
          {people.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => staffLink(p)}
              disabled={linking === p.id}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              title={t('staffLinkHint')}
            >
              {linking === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
              {copied === p.id ? t('copied') : p.label}
            </button>
          ))}
        </div>
      )}

      {/* Quick-tap checkpoints, with an optional detail and whose it is. */}
      <div className="space-y-2 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          {people.length > 0 && (
            <select value={who} onChange={e => setWho(e.target.value)} className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white" aria-label={t('whose')}>
              <option value="">{t('wholeTrip')}</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          )}
          {QUICK.map(k => (
            <button
              key={k}
              type="button"
              onClick={() => tap(k)}
              className="px-2.5 py-1 rounded-full text-xs font-medium border border-gray-300 bg-white text-gray-700 hover:border-gray-500 hover:bg-gray-50"
              title={t('tapHint', { kind: kindLabel(k) })}
            >
              {kindLabel(k)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addNote() }}
            placeholder={t('notePlaceholder')}
            className="flex-1 min-w-[200px] px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
          <button
            type="button"
            onClick={addNote}
            disabled={saving}
            className="px-3 py-1.5 border border-gray-300 bg-white text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving && !pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {t('addNote')}
          </button>
        </div>
        <p className="text-[11px] text-gray-400">{t('visibility')}</p>
      </div>

      {pending && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          <span>
            {t('logging', { kind: kindLabel(pending.kind) })}
            {personLabel(pending.who) && <> · {personLabel(pending.who)}</>}
            {pending.note && <> — {pending.note}</>}…
          </span>
          <button type="button" onClick={undo} className="flex items-center gap-1 text-xs font-medium underline hover:no-underline">
            <Undo2 className="w-3.5 h-3.5" /> {t('undo')}
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-400 py-4 text-center">{t('loading')}</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-gray-500 py-4 text-center">{t('empty')}</p>
      ) : (
        <div className="space-y-3">
          {groups.map(g => (
            <div key={g.key}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{g.title}</p>
              <ol className="divide-y divide-gray-100">
                {g.items.map(e => {
                  const person = personLabel(e.itinerary_resource_id)
                  return (
                    <li key={e.id} className="py-2 flex items-start gap-3">
                      <span className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${DOT[e.event_kind] ?? 'bg-gray-400'}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-900">
                          <span className="font-medium">{kindLabel(e.event_kind)}</span>
                          {person && <span className="text-gray-700"> · {person}</span>}
                          {e.actor_name && <span className="text-gray-500"> — {e.actor_name}</span>}
                        </p>
                        {e.note && (
                          <p className="text-xs text-gray-500 mt-0.5 bg-gray-50 border border-gray-100 rounded px-2 py-1 inline-block">
                            🔒 {e.note}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-2 text-xs text-gray-500">
                        {e.lat !== null && e.lng !== null && (
                          <a href={`https://www.google.com/maps?q=${e.lat},${e.lng}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 underline">
                            <MapPin className="w-3 h-3" /> {t('map')}
                          </a>
                        )}
                        <span>{fmtTime(e.occurred_at)}</span>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
