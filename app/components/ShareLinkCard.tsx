'use client'

// ============================================
// SHARE LINK CARD — mint / copy / revoke the traveller's itinerary URL
// ============================================
// The operator-facing half of the share feature. The link is a send path, so
// the API refuses to mint one for an unpriced draft; this component surfaces
// that refusal as the reason text rather than a generic failure.

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link2, Copy, Check, EyeOff, Eye, Loader2, AlertTriangle } from 'lucide-react'

interface ShareState {
  shared: boolean
  url?: string
  view_count?: number
  last_viewed_at?: string | null
}

export default function ShareLinkCard({ itineraryId }: { itineraryId: string }) {
  const t = useTranslations('itineraries.share')
  const [state, setState] = useState<ShareState | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/itineraries/${itineraryId}/share`)
      const json = await res.json()
      if (json.success) setState(json)
    } catch {
      // A failed status read is not worth an error banner — the operator can
      // still click Share, which is idempotent.
    }
  }, [itineraryId])

  useEffect(() => {
    void load()
  }, [load])

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/itineraries/${itineraryId}/share`, { method: 'POST' })
      const json = await res.json()
      if (!json.success) {
        // 422 carries the real reason (draft, or a broken price) — show it.
        setError(json.error || t('createFailed'))
        return
      }
      setState({ shared: true, url: json.url, view_count: 0, last_viewed_at: null })
    } catch {
      setError(t('createFailed'))
    } finally {
      setBusy(false)
    }
  }

  const revoke = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/itineraries/${itineraryId}/share`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.success) {
        setError(json.error || t('revokeFailed'))
        return
      }
      setState({ shared: false })
    } catch {
      setError(t('revokeFailed'))
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!state?.url) return
    try {
      await navigator.clipboard.writeText(state.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError(t('copyFailed'))
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
          <Link2 className="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{t('title')}</h3>
          <p className="text-xs text-gray-600">{t('subtitle')}</p>
        </div>
      </div>

      {error && (
        <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md flex gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-700 shrink-0 mt-0.5" />
          <p className="text-yellow-800 text-xs">{error}</p>
        </div>
      )}

      {state?.shared && state.url ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={state.url}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 px-3 py-2 text-xs font-mono bg-gray-50 border border-gray-200 rounded-md text-gray-700"
            />
            <button
              type="button"
              onClick={copy}
              className="h-9 px-3 rounded-md text-sm font-medium flex items-center gap-1.5 bg-primary-600 text-white hover:bg-primary-700 transition-colors shrink-0"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? t('copied') : t('copy')}
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-gray-600">
              <Eye className="w-3.5 h-3.5" />
              {state.view_count && state.view_count > 0
                ? t('viewCount', { count: state.view_count })
                : t('notViewedYet')}
            </div>
            <button
              type="button"
              onClick={revoke}
              disabled={busy}
              className="h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 border border-red-200 text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <EyeOff className="w-3.5 h-3.5" />}
              {t('revoke')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={create}
          disabled={busy}
          className="h-10 px-4 rounded-md text-sm font-medium flex items-center gap-2 bg-primary-600 text-white hover:bg-primary-700 transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
          {t('create')}
        </button>
      )}
    </div>
  )
}
