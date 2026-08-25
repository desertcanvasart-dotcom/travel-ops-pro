'use client'

// ============================================
// INTEGRATIONS — connect this system to a partner platform
// ============================================
// The operator-facing half of the integration framework. Its job is to answer
// two questions well:
//
//   1. how do I connect a partner?          → create, then copy the credentials
//   2. is this actually working?            → the delivery log, not a timestamp
//
// (2) is the one that matters after week one. `last_inbound_at` looks reassuring
// while every departure in every delivery is being rejected, so the log shows
// what each delivery DID — created / updated / rejected — rather than that one
// arrived.

import { useCallback, useEffect, useState } from 'react'
import {
  Plug, Plus, Copy, Check, RefreshCw, Trash2, X, Loader2,
  AlertTriangle, ChevronDown, ChevronRight,
} from 'lucide-react'

interface Provider {
  slug: string
  label: string
  description: string
}

interface Integration {
  id: string
  provider: string
  name: string
  direction: 'inbound' | 'outbound' | 'both'
  is_active: boolean
  settings: Record<string, unknown>
  endpoint_token: string | null
  outbound_key_prefix: string | null
  outbound_key_issued_at: string | null
  last_inbound_at: string | null
  last_outbound_at: string | null
  created_at: string
}

interface DeliveryEvent {
  id: string
  direction: string
  event_type: string
  external_event_id: string | null
  status: 'received' | 'processed' | 'failed' | 'skipped'
  result: { created?: number; updated?: number; unchanged?: number; rejected?: unknown[]; conflicts?: unknown[] } | null
  error: string | null
  received_at: string
  processed_at: string | null
}

/** Credentials are shown once. This holds them until the operator dismisses. */
interface RevealedCredentials {
  title: string
  api_key?: string | null
  inbound_secret?: string | null
  webhook_url?: string | null
  endpoint_token?: string | null
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'never'

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div className="flex items-stretch gap-2">
        <code className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1.5 font-mono break-all">
          {value}
        </code>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            } catch {
              // Clipboard is blocked without HTTPS or permission. The value is
              // on screen and selectable, so this is not worth an error state.
            }
          }}
          className="px-2 border border-gray-300 rounded hover:bg-gray-50"
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="w-4 h-4 text-[#647C47]" /> : <Copy className="w-4 h-4 text-gray-500" />}
        </button>
      </div>
    </div>
  )
}

