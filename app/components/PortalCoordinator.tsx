'use client'

// ============================================
// Portal coordinator — family vs friends, and the friends-mode roster
// ============================================
// Family: one booking-level link (the existing PortalLinkCard). Friends: one
// private link per traveller, gated on that person's name + DOB. The operator
// seeds each traveller's name/DOB/contact here, sends their link, watches who
// has completed — without ever seeing the passport/medical data the traveller
// fills privately.

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Send, RefreshCw, Copy, Ban, Check, Users, UserRound } from 'lucide-react'
import PortalLinkCard from './PortalLinkCard'

type Traveller = {
  id: string
  firstName: string | null
  lastName: string | null
  dateOfBirth: string | null
  email: string | null
  phone: string | null
  isLead: boolean
  submitted: boolean
  link: { url: string; sentAt: string | null } | null
}

type Roster = {
  portalMode: 'family' | 'friends'
  bookedCount: number
  submittedCount: number
  travellers: Traveller[]
}

export default function PortalCoordinator({ bookingId }: { bookingId: string }) {
  const [data, setData] = useState<Roster | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [switching, setSwitching] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/bookings/${bookingId}/coordinator`)
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [bookingId])

  useEffect(() => { load() }, [load])

  const setMode = async (mode: 'family' | 'friends') => {
    if (switching || data?.portalMode === mode) return
    setSwitching(true)
    await fetch(`/api/bookings/${bookingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portal_mode: mode }),
    })
    await load()
    setSwitching(false)
  }

  const saveField = async (id: string, field: string, value: string) => {
    await fetch(`/api/bookings/${bookingId}/passengers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
    // No reload on every keystroke-blur; refresh link/status lazily.
  }

  const sendLink = async (id: string, resend: boolean) => {
    setBusyId(id)
    try {
      await fetch(`/api/bookings/${bookingId}/portal-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passenger_id: id, send: true }),
      })
      await load()
    } finally {
      setBusyId(null)
    }
  }

  const revoke = async (id: string) => {
    setBusyId(id)
    try {
      await fetch(`/api/bookings/${bookingId}/portal-link?passenger_id=${id}`, { method: 'DELETE' })
      await load()
    } finally {
      setBusyId(null)
    }
  }

  const copy = async (url: string, id: string) => {
    try { await navigator.clipboard.writeText(url) } catch {}
    setCopied(id)
    setTimeout(() => setCopied(c => (c === id ? null : c)), 1500)
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading portal…
      </div>
    )
  }
  if (!data) return null

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">Customer portal</h3>
        {/* Mode toggle */}
        <div className="inline-flex rounded-lg bg-gray-100 p-0.5" role="group" aria-label="Portal mode">
          <button
            type="button"
            onClick={() => setMode('family')}
            disabled={switching}
            className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${data.portalMode === 'family' ? 'bg-white shadow-sm text-[#647C47]' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Users className="w-3.5 h-3.5" /> Family
          </button>
          <button
            type="button"
            onClick={() => setMode('friends')}
            disabled={switching}
            className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${data.portalMode === 'friends' ? 'bg-white shadow-sm text-[#647C47]' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <UserRound className="w-3.5 h-3.5" /> Friends
          </button>
        </div>
      </div>

      {data.portalMode === 'family' ? (
        <div className="p-4">
          <p className="text-xs text-gray-500 mb-3">
            One link for the whole party — the lead fills everyone in.
          </p>
          <PortalLinkCard bookingId={bookingId} />
        </div>
      ) : (
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-500">
              A private link per traveller, gated on their own name + date of birth.
            </p>
            <span className="text-xs font-medium text-gray-600">
              {data.submittedCount} of {data.travellers.length} submitted
            </span>
          </div>

          {data.travellers.length === 0 ? (
            <p className="text-sm text-gray-500">
              No travellers yet — add them in the Passengers tab, then send each their link here.
            </p>
          ) : (
            <div className="space-y-3">
              {data.travellers.map(t => (
                <div key={t.id} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {[t.lastName, t.firstName].filter(Boolean).join(' ') || '(unnamed)'}
                      </span>
                      {t.isLead && <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-medium">Lead</span>}
                      {t.submitted
                        ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium"><Check className="w-3 h-3" /> Submitted</span>
                        : <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-medium">Pending</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      {t.link ? (
                        <>
                          <button type="button" onClick={() => copy(t.link!.url, t.id)} title="Copy link" className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
                            {copied === t.id ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                          </button>
                          <button type="button" onClick={() => sendLink(t.id, true)} disabled={busyId === t.id} title="Resend" className="p-1.5 text-gray-400 hover:text-[#647C47] hover:bg-gray-100 rounded-lg disabled:opacity-40">
                            {busyId === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                          </button>
                          <button type="button" onClick={() => revoke(t.id)} disabled={busyId === t.id} title="Revoke" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-40">
                            <Ban className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={() => sendLink(t.id, false)} disabled={busyId === t.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] disabled:opacity-40">
                          {busyId === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                          Send link
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Seed fields the operator sets so the link can be gated + delivered. */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <Field label="Family name" defaultValue={t.lastName ?? ''} onSave={v => saveField(t.id, 'last_name', v)} />
                    <Field label="Given name" defaultValue={t.firstName ?? ''} onSave={v => saveField(t.id, 'first_name', v)} />
                    <Field label="Date of birth" type="date" defaultValue={t.dateOfBirth ?? ''} onSave={v => saveField(t.id, 'date_of_birth', v)} />
                    <Field label="Email" type="email" defaultValue={t.email ?? ''} onSave={v => saveField(t.id, 'email', v)} />
                  </div>
                  {t.link?.sentAt && (
                    <p className="mt-2 text-[11px] text-gray-400">Sent {new Date(t.link.sentAt).toLocaleString()}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Field({
  label, defaultValue, type = 'text', onSave,
}: { label: string; defaultValue: string; type?: string; onSave: (v: string) => void }) {
  const [value, setValue] = useState(defaultValue)
  return (
    <label className="block">
      <span className="block text-[11px] text-gray-500 mb-0.5">{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={() => { if (value !== defaultValue) onSave(value) }}
        className="w-full px-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47]"
      />
    </label>
  )
}
