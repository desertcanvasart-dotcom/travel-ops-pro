'use client'

import { useState } from 'react'
import { RefreshCw, Loader2, CheckCircle } from 'lucide-react'

interface SyncButtonProps {
  entityType: string
  entityId: string
  size?: 'sm' | 'md'
  className?: string
}

export function SyncButton({ entityType, entityId, size = 'sm', className = '' }: SyncButtonProps) {
  const [syncing, setSyncing] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSync = async () => {
    setSyncing(true)
    setSuccess(false)
    try {
      const res = await fetch('/api/accounting/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType, entityId }),
      })
      if (res.ok) {
        setSuccess(true)
        setTimeout(() => setSuccess(false), 2000)
      }
    } catch {
      // Error handled by sync log
    } finally {
      setSyncing(false)
    }
  }

  const sizeClasses = size === 'sm'
    ? 'px-2 py-1 text-xs gap-1'
    : 'px-3 py-1.5 text-sm gap-1.5'

  return (
    <button
      onClick={handleSync}
      disabled={syncing}
      className={`inline-flex items-center font-medium text-gray-600 hover:text-[#647C47] border border-gray-200 rounded-md hover:border-[#647C47] transition-colors disabled:opacity-50 ${sizeClasses} ${className}`}
    >
      {syncing ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : success ? (
        <CheckCircle className="w-3 h-3 text-green-500" />
      ) : (
        <RefreshCw className="w-3 h-3" />
      )}
      {syncing ? 'Syncing...' : success ? 'Synced' : 'Sync'}
    </button>
  )
}
