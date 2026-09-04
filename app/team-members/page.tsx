'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  X,
  User,
  Mail,
  Phone,
  Shield,
  CheckCircle,
  XCircle,
  Users,
  KeyRound
} from 'lucide-react'
import { useConfirm } from '@/components/ConfirmDialog'
import { useAuth } from '@/app/contexts/AuthContext'

interface Department {
  id: string
  name: string
}

interface TeamMember {
  id: string
  name: string
  email: string
  phone: string
  role: string
  department_id: string | null
  department: Department | null
  notes: string
  is_active: boolean
  created_at: string
  updated_at: string
}

const ROLES = [
  { value: 'owner', label: 'Owner', icon: '👑', color: 'bg-purple-100 text-purple-700' },
  { value: 'manager', label: 'Manager', icon: '💼', color: 'bg-blue-100 text-blue-700' },
  { value: 'coordinator', label: 'Coordinator', icon: '📋', color: 'bg-green-100 text-green-700' },
  { value: 'sales', label: 'Sales', icon: '💰', color: 'bg-amber-100 text-amber-700' },
  { value: 'guide', label: 'Tour Guide', icon: '👨‍🏫', color: 'bg-cyan-100 text-cyan-700' },
  { value: 'driver', label: 'Driver', icon: '🚗', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'staff', label: 'Staff', icon: '👤', color: 'bg-gray-100 text-gray-700' }
]

