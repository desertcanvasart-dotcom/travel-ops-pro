'use client'

import { useEffect, useState } from 'react'
import { CoverageGrid as SharedCoverageGrid, type CoverageAssignment, type CoverageDay, type CoverageType } from '@autoura/ui'

interface CoverageGridProps {
  itineraryId: string
  days: CoverageDay[]
  /** Bumped by the page after an assignment changes, to reload. */
  refreshKey?: number
  /** Open the assignment panel on a type (a missing cell's "Assign"). */
  onAssign?: (type: CoverageType) => void
}

/**
 * The shared coverage grid (@autoura/ui) fed from this app's
 * itinerary_resources API.
 */
export default function CoverageGrid({ itineraryId, days, refreshKey = 0, onAssign }: CoverageGridProps) {
  const [assignments, setAssignments] = useState<CoverageAssignment[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    fetch(`/api/itinerary-resources?itinerary_id=${itineraryId}`)
      .then(r => r.json())
      .then(data => {
        if (!live) return
        if (data.success) { setAssignments(data.data); setFailed(false) } else setFailed(true)
      })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [itineraryId, refreshKey])

  return <SharedCoverageGrid days={days} assignments={assignments} failed={failed} onAssign={onAssign} />
}
