'use client'

import { useState, useEffect } from 'react'
import { CheckCircle, AlertCircle, Loader2, CloudOff, RefreshCw } from 'lucide-react'

interface SyncStatusBadgeProps {
  entityType: string
  entityId: string
  className?: string
}

export function SyncStatusBadge({ entityType, entityId, className = '' }: SyncStatusBadgeProps) {
  const [status, setStatus] = useState<'loading' | 'synced' | 'failed' | 'none' | 'pending'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    fetchStatus()
  }, [entityType, entityId])

  const fetchStatus = async () => {
    try {
      const res = await fetch(`/api/accounting/sync/status?entityType=${entityType}&entityId=${entityId}`)
      const data = await res.json()

      if (!data || data.length === 0) {
        setStatus('none')
        return
      }

      const entry = data[0]
      setStatus(entry.sync_status)
      setError(entry.last_error)
    } catch {
      setStatus('none')
    }
  }

  const handleRetry = async () => {
    setSyncing(true)
    try {
      await fetch('/api/accounting/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType, entityId }),
      })
      await fetchStatus()
    } catch {
      // Status will be updated on next fetch
    } finally {
      setSyncing(false)
    }
  }

  if (status === 'loading') return null
  if (status === 'none') return null

  return (
    <span className={`inline-flex items-center gap-1 text-xs ${className}`}>
      {syncing ? (
        <>
          <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
          <span className="text-gray-500">Syncing...</span>
        </>
      ) : status === 'synced' ? (
        <>
          <CheckCircle className="w-3 h-3 text-green-500" />
          <span className="text-green-600">Synced</span>
        </>
      ) : status === 'failed' ? (
        <button
          onClick={handleRetry}
          className="inline-flex items-center gap-1 text-red-600 hover:text-red-700"
          title={error || 'Sync failed'}
        >
          <AlertCircle className="w-3 h-3" />
          <span>Failed</span>
          <RefreshCw className="w-3 h-3" />
        </button>
      ) : status === 'pending' ? (
        <>
          <Loader2 className="w-3 h-3 animate-spin text-yellow-500" />
          <span className="text-yellow-600">Pending</span>
        </>
      ) : null}
    </span>
  )
}