export default function TeamMembersPage() {
  const t = useTranslations('teamMembers')
  const confirmDialog = useConfirm()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null)
  const [departments, setDepartments] = useState<Department[]>([])
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'staff',
    department_id: '',
    notes: ''
  })
  const [saving, setSaving] = useState(false)

  // ---- Bridge to User Management ----
  // Team members are the operational roster (assignment/routing) and have no
  // login of their own. This block shows, per member, whether their email
  // already has system access or a pending invitation — and lets an admin
  // send the invitation right from the roster card.
  const { profile } = useAuth()
  const [userEmails, setUserEmails] = useState<Set<string>>(new Set())
  const [pendingInviteEmails, setPendingInviteEmails] = useState<Set<string>>(new Set())
  const [inviteTarget, setInviteTarget] = useState<TeamMember | null>(null)
  const [inviteRole, setInviteRole] = useState('agent')
  // Set when the invitation was created but its email could not be sent.
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [invitingNow, setInvitingNow] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  const fetchAccessStatus = async () => {
    try {
      const [profilesRes, invitesRes] = await Promise.all([
        fetch('/api/profiles'),
        fetch('/api/invitations?status=pending'),
      ])
      if (profilesRes.ok) {
        const body = await profilesRes.json()
        setUserEmails(new Set(
          (body.data || []).map((p: any) => (p.email || '').toLowerCase()).filter(Boolean)
        ))
      }
      if (invitesRes.ok) {
        const body = await invitesRes.json()
        setPendingInviteEmails(new Set(
          (body.data || []).map((i: any) => (i.email || '').toLowerCase()).filter(Boolean)
        ))
      }
    } catch {
      // status chips are a convenience; the roster itself must still render
    }
  }

  const handleSendInvite = async () => {
    if (!inviteTarget?.email) return
    setInvitingNow(true)
    setInviteError(null)
    try {
      const res = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteTarget.email,
          role: inviteRole,
          invited_by: profile?.id,
        }),
      })
      const body = await res.json()
      if (res.ok && body.success !== false) {
        setPendingInviteEmails(prev => new Set(prev).add(inviteTarget.email!.toLowerCase()))
        if (body.emailSent === false) {
          // Created, but the mail did not go — keep the dialog open and hand
          // over the link instead of implying an email arrived.
          setInviteLink(body.inviteUrl || null)
          setInviteError(body.emailWarning || null)
        } else {
          setInviteTarget(null)
        }
      } else {
        setInviteError(body.error || t('inviteFailed'))
      }
    } catch {
      setInviteError(t('inviteFailed'))
    } finally {
      setInvitingNow(false)
    }
  }

  const accessStatus = (member: TeamMember): 'user' | 'invited' | 'none' => {
    const email = (member.email || '').toLowerCase()
    if (!email) return 'none'
    if (userEmails.has(email)) return 'user'
    if (pendingInviteEmails.has(email)) return 'invited'
    return 'none'
  }

  useEffect(() => {
    fetchMembers()
    fetchDepartments()
  }, [showInactive])

  useEffect(() => {
    fetchAccessStatus()
  }, [])

  const fetchDepartments = async () => {
    try {
      const response = await fetch('/api/departments')
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setDepartments(result.data)
        }
      }
    } catch (error) {
      console.error('Error fetching departments:', error)
    }
  }

  const fetchMembers = async () => {
    try {
      const params = new URLSearchParams()
      if (!showInactive) params.append('active', 'true')
      
      const response = await fetch(`/api/team-members?${params}`)
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setMembers(result.data)
        }
      }
    } catch (error) {
      console.error('Error fetching team members:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const url = editingMember 
        ? `/api/team-members/${editingMember.id}`
        : '/api/team-members'
      
      const response = await fetch(url, {
        method: editingMember ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        setShowModal(false)
        setEditingMember(null)
        resetForm()
        fetchMembers()
      }
    } catch (error) {
      console.error('Error saving team member:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (member: TeamMember) => {
    setEditingMember(member)
    setFormData({
      name: member.name || '',
      email: member.email || '',
      phone: member.phone || '',
      role: member.role || 'staff',
      department_id: member.department_id || '',
      notes: member.notes || ''
    })
    setShowModal(true)
  }

  const handleDelete = async (member: TeamMember) => {
    if (!(await confirmDialog(t('confirmDeactivate', { name: member.name })))) return

    try {
      const response = await fetch(`/api/team-members/${member.id}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        fetchMembers()
      }
    } catch (error) {
      console.error('Error deleting team member:', error)
    }
  }

  const handleReactivate = async (member: TeamMember) => {
    try {
      const response = await fetch(`/api/team-members/${member.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: true })
      })
      if (response.ok) {
        fetchMembers()
      }
    } catch (error) {
      console.error('Error reactivating team member:', error)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      role: 'staff',
      department_id: '',
      notes: ''
    })
  }

  const openAddModal = () => {
    setEditingMember(null)
    resetForm()
    setShowModal(true)
  }

  const getRoleConfig = (role: string) => {
    return ROLES.find(r => r.value === role) || ROLES[ROLES.length - 1]
  }

  const filteredMembers = members.filter(member => {
    const matchesSearch = 
      member.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.email?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesRole = !roleFilter || member.role === roleFilter
    return matchesSearch && matchesRole
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#647C47]"></div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-lg">
            👥
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{t('title')}</h1>
            <p className="text-sm text-gray-500">{t('subtitle')}</p>
          </div>
        </div>

        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[#647C47] text-white rounded-lg hover:bg-[#4f6238] transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t('addMember')}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-gray-400" />
            <span className="text-xs text-gray-500">{t('totalMembers')}</span>
          </div>
          <p className="text-2xl font-semibold text-gray-900">{members.filter(m => m.is_active).length}</p>
        </div>
        {ROLES.slice(0, 3).map(role => {
          const count = members.filter(m => m.role === role.value && m.is_active).length
          return (
            <div key={role.value} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span>{role.icon}</span>
                <span className="text-xs text-gray-500">{t(`role${role.value.charAt(0).toUpperCase() + role.value.slice(1)}s`)}</span>
              </div>
              <p className="text-2xl font-semibold text-gray-900">{count}</p>
            </div>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-3 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47]"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
        >
          <option value="">{t('allRoles')}</option>
          {ROLES.map(role => (
            <option key={role.value} value={role.value}>{role.icon} {t(`role${role.value.charAt(0).toUpperCase() + role.value.slice(1)}`)}</option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-gray-300 text-[#647C47] focus:ring-[#647C47]"
          />
          {t('showInactive')}
        </label>
      </div>

      {/* Team Members Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filteredMembers.length === 0 ? (
          <div className="col-span-full bg-white border border-gray-200 rounded-lg p-8 text-center">
            <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">{t('noMembersFound')}</p>
            <button
              onClick={openAddModal}
              className="mt-3 text-sm text-[#647C47] hover:underline"
            >
              {t('addFirstMember')}
            </button>
          </div>
        ) : (
          filteredMembers.map(member => {
            const roleConfig = getRoleConfig(member.role)
            return (
              <div 
                key={member.id} 
                className={`bg-white border rounded-lg p-3 ${member.is_active ? 'border-gray-200' : 'border-gray-200 opacity-60'}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 shrink-0 bg-gray-100 rounded-full flex items-center justify-center text-base">
                      {roleConfig.icon}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">{member.name}</h3>
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${roleConfig.color}`}>
                          {t(`role${member.role.charAt(0).toUpperCase() + member.role.slice(1)}`)}
                        </span>
                        {member.department?.name && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">
                            {member.department.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {member.is_active ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </div>

                <div className="space-y-1 mb-2">
                  {member.email && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      <Mail className="h-3 w-3 shrink-0 text-gray-400" />
                      <span className="truncate">{member.email}</span>
                    </div>
                  )}
                  {member.phone && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      <Phone className="h-3 w-3 shrink-0 text-gray-400" />
                      <span>{member.phone}</span>
                    </div>
                  )}
                  {member.email && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <KeyRound className="h-3 w-3 shrink-0 text-gray-400" />
                      {accessStatus(member) === 'user' && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                          {t('systemUser')}
                        </span>
                      )}
                      {accessStatus(member) === 'invited' && (
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                          {t('invitationSent')}
                        </span>
                      )}
                      {accessStatus(member) === 'none' && (
                        <button
                          onClick={() => { setInviteTarget(member); setInviteRole('agent'); setInviteError(null) }}
                          className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                        >
                          {t('inviteToSystem')}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {member.notes && (
                  <p className="text-xs text-gray-500 mb-2 line-clamp-1">{member.notes}</p>
                )}

                <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                  <button
                    onClick={() => handleEdit(member)}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded transition-colors"
                  >
                    <Edit2 className="h-3 w-3" />
                    {t('edit')}
                  </button>
                  {member.is_active ? (
                    <button
                      onClick={() => handleDelete(member)}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                      {t('deactivate')}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleReactivate(member)}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50 rounded transition-colors"
                    >
                      <CheckCircle className="h-3 w-3" />
                      {t('reactivate')}
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingMember ? t('editTeamMember') : t('addTeamMember')}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('name')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  placeholder="John Doe"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('email')}</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  placeholder="john@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('phone')}</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  placeholder="+20 100 123 4567"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('role')}</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
                >
                  {ROLES.map(role => (
                    <option key={role.value} value={role.value}>{role.icon} {t(`role${role.value.charAt(0).toUpperCase() + role.value.slice(1)}`)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('department')}</label>
                <select
                  value={formData.department_id}
                  onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
                >
                  <option value="">{t('noDepartment')}</option>
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('notes')}</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  rows={3}
                  placeholder="Additional notes..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors disabled:opacity-50"
                >
                  {saving ? t('saving') : editingMember ? t('update') : t('addMember')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center pt-4">
        <p className="text-xs text-gray-400">© {new Date().getFullYear()} Autoura Operations System</p>
      </div>
      {/* Invite-to-system dialog (bridge to User Management) */}
      {inviteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-1">{t('inviteDialogTitle')}</h3>
            <p className="text-sm text-gray-600 mb-4">
              {inviteTarget.name} · {inviteTarget.email}
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('systemRole')}</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3"
            >
              <option value="agent">{t('sysRoleAgent')}</option>
              <option value="manager">{t('sysRoleManager')}</option>
              <option value="admin">{t('sysRoleAdmin')}</option>
              <option value="viewer">{t('sysRoleViewer')}</option>
            </select>
            {inviteError && <p className="text-sm text-red-600 mb-3">{inviteError}</p>}
            {inviteLink && (
              <div className="mb-3 p-2 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-xs text-amber-900 mb-1">Send this link to them yourself:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-2 py-1 bg-white border border-amber-200 rounded text-[11px] break-all">
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
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setInviteTarget(null)}
                disabled={invitingNow}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleSendInvite}
                disabled={invitingNow}
                className="px-3 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {invitingNow ? t('sending') : t('sendInvitation')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}