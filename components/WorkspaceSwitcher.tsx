'use client'
// The workspace this person is working in, and a way to change it.
//
// organization_members has always been keyed (org_id, user_id), so belonging
// to two agencies was representable — a bookkeeper working for two operators,
// a consultant, the same address invited by a second company. What was missing
// was any way for a request to say WHICH one it meant, so the second
// membership was invisible and everything filed under it unreachable.
//
// RENDERS NOTHING for anyone with a single workspace, which is almost
// everybody: a switcher with one entry is furniture. It appears the moment a
// second membership exists, and not before.
import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Building2 } from 'lucide-react'
import { useDismissOnOutside } from '@/lib/use-dismiss-on-outside'

interface Workspace {
  org_id: string
  name: string
  role: string
  active: boolean
}

export default function WorkspaceSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useDismissOnOutside(open, ref, () => setOpen(false))

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/organizations/mine')
        if (!res.ok) return
        const json = await res.json()
        if (!cancelled && json?.success) setWorkspaces(json.organizations ?? [])
      } catch {
        // A switcher that cannot load is simply absent; it must never stop the
        // rest of the sidebar rendering.
      }
    })()
    return () => { cancelled = true }
  }, [])

  const switchTo = async (orgId: string) => {
    setSwitching(orgId)
    setError(null)
    try {
      const res = await fetch('/api/organizations/mine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgId }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) {
        setError(json?.error || 'Could not switch workspace')
        setSwitching(null)
        return
      }
      // A full reload, deliberately. Every page on screen was fetched under
      // the previous workspace; re-rendering in place would leave one agency's
      // data under another's name until each panel happened to refetch.
      window.location.reload()
    } catch {
      setError('Could not switch workspace')
      setSwitching(null)
    }
  }

  // One workspace (or none loaded) — nothing to choose between.
  if (workspaces.length < 2) return null

  const active = workspaces.find(w => w.active) ?? workspaces[0]

  return (
    <div ref={ref} className="relative px-2 py-2 border-b border-gray-200">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title={collapsed ? active.name : undefined}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-lg hover:bg-gray-50 text-left"
      >
        <Building2 className="w-4 h-4 flex-shrink-0 text-gray-400" />
        {!collapsed && (
          <>
            <span className="flex-1 truncate font-medium text-gray-900">{active.name}</span>
            <ChevronDown className="w-4 h-4 flex-shrink-0 text-gray-400" />
          </>
        )}
      </button>

      {open && (
        <div className="absolute left-2 right-2 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
          {workspaces.map(w => (
            <button
              key={w.org_id}
              type="button"
              disabled={switching !== null}
              onClick={() => (w.active ? setOpen(false) : switchTo(w.org_id))}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 disabled:opacity-50"
            >
              <span className="w-4 flex-shrink-0">
                {w.active && <Check className="w-4 h-4 text-primary-600" />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block truncate text-gray-900">{w.name}</span>
                {/* The role is PER workspace — a manager at one agency may own
                    another — so it is shown beside each, not once at the top. */}
                <span className="block text-xs text-gray-500">{w.role}</span>
              </span>
            </button>
          ))}
          {error && <p className="px-3 py-2 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  )
}
