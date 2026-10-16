'use client'

import { useEffect, useState } from 'react'
import { tripPaid } from '@/lib/payments/stats'

/**
 * The amount a trip has been paid, from its payment rows (null while loading
 * or when they cannot be read, so the caller can fall back).
 */
export function useTripPaid(itineraryId: string | null | undefined): number | null {
  const [state, setState] = useState<{ id: string; paid: number } | null>(null)
  useEffect(() => {
    if (!itineraryId) return
    let cancelled = false
    fetch(`/api/payments?itineraryId=${encodeURIComponent(itineraryId)}&limit=1000`)
      .then(r => (r.ok ? r.json() : null))
      .then(json => {
        if (!cancelled && json?.success && Array.isArray(json.data)) setState({ id: itineraryId, paid: tripPaid(json.data) })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [itineraryId])
  return state && state.id === itineraryId ? state.paid : null
}
