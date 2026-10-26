'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/app/contexts/AuthContext'
import { Building2, Users, Mail, Loader2, Save, Trash2, Send, XCircle, CheckCircle, ShieldCheck, KeyRound } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useConfirm } from '@/components/ConfirmDialog'
import { useRole } from '@/hooks/useRole'

interface OrgInfo {
  id: string
  name: string
  created_at: string
  updated_at: string
  member_count: number
  /** Owners, administrators and managers must use two-factor (lib/auth/two-factor). */
  require_two_factor?: boolean
}

interface OrgMember {
  org_id: string
  user_id: string
  role: 'owner' | 'member'
  created_at: string
  user: {
    id: string
    full_name: string | null
    email: string
    role: string | null
    is_active: boolean | null
  }
  /** The login has two-factor set up; null = could not be read. */
  two_factor?: boolean | null | null
}

interface Invitation {
  id: string
  email: string
  role: string
  org_id: string
  accepted_at: string | null
  expires_at: string
  created_at: string
}

const ROLES = ['admin', 'manager', 'agent', 'viewer'] as const
type InviteRole = typeof ROLES[number]

export default function OrganizationSettingsPage() {
  const { user } = useAuth()
  const confirmDialog = useConfirm()

  const [org, setOrg] = useState<OrgInfo | null>(null)
  const [members, setMembers] = useState<OrgMember[]>([])
  const [pendingInvites, setPendingInvites] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Org name edit
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [savingName, setSavingName] = useState(false)

  // Invite form
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<InviteRole>('agent')
  const [sendingInvite, setSendingInvite] = useState(false)
  // Set when the invitation was created but its email could not be sent.
  const [inviteLink, setInviteLink] = useState<string | null>(null)

  // What the SERVER lets this person do, from their role in this company
  // (useRole — the active membership). The page used to show every action to
  // the owner alone, while the server lets any admin invite and cancel
  // invitations, and offered "Leave" to everyone though only an admin's
  // DELETE gets past middleware.
  //   rename                 owner   (PUT /api/organization; Company Profile
  //                                   applies the same rule)
  //   invite, cancel invite  admin, owner included (/api/invitations)
  //   remove someone else    owner   (/api/organization/members)
  //   leave                  admin, owner included — but never the last owner
  const { role, isAdmin } = useRole()
  const tf = useTranslations('twoFactor')
  const [savingTwoFactor, setSavingTwoFactor] = useState(false)
  const isOwner = role === 'owner'
  const ownerCount = members.filter(m => m.role === 'owner').length
  const canLeave = isAdmin && !(isOwner && ownerCount <= 1)

  useEffect(() => {
    void loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const [orgRes, membersRes, invitesRes] = await Promise.all([
        fetch('/api/organization').then(r => r.json()),
        fetch('/api/organization/members').then(r => r.json()),
        fetch('/api/invitations?status=pending').then(r => r.json()),
      ])

      if (orgRes?.success) {
        setOrg(orgRes.data)
        setNameDraft(orgRes.data?.name ?? '')
      }
      if (membersRes?.success) setMembers(membersRes.data ?? [])
      if (invitesRes?.success) setPendingInvites(invitesRes.data ?? [])
    } catch (err) {
      console.error('Error loading organization data:', err)
      setError('Failed to load organization data')
    } finally {
      setLoading(false)
    }
  }

  async function saveOrgName() {
    if (!nameDraft.trim()) return
    setSavingName(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/organization', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameDraft.trim() }),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to rename')
      setOrg(json.data)
      setEditingName(false)
      setSuccess('Organization name updated')
    } catch (err: any) {
      setError(err.message || 'Failed to rename organization')
    } finally {
      setSavingName(false)
    }
  }

  async function sendInvite() {
    if (!inviteEmail.trim() || !inviteEmail.includes('@')) {
      setError('Enter a valid email address')
      return
    }
    setSendingInvite(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
          invited_by: user?.id,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to send invitation')
      if (json.emailSent === false) {
        // The invitation exists and the link works — the mail did not go.
        // Say so, and hand over the link rather than reporting a send.
        setInviteLink(json.inviteUrl || null)
        setError(json.emailWarning || 'The invitation was created, but no email was sent.')
      } else {
        setInviteLink(null)
        setSuccess(`Invitation sent to ${inviteEmail.trim()}`)
        setInviteEmail('')
        setShowInvite(false)
      }
      await loadAll()
    } catch (err: any) {
      setError(err.message || 'Failed to send invitation')
    } finally {
      setSendingInvite(false)
    }
  }

  async function cancelInvite(id: string) {
    if (!(await confirmDialog('Cancel this invitation?'))) return
    try {
      const res = await fetch(`/api/invitations?id=${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to cancel')
      setSuccess('Invitation cancelled')
      await loadAll()
    } catch (err: any) {
      setError(err.message || 'Failed to cancel invitation')
    }
  }

  async function setRequireTwoFactor(next: boolean) {
    setSavingTwoFactor(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/organization', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ require_two_factor: next }),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || tf('saveFailed'))
      setOrg(o => (o ? { ...o, require_two_factor: json.data?.require_two_factor } : o))
      setSuccess(next ? tf('requireOn') : tf('requireOff'))
    } catch (err: any) {
      setError(err.message || tf('saveFailed'))
    } finally {
      setSavingTwoFactor(false)
    }
  }

  // The owner resets anyone else; an admin a manager, agent or viewer (the
  // route's rule, lib/auth/member-management mayManage).
  const mayResetTwoFactor = (m: OrgMember) =>
    m.two_factor === true && m.user_id !== user?.id && (isOwner || (isAdmin && ['manager', 'agent', 'viewer'].includes(m.role)))

  async function resetTwoFactor(m: OrgMember) {
    const label = m.user?.full_name || m.user?.email || ''
    if (!(await confirmDialog(tf('resetConfirm', { name: label })))) return
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/organization/members/${encodeURIComponent(m.user_id)}/two-factor`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || tf('resetFailed'))
      setSuccess(tf('resetDone', { name: label }))
      await loadAll()
    } catch (err: any) {
      setError(err.message || tf('resetFailed'))
    }
  }

  async function removeMember(userId: string) {
    const target = members.find(m => m.user_id === userId)
    const label = target?.user?.full_name || target?.user?.email || 'this member'
    if (!(await confirmDialog(`Remove ${label} from the organization?`))) return
    try {
      const res = await fetch(`/api/organization/members?user_id=${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to remove')
      setSuccess(`Removed ${label}`)
      await loadAll()
    } catch (err: any) {
      setError(err.message || 'Failed to remove member')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#647C47]" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-[#647C47]/10 flex items-center justify-center">
            <Building2 className="w-6 h-6 text-[#647C47]" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Organization</h1>
            <p className="text-sm text-gray-500">
              Manage your organization name, members, and pending invitations.
            </p>
          </div>
        </div>
      </header>

      {!isAdmin && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          You can see the members and invitations but not change them. Only the agency owner or an admin
          can invite people; only the owner can rename the organization or remove a member.
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-2">
          <XCircle className="w-5 h-5 flex-shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm flex items-start gap-2">
          <CheckCircle className="w-5 h-5 flex-shrink-0" /> {success}
        </div>
      )}
      {inviteLink && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          <p className="font-medium mb-1">Send this link to the person yourself</p>
          <p className="text-xs mb-2">
            The invitation is valid for 7 days. Opening it lets them set a password and sign in
            straight away.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-2 py-1 bg-white border border-amber-200 rounded text-xs break-all">
              {inviteLink}
            </code>
            <button
              onClick={() => { navigator.clipboard?.writeText(inviteLink).catch(() => {}) }}
              className="px-2 py-1 text-xs font-medium text-amber-900 border border-amber-300 rounded hover:bg-amber-100"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {/* Organization details */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Details</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Organization name
            </label>
            {editingName ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nameDraft}
                  onChange={e => setNameDraft(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  maxLength={200}
                  autoFocus
                />
                <button
                  onClick={saveOrgName}
                  disabled={savingName || !nameDraft.trim() || nameDraft === org?.name}
                  className="px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#4a5c35] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save
                </button>
                <button
                  onClick={() => { setEditingName(false); setNameDraft(org?.name ?? '') }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-gray-900 font-medium">{org?.name}</span>
                {isOwner && (
                  <button
                    onClick={() => setEditingName(true)}
                    className="text-sm text-[#647C47] hover:underline"
                  >
                    Rename
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-8 pt-2 text-sm text-gray-600">
            <div><Users className="w-4 h-4 inline mr-1" /> {org?.member_count ?? 0} members</div>
            <div><Mail className="w-4 h-4 inline mr-1" /> {pendingInvites.length} pending invites</div>
          </div>
        </div>
      </section>

      {/* Security — two-factor (lib/auth/two-factor) */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">{tf('securityTitle')}</h2>
        <p className="text-sm text-gray-500 mb-4">{tf('securityIntro')}</p>
        <label className={`flex items-start gap-3 ${isOwner ? 'cursor-pointer' : 'opacity-70'}`}>
          <input
            type="checkbox"
            className="mt-1 w-4 h-4 accent-[#647C47]"
            checked={org?.require_two_factor === true}
            disabled={!isOwner || savingTwoFactor}
            onChange={e => void setRequireTwoFactor(e.target.checked)}
          />
          <span>
            <span className="block text-sm font-medium text-gray-900">{tf('requireLabel')}</span>
            <span className="block text-xs text-gray-500">{isOwner ? tf('requireHint') : tf('requireOwnerOnly')}</span>
          </span>
          {savingTwoFactor && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        </label>
      </section>

      {/* Members */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Members</h2>
          {isAdmin && (
            <button
              onClick={() => setShowInvite(s => !s)}
              className="px-3 py-1.5 text-sm bg-[#647C47] text-white rounded-lg hover:bg-[#4a5c35] flex items-center gap-1"
            >
              <Send className="w-4 h-4" /> Invite
            </button>
          )}
        </div>

        {showInvite && isAdmin && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                placeholder="teammate@example.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
              />
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as InviteRole)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
              >
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <button
                onClick={sendInvite}
                disabled={sendingInvite}
                className="px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#4a5c35] disabled:opacity-50 flex items-center gap-1"
              >
                {sendingInvite ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="py-2 font-medium">Name</th>
                <th className="py-2 font-medium">Email</th>
                <th className="py-2 font-medium">Role</th>
                <th className="py-2 font-medium">Joined</th>
                <th className="py-2 font-medium">{tf('columnTitle')}</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.user_id} className="border-b border-gray-100">
                  <td className="py-3">{m.user?.full_name ?? '(no name)'}</td>
                  <td className="py-3 text-gray-600">{m.user?.email ?? ''}</td>
                  <td className="py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${
                      m.role === 'owner'
                        ? 'bg-[#647C47]/10 text-[#647C47]'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {m.role === 'owner' && <ShieldCheck className="w-3 h-3" />}
                      {m.role}
                    </span>
                  </td>
                  <td className="py-3 text-gray-500">
                    {new Date(m.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3">
                    {m.two_factor === true
                      ? <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-green-50 text-green-700"><ShieldCheck className="w-3 h-3" />{tf('on')}</span>
                      : m.two_factor === false
                        ? <span className="text-xs text-gray-400">{tf('off')}</span>
                        : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="py-3 text-right whitespace-nowrap">
                    {mayResetTwoFactor(m) && (
                      <button
                        onClick={() => void resetTwoFactor(m)}
                        className="text-gray-500 hover:text-amber-700 p-1"
                        title={tf('reset')}
                        aria-label={tf('reset')}
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                    )}
                    {(m.user_id === user?.id ? canLeave : isOwner) && (
                      <button
                        onClick={() => removeMember(m.user_id)}
                        className="text-red-600 hover:text-red-700 p-1"
                        title={m.user_id === user?.id ? 'Leave organization' : 'Remove from organization'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-gray-500">No members yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pending invitations */}
      {pendingInvites.length > 0 && (
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Pending invitations</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 font-medium">Email</th>
                  <th className="py-2 font-medium">Role</th>
                  <th className="py-2 font-medium">Sent</th>
                  <th className="py-2 font-medium">Expires</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {pendingInvites.map(inv => (
                  <tr key={inv.id} className="border-b border-gray-100">
                    <td className="py-3">{inv.email}</td>
                    <td className="py-3">{inv.role}</td>
                    <td className="py-3 text-gray-500">{new Date(inv.created_at).toLocaleDateString()}</td>
                    <td className="py-3 text-gray-500">{new Date(inv.expires_at).toLocaleDateString()}</td>
                    <td className="py-3 text-right">
                      {isAdmin && (
                        <button
                          onClick={() => cancelInvite(inv.id)}
                          className="text-red-600 hover:text-red-700 p-1"
                          title="Cancel invitation"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
