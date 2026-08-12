'use client'

// ============================================
// TRIP ASSIGNEE — the named internal owner of a trip
// ============================================
// Deliberately shows "Unassigned" as a visible, slightly loud state rather than
// an empty space: an unowned trip is the thing this feature exists to surface,
// so it should not look like a blank field nobody filled in.

import { useEffect, useState } from 'react'
import { UserCheck, UserX, Loader2 } from 'lucide-react'

interface TeamMember {
  id: string
  name: string
  email: string | null
  role: string | null
  is_active?: boolean
}

interface Props {
  itineraryId: string
  /** Current owner, if the page already loaded one — avoids a flash of "Unassigned". */
  initialAssignee?: { id: string; name: string } | null
  onAssigned?: (assignee: TeamMember | null) => void
}

export default function TripAssignee({ itineraryId, initialAssignee = null, onAssigned }: Props) {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [assignedTo, setAssignedTo] = useState<string>(initialAssignee?.id || '')
  const [assigneeName, setAssigneeName] = useState<string | null>(initialAssignee?.name || null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const [membersRes, assigneeRes] = await Promise.all([
          fetch('/api/team-members?active=true'),
          fetch(`/api/itineraries/${itineraryId}/assign`),
        ])

        const membersJson = await membersRes.json().catch(() => ({}))
        const assigneeJson = await assigneeRes.json().catch(() => ({}))
        if (cancelled) return

        const list: TeamMember[] = (membersJson.data || membersJson.teamMembers || [])
          .filter((m: TeamMember) => m.is_active !== false)
        setMembers(list)

        const current = assigneeJson?.data?.assignee
        if (current) {
          setAssignedTo(current.id)
          setAssigneeName(current.name)
        } else if (assigneeJson?.success) {
          setAssignedTo('')
          setAssigneeName(null)
        }
      } catch {
        if (!cancelled) setMessage({ kind: 'error', text: 'Could not load team members.' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [itineraryId])

  const assign = async (memberId: string) => {
    setSaving(true)
    setMessage(null)

    try {
      const res = await fetch(`/api/itineraries/${itineraryId}/assign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_to: memberId || null }),
      })
      const json = await res.json().catch(() => ({}))

      if (!res.ok || !json.success) {
        // Keep the previous selection on failure — showing the new name next to
        // an error would claim an assignment that did not happen.
        setMessage({ kind: 'error', text: json.error || 'Could not assign this trip.' })
        return
      }

      const member = members.find(m => m.id === memberId) || null
      setAssignedTo(memberId)
      setAssigneeName(member?.name || null)
      onAssigned?.(member)

      setMessage({
        kind: 'ok',
        text: !memberId
          ? 'Trip unassigned.'
          : json.unchanged
            ? `${member?.name} already owns this trip.`
            : json.notified
              ? `Assigned to ${member?.name} — they have been notified.`
              : `Assigned to ${member?.name}. The notification could not be delivered.`,
      })
    } catch {
      setMessage({ kind: 'error', text: 'Could not reach the server.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">Trip owner</p>

      <div className="flex items-center gap-2">
        {saving ? (
          <Loader2 className="w-4 h-4 text-gray-400 animate-spin flex-shrink-0" />
        ) : assignedTo ? (
          <UserCheck className="w-4 h-4 text-[#647C47] flex-shrink-0" />
        ) : (
          <UserX className="w-4 h-4 text-amber-500 flex-shrink-0" />
        )}

        <select
          value={assignedTo}
          disabled={loading || saving}
          onChange={e => assign(e.target.value)}
          className={`text-sm border rounded px-2 py-1 bg-white disabled:opacity-60 ${
            assignedTo ? 'border-gray-300 text-gray-900' : 'border-amber-300 text-amber-700'
          }`}
        >
          <option value="">{loading ? 'Loading…' : 'Unassigned'}</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.role ? ` · ${m.role}` : ''}
            </option>
          ))}
        </select>
      </div>

      {!loading && !assignedTo && !message && (
        <p className="text-xs text-amber-600 mt-1">Nobody owns this trip yet.</p>
      )}

      {message && (
        <p className={`text-xs mt-1 ${message.kind === 'ok' ? 'text-[#647C47]' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}

      {assigneeName && !message && (
        <p className="text-xs text-gray-500 mt-1">Point of contact for this trip.</p>
      )}
    </div>
  )
}