export function PartnerIntegrationsPanel() {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ provider: '', name: '', direction: 'both' as Integration['direction'] })
  const [revealed, setRevealed] = useState<RevealedCredentials | null>(null)

  const [expanded, setExpanded] = useState<string | null>(null)
  const [events, setEvents] = useState<Record<string, DeliveryEvent[]>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/integrations')
      const json = await res.json()
      if (json.success) {
        setIntegrations(json.data || [])
        setProviders(json.providers || [])
        if (!form.provider && json.providers?.length) {
          setForm(f => ({ ...f, provider: json.providers[0].slug }))
        }
      } else {
        setMessage({ kind: 'error', text: json.error || 'Could not load integrations' })
      }
    } catch {
      setMessage({ kind: 'error', text: 'Could not reach the server' })
    } finally {
      setLoading(false)
    }
    // form.provider intentionally excluded: seeding the picker must not re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const loadEvents = async (id: string) => {
    try {
      const res = await fetch(`/api/integrations/${id}/events?limit=20`)
      const json = await res.json()
      if (json.success) setEvents(e => ({ ...e, [id]: json.data || [] }))
    } catch {
      // A failed log read must not look like a failed integration.
    }
  }

  const toggleExpanded = (id: string) => {
    const next = expanded === id ? null : id
    setExpanded(next)
    if (next && !events[next]) loadEvents(next)
  }

  const create = async () => {
    setBusy('create')
    setMessage(null)
    try {
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setMessage({ kind: 'error', text: json.error || 'Could not create the connection' })
        return
      }
      setShowCreate(false)
      setRevealed({
        title: `${form.name} is connected`,
        api_key: json.credentials?.api_key,
        inbound_secret: json.credentials?.inbound_secret,
        webhook_url: json.webhook_url,
      })
      setForm(f => ({ ...f, name: '' }))
      await load()
    } catch {
      setMessage({ kind: 'error', text: 'Could not reach the server' })
    } finally {
      setBusy(null)
    }
  }

  const patch = async (id: string, body: Record<string, unknown>, revealTitle?: string) => {
    setBusy(id)
    setMessage(null)
    try {
      const res = await fetch(`/api/integrations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setMessage({ kind: 'error', text: json.error || 'Could not update the connection' })
        return
      }
      if (json.credentials && revealTitle) {
        setRevealed({
          title: revealTitle,
          api_key: json.credentials.api_key,
          inbound_secret: json.credentials.inbound_secret,
          webhook_url: json.credentials.webhook_url,
          endpoint_token: json.credentials.endpoint_token,
        })
      }
      await load()
    } catch {
      setMessage({ kind: 'error', text: 'Could not reach the server' })
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async (integration: Integration) => {
    // Native confirm rather than a custom dialog: this destroys a partner's
    // access, and the browser's own dialog is the one users cannot click past
    // on autopilot.
    const ok = window.confirm(
      `Disconnect "${integration.name}"?\n\nTheir API key and webhook endpoint stop working immediately. Departures already mirrored are kept — they may have bookings — but stop receiving updates.`
    )
    if (!ok) return

    setBusy(integration.id)
    try {
      const res = await fetch(`/api/integrations/${integration.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setMessage({ kind: 'error', text: json.error || 'Could not disconnect' })
        return
      }
      setMessage({ kind: 'ok', text: json.message || 'Disconnected.' })
      await load()
    } catch {
      setMessage({ kind: 'error', text: 'Could not reach the server' })
    } finally {
      setBusy(null)
    }
  }

  const providerLabel = (slug: string) => providers.find(p => p.slug === slug)?.label || slug

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Plug className="w-5 h-5 text-[#647C47]" />
            Integrations
          </h1>
          <p className="text-sm text-gray-500 mt-0.5 max-w-2xl">
            Connect an external platform to mirror their departures into your calendar, and to let
            them read your availability. Any platform that can send our documented payload works —
            see <code className="text-xs">docs/INTEGRATIONS.md</code>.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#647C47] text-white text-sm rounded hover:bg-[#4a5c35]"
        >
          <Plus className="w-4 h-4" />
          Connect a platform
        </button>
      </div>

      {message && (
        <p className={`text-sm ${message.kind === 'ok' ? 'text-[#647C47]' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}

      {loading ? (
        <div className="p-12 flex justify-center text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : integrations.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <Plug className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-600">No platforms connected yet.</p>
          <p className="text-xs text-gray-500 mt-1">
            Start with the generic connector — it accepts our documented payload, which most
            platforms can send without any work on their side.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {integrations.map(i => {
            const isOpen = expanded === i.id
            const log = events[i.id] || []
            return (
              <div key={i.id} className="bg-white border border-gray-200 rounded-lg">
                <div className="p-4 flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-sm font-semibold text-gray-900">{i.name}</h2>
                      <span className="text-xs px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50 text-gray-600">
                        {providerLabel(i.provider)}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50 text-gray-600">
                        {i.direction}
                      </span>
                      {i.is_active ? (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700">active</span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">paused</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Last delivery received {fmt(i.last_inbound_at)} · last read by partner{' '}
                      {fmt(i.last_outbound_at)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => patch(i.id, { is_active: !i.is_active })}
                      disabled={busy === i.id}
                      className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-60"
                    >
                      {i.is_active ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      onClick={() => disconnect(i)}
                      disabled={busy === i.id}
                      className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50 disabled:opacity-60 inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      Disconnect
                    </button>
                    <button
                      onClick={() => toggleExpanded(i.id)}
                      className="p-1 text-gray-400 hover:text-gray-600"
                      aria-label={isOpen ? 'Hide details' : 'Show details'}
                    >
                      {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-gray-100 p-4 space-y-4">
                    {i.endpoint_token && (
                      <CopyField
                        label="Webhook URL — give this to the partner"
                        value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/integrations/${i.endpoint_token}`}
                      />
                    )}

                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      {i.outbound_key_prefix && (
                        <span className="text-gray-500">
                          API key <code className="font-mono">{i.outbound_key_prefix}…</code> issued{' '}
                          {fmt(i.outbound_key_issued_at)}
                        </span>
                      )}
                      <button
                        onClick={() =>
                          patch(i.id, { rotate_api_key: true }, `New API key for ${i.name}`)
                        }
                        disabled={busy === i.id}
                        className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 inline-flex items-center gap-1 disabled:opacity-60"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Rotate API key
                      </button>
                      <button
                        onClick={() =>
                          patch(i.id, { rotate_inbound_secret: true }, `New signing secret for ${i.name}`)
                        }
                        disabled={busy === i.id}
                        className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 inline-flex items-center gap-1 disabled:opacity-60"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Rotate signing secret
                      </button>
                      <button
                        onClick={() =>
                          patch(i.id, { rotate_endpoint_token: true }, `New webhook URL for ${i.name}`)
                        }
                        disabled={busy === i.id}
                        className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 inline-flex items-center gap-1 disabled:opacity-60"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Rotate webhook URL
                      </button>
                    </div>
                    <p className="text-xs text-gray-500">
                      Rotating takes effect immediately — the old credential stops working at once,
                      so the partner needs the new one before their next delivery.
                    </p>

                    <div>
                      <h3 className="text-xs font-semibold text-gray-700 mb-2">Recent deliveries</h3>
                      {log.length === 0 ? (
                        <p className="text-xs text-gray-500">
                          Nothing received yet. Until a partner posts a delivery, there is nothing to
                          show here — a connection on its own does not prove they can reach us.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {log.map(e => {
                            const rejected = e.result?.rejected?.length ?? 0
                            const conflicts = e.result?.conflicts?.length ?? 0
                            return (
                              <div
                                key={e.id}
                                className="text-xs border border-gray-100 rounded px-2 py-1.5 flex items-start justify-between gap-3"
                              >
                                <div className="min-w-0">
                                  <span
                                    className={
                                      e.status === 'processed'
                                        ? 'text-[#647C47]'
                                        : e.status === 'failed'
                                          ? 'text-red-600'
                                          : 'text-gray-600'
                                    }
                                  >
                                    {e.status}
                                  </span>
                                  {e.result && (
                                    <span className="text-gray-600">
                                      {' '}
                                      · {e.result.created ?? 0} created, {e.result.updated ?? 0} updated
                                      {e.result.unchanged ? `, ${e.result.unchanged} unchanged` : ''}
                                    </span>
                                  )}
                                  {/* Surfaced rather than buried: a delivery that
                                      "succeeded" while dropping half its rows is
                                      the failure mode that goes unnoticed. */}
                                  {(rejected > 0 || conflicts > 0) && (
                                    <span className="text-amber-700 inline-flex items-center gap-1 ml-1">
                                      <AlertTriangle className="w-3 h-3" />
                                      {rejected > 0 && `${rejected} rejected`}
                                      {rejected > 0 && conflicts > 0 && ', '}
                                      {conflicts > 0 && `${conflicts} conflicted`}
                                    </span>
                                  )}
                                  {e.error && <span className="text-red-600"> · {e.error}</span>}
                                </div>
                                <span className="text-gray-400 whitespace-nowrap">{fmt(e.received_at)}</span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Connect a platform</h2>
              <button onClick={() => setShowCreate(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <label className="block">
              <span className="text-xs text-gray-500">Platform</span>
              <select
                value={form.provider}
                onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
                className="mt-1 w-full text-sm border border-gray-300 rounded px-2 py-1.5"
              >
                {providers.map(p => (
                  <option key={p.slug} value={p.slug}>
                    {p.label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-gray-500 mt-1 block">
                {providers.find(p => p.slug === form.provider)?.description}
              </span>
            </label>

            <label className="block">
              <span className="text-xs text-gray-500">Name</span>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Acme — Cairo seat pool"
                className="mt-1 w-full text-sm border border-gray-300 rounded px-2 py-1.5"
              />
            </label>

            <label className="block">
              <span className="text-xs text-gray-500">Direction</span>
              <select
                value={form.direction}
                onChange={e =>
                  setForm(f => ({ ...f, direction: e.target.value as Integration['direction'] }))
                }
                className="mt-1 w-full text-sm border border-gray-300 rounded px-2 py-1.5"
              >
                <option value="both">Both — they push departures, they read our availability</option>
                <option value="inbound">Inbound only — they push departures to us</option>
                <option value="outbound">Outbound only — they read our availability</option>
              </select>
            </label>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={create}
                disabled={busy === 'create' || !form.name.trim() || !form.provider}
                className="px-3 py-1.5 text-sm bg-[#647C47] text-white rounded hover:bg-[#4a5c35] disabled:opacity-60 inline-flex items-center gap-1.5"
              >
                {busy === 'create' && <Loader2 className="w-4 h-4 animate-spin" />}
                Connect
              </button>
            </div>
          </div>
        </div>
      )}

      {revealed && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-xl p-5 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">{revealed.title}</h2>

            <div className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 rounded p-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-amber-800">
                Copy the API key now. It is stored only as a hash and{' '}
                <strong>cannot be shown again</strong> — if it is lost, the only way back is to
                rotate, which means the partner has to update their configuration.
              </p>
            </div>

            <div className="space-y-3">
              {revealed.webhook_url && <CopyField label="Webhook URL" value={revealed.webhook_url} />}
              {revealed.inbound_secret && (
                <CopyField label="Signing secret (they sign each delivery with this)" value={revealed.inbound_secret} />
              )}
              {revealed.api_key && (
                <CopyField label="API key (they read your availability with this)" value={revealed.api_key} />
              )}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setRevealed(null)}
                className="px-3 py-1.5 text-sm bg-[#647C47] text-white rounded hover:bg-[#4a5c35]"
              >
                I have copied these
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
