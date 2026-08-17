'use client'

// ============================================
// The traveller's link, from the operator's side
// ============================================
// Mint it, copy it, see whether it has been opened, revoke it.
//
// The link is shown in full rather than hidden behind a "copy" button alone,
// because the operator pastes it into an email they write themselves — and
// because a link nobody can read is one nobody can check they are sending to
// the right person.

import { useCallback, useEffect, useState } from 'react'
import { Link2, Copy, Check, Eye, Trash2, Loader2 } from 'lucide-react'

interface PortalLink {
  url: string
  token: string
  expires_at: string | null
  details_locked_at: string | null
  view_count?: number
  last_viewed_at?: string | null
}

export default function PortalLinkCard({ bookingId }: { bookingId: string }) {
  const [link, setLink] = useState<PortalLink | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/bookings/${bookingId}/portal-link`)
      const data = await res.json()
      setLink(data.link ?? null)
    } catch {
      setError('Could not load the link')
    } finally {
      setLoading(false)
    }
  }, [bookingId])

  useEffect(() => {
    load()
  }, [load])

  async function mint() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/portal-link`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Could not create the link')
        return
      }
      setLink(data.link)
    } finally {
      setBusy(false)
    }
  }

  async function revoke() {
    // Revoking is the one destructive action here: the traveller's link stops
    // working immediately, and a new one is a different URL.
    if (!confirm('This link will stop working immediately. The traveller will need a new one.')) {
      return
    }
    setBusy(true)
    try {
      await fetch(`/api/bookings/${bookingId}/portal-link`, { method: 'DELETE' })
      setLink(null)
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!link) return
    await navigator.clipboard.writeText(link.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return null

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <Link2 className="w-5 h-5 text-[#647C47] mt-0.5 shrink-0" />
          <div className="min-w-0">
            <h3 className="font-medium text-gray-900">Traveller link</h3>
            <p className="text-sm text-gray-500">
              Their trip, what they owe, and the form that replaces the posted
              申込書.
            </p>

            {link && (
              <>
                <code className="mt-2 block text-xs bg-gray-50 border rounded px-2 py-1.5 break-all text-gray-700">
                  {link.url}
                </code>
                <p className="mt-1.5 text-xs text-gray-500 flex items-center gap-3 flex-wrap">
                  <span className="flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    {link.view_count
                      ? `Opened ${link.view_count}×`
                      : 'Not opened yet'}
                  </span>
                  {link.expires_at && (
                    <span>Expires {new Date(link.expires_at).toLocaleDateString()}</span>
                  )}
                  {link.details_locked_at && (
                    <span className="text-amber-700">Form locked</span>
                  )}
                </p>
              </>
            )}
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {link ? (
            <>
              <button
                onClick={copy}
                className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 flex items-center gap-1.5"
              >
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                onClick={revoke}
                disabled={busy}
                title="Revoke this link"
                className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              onClick={mint}
              disabled={busy}
              className="px-3 py-1.5 text-sm bg-[#647C47] text-white rounded-lg hover:bg-[#4a5c35] disabled:opacity-50 flex items-center gap-1.5"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              Create link
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
