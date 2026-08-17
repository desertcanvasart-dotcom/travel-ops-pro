'use client'

import { useAuth } from '@/app/contexts/AuthContext'
import { useEffect, useMemo, useState } from 'react'
import { ORG_ROLES, roleAllows, type OrgRole } from '@/lib/auth/roles'

// The ONE role system: organization_members.role, served by /api/auth/role.
// This hook used to read profile.role — the user_profiles DISPLAY MIRROR that
// nothing may gate on (lib/auth/roles.ts) — which meant the sidebar and every
// WithRole gate ran on the wrong system, and an owner was only seeing admin
// sections when the mirror happened to agree.

export type UserRole = OrgRole

interface UseRoleReturn {
  role: UserRole | null
  isAdmin: boolean
  isManager: boolean
  isAgent: boolean
  isViewer: boolean
  canAccess: (requiredRoles: UserRole[]) => boolean
  canManageTeam: boolean
  canManageSettings: boolean
  canViewFinancials: boolean
  canEditClients: boolean
  canDeleteRecords: boolean
}

// One fetch per page load, shared by every consumer of the hook.
let cachedRole: OrgRole | null | undefined
let inflight: Promise<OrgRole | null> | null = null

async function fetchMembershipRole(): Promise<OrgRole | null> {
  if (cachedRole !== undefined) return cachedRole
  inflight ??= fetch('/api/auth/role')
    .then(async res => {
      if (!res.ok) return null
      const body = await res.json()
      const role = body?.role
      return ORG_ROLES.includes(role) ? (role as OrgRole) : null
    })
    .catch(() => null)
    .then(role => {
      cachedRole = role
      inflight = null
      return role
    })
  return inflight
}

export function useRole(): UseRoleReturn {
  const { profile } = useAuth()
  const [membershipRole, setMembershipRole] = useState<OrgRole | null | undefined>(cachedRole)

  useEffect(() => {
    let alive = true
    fetchMembershipRole().then(role => {
      if (alive) setMembershipRole(role)
    })
    return () => {
      alive = false
    }
  }, [])

  // Until the membership answer arrives, fall back to the profile mirror so the
  // sidebar doesn't flash empty — the mirror is kept in sync and is only wrong
  // in the cases the membership fetch then corrects.
  const mirror = profile?.role
  const role: UserRole | null =
    membershipRole !== undefined
      ? membershipRole
      : ORG_ROLES.includes(mirror as OrgRole)
        ? (mirror as OrgRole)
        : null

  return useMemo(() => {
    return {
      role,
      // roleAllows fails closed on null and lets the OWNER clear every gate
      // without being named in any list.
      isAdmin: roleAllows(role, ['admin']),
      isManager: role === 'manager',
      isAgent: role === 'agent',
      isViewer: role === 'viewer',

      canAccess: (requiredRoles: UserRole[]) => roleAllows(role, requiredRoles),

      canManageTeam: roleAllows(role, ['admin', 'manager']),
      canManageSettings: roleAllows(role, ['admin']),
      canViewFinancials: roleAllows(role, ['admin', 'manager']),
      canEditClients: roleAllows(role, ['admin', 'manager', 'agent']),
      canDeleteRecords: roleAllows(role, ['admin', 'manager']),
    }
  }, [role])
}

// Higher-order component for role-based rendering
interface WithRoleProps {
  children: React.ReactNode
  roles: UserRole[]
  fallback?: React.ReactNode
}

export function WithRole({ children, roles, fallback = null }: WithRoleProps) {
  const { canAccess } = useRole()

  if (!canAccess(roles)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

// Component to show content only to admins
export function AdminOnly({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return <WithRole roles={['admin']} fallback={fallback}>{children}</WithRole>
}

// Component to show content to admins and managers
export function ManagerOnly({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return <WithRole roles={['admin', 'manager']} fallback={fallback}>{children}</WithRole>
}

// Component to hide content from viewers
export function NotViewer({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return <WithRole roles={['admin', 'manager', 'agent']} fallback={fallback}>{children}</WithRole>
}
