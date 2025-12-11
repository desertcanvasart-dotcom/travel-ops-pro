'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { 
  User, 
  Mail, 
  Bell, 
  Users, 
  CreditCard,
  Settings,
  Save,
  Loader2,
  Check,
  X,
  Plus,
  Trash2,
  Edit2,
  Eye,
  EyeOff,
  Globe,
  Clock,
  Camera,
  Link as LinkIcon,
  CheckCircle,
  AlertCircle,
  FileText,
  Send
} from 'lucide-react'

// ============================================
// TYPES
// ============================================

interface Profile {
  id: string
  full_name: string
  email: string
  phone?: string
  role?: string
  timezone?: string
  avatar_url?: string
  company_name?: string
  company_logo?: string
}

interface EmailSettings {
  gmail_connected: boolean
  gmail_email?: string
  signature?: string
  auto_reply_enabled: boolean
  auto_reply_message?: string
}

interface EmailTemplate {
  id: string
  name: string
  subject: string
  body: string
  category: string
  created_at: string
}

interface NotificationPreference {
  task_assigned: boolean
  task_due_soon: boolean
  task_overdue: boolean
  task_completed: boolean
  email_enabled: boolean
  in_app_enabled: boolean
}

interface TeamMember {
  id: string
  name: string
  email: string
  role: string
  phone?: string
  is_active: boolean
  created_at: string
}

// ============================================
// TAB CONFIGURATION
// ============================================

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'templates', label: 'Templates', icon: FileText },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'team', label: 'Team', icon: Users },
  // { id: 'billing', label: 'Billing', icon: CreditCard }, // Future
]

const TIMEZONES = [
  { value: 'Africa/Cairo', label: 'Cairo (EET, UTC+2)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'America/New_York', label: 'New York (EST/EDT)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
]

// ============================================
// MAIN COMPONENT
// ============================================

function SettingsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  
  const [activeTab, setActiveTab] = useState(tabParam || 'profile')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Data states
  const [profile, setProfile] = useState<Profile | null>(null)
  const [emailSettings, setEmailSettings] = useState<EmailSettings | null>(null)
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreference>({
    task_assigned: true,
    task_due_soon: true,
    task_overdue: true,
    task_completed: false,
    email_enabled: true,
    in_app_enabled: true
  })
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])

  // Update URL when tab changes
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId)
    router.push(`/settings?tab=${tabId}`, { scroll: false })
  }

  // Load data based on active tab
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setError(null)
      
      try {
        switch (activeTab) {
          case 'profile':
            await fetchProfile()
            break
          case 'email':
            await fetchEmailSettings()
            break
          case 'templates':
            await fetchTemplates()
            break
          case 'notifications':
            await fetchNotificationPrefs()
            break
          case 'team':
            await fetchTeamMembers()
            break
        }
      } catch (err) {
        console.error('Error loading data:', err)
        setError('Failed to load settings')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [activeTab])

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchProfile = async () => {
    try {
      const response = await fetch('/api/profile')
      if (response.ok) {
        const data = await response.json()
        setProfile(data.profile || data)
      }
    } catch (error) {
      console.error('Error fetching profile:', error)
    }
  }

  const fetchEmailSettings = async () => {
    try {
      const response = await fetch('/api/settings/email')
      if (response.ok) {
        const data = await response.json()
        setEmailSettings(data)
      } else {
        // Default settings if none exist
        setEmailSettings({
          gmail_connected: false,
          auto_reply_enabled: false
        })
      }
    } catch (error) {
      console.error('Error fetching email settings:', error)
      setEmailSettings({
        gmail_connected: false,
        auto_reply_enabled: false
      })
    }
  }

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/email-templates')
      if (response.ok) {
        const data = await response.json()
        setTemplates(data.templates || data.data || [])
      }
    } catch (error) {
      console.error('Error fetching templates:', error)
    }
  }

  const fetchNotificationPrefs = async () => {
    try {
      const response = await fetch('/api/settings/notifications')
      if (response.ok) {
        const data = await response.json()
        setNotificationPrefs(data)
      }
    } catch (error) {
      console.error('Error fetching notification prefs:', error)
    }
  }

  const fetchTeamMembers = async () => {
    try {
      const response = await fetch('/api/team-members')
      if (response.ok) {
        const data = await response.json()
        setTeamMembers(data.data || data.members || [])
      }
    } catch (error) {
      console.error('Error fetching team members:', error)
    }
  }

  // ============================================
  // SAVE HANDLERS
  // ============================================

  const saveProfile = async () => {
    if (!profile) return
    setSaving(true)
    setError(null)

    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      })

      if (response.ok) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      } else {
        throw new Error('Failed to save profile')
      }
    } catch (err) {
      setError('Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  const saveEmailSettings = async () => {
    if (!emailSettings) return
    setSaving(true)
    setError(null)

    try {
      const response = await fetch('/api/settings/email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailSettings)
      })

      if (response.ok) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      } else {
        throw new Error('Failed to save email settings')
      }
    } catch (err) {
      setError('Failed to save email settings')
    } finally {
      setSaving(false)
    }
  }

  const saveNotificationPrefs = async () => {
    setSaving(true)
    setError(null)

    try {
      const response = await fetch('/api/settings/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notificationPrefs)
      })

      if (response.ok) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      } else {
        throw new Error('Failed to save notification preferences')
      }
    } catch (err) {
      setError('Failed to save notification preferences')
    } finally {
      setSaving(false)
    }
  }

  // ============================================
  // RENDER TABS
  // ============================================

  const renderProfileTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900">Profile Information</h3>
        <p className="text-sm text-gray-500 mt-1">Update your personal information and preferences.</p>
      </div>

      {/* Avatar Section */}
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-full bg-primary-100 flex items-center justify-center overflow-hidden">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <User className="w-10 h-10 text-primary-600" />
          )}
        </div>
        <div>
          <button className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            Change Photo
          </button>
          <p className="text-xs text-gray-500 mt-1">JPG, PNG up to 2MB</p>
        </div>
      </div>

      {/* Form Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
          <input
            type="text"
            value={profile?.full_name || ''}
            onChange={(e) => setProfile(prev => prev ? { ...prev, full_name: e.target.value } : null)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
            placeholder="Your full name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={profile?.email || ''}
            onChange={(e) => setProfile(prev => prev ? { ...prev, email: e.target.value } : null)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
            placeholder="your@email.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input
            type="tel"
            value={profile?.phone || ''}
            onChange={(e) => setProfile(prev => prev ? { ...prev, phone: e.target.value } : null)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
            placeholder="+20 xxx xxx xxxx"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
          <input
            type="text"
            value={profile?.role || ''}
            onChange={(e) => setProfile(prev => prev ? { ...prev, role: e.target.value } : null)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
            placeholder="Admin, Manager, etc."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
          <select
            value={profile?.timezone || 'Africa/Cairo'}
            onChange={(e) => setProfile(prev => prev ? { ...prev, timezone: e.target.value } : null)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
          >
            {TIMEZONES.map(tz => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
          <input
            type="text"
            value={profile?.company_name || ''}
            onChange={(e) => setProfile(prev => prev ? { ...prev, company_name: e.target.value } : null)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
            placeholder="Travel2Egypt"
          />
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t border-gray-200">
        <button
          onClick={saveProfile}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )

  const renderEmailTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900">Email Settings</h3>
        <p className="text-sm text-gray-500 mt-1">Configure your email integration and preferences.</p>
      </div>

      {/* Gmail Connection Status */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              emailSettings?.gmail_connected ? 'bg-green-100' : 'bg-gray-200'
            }`}>
              <Mail className={`w-5 h-5 ${emailSettings?.gmail_connected ? 'text-green-600' : 'text-gray-500'}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Gmail Integration</p>
              <p className="text-xs text-gray-500">
                {emailSettings?.gmail_connected 
                  ? `Connected as ${emailSettings.gmail_email}`
                  : 'Not connected'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {emailSettings?.gmail_connected ? (
              <>
                <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full">
                  <CheckCircle className="w-3 h-3" />
                  Connected
                </span>
                <button className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  Disconnect
                </button>
              </>
            ) : (
              <button className="px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors">
                Connect Gmail
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Email Signature */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Email Signature</label>
        <textarea
          value={emailSettings?.signature || ''}
          onChange={(e) => setEmailSettings(prev => prev ? { ...prev, signature: e.target.value } : null)}
          rows={5}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
          placeholder="Best regards,&#10;Islam Hussein&#10;Travel2Egypt"
        />
        <p className="text-xs text-gray-500 mt-1">This signature will be added to all outgoing emails.</p>
      </div>

      {/* Auto Reply */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">Auto-Reply</p>
            <p className="text-xs text-gray-500">Automatically reply to incoming emails</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={emailSettings?.auto_reply_enabled || false}
              onChange={(e) => setEmailSettings(prev => prev ? { ...prev, auto_reply_enabled: e.target.checked } : null)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#647C47]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#647C47]"></div>
          </label>
        </div>

        {emailSettings?.auto_reply_enabled && (
          <textarea
            value={emailSettings?.auto_reply_message || ''}
            onChange={(e) => setEmailSettings(prev => prev ? { ...prev, auto_reply_message: e.target.value } : null)}
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
            placeholder="Thank you for your email. We will get back to you within 24 hours..."
          />
        )}
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t border-gray-200">
        <button
          onClick={saveEmailSettings}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )

  const renderTemplatesTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Email Templates</h3>
          <p className="text-sm text-gray-500 mt-1">Create and manage reusable email templates.</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors">
          <Plus className="w-4 h-4" />
          New Template
        </button>
      </div>

      {/* Templates List */}
      <div className="space-y-3">
        {templates.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 border border-dashed border-gray-300 rounded-lg">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No email templates yet</p>
            <p className="text-sm text-gray-400 mt-1">Create templates for common responses</p>
          </div>
        ) : (
          templates.map(template => (
            <div key={template.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-gray-900">{template.name}</h4>
                    <span className="px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-600 rounded">
                      {template.category}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Subject: {template.subject}</p>
                  <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{template.body}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button className="p-1.5 text-gray-400 hover:text-[#647C47] hover:bg-gray-100 rounded transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )

  const renderNotificationsTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900">Notification Preferences</h3>
        <p className="text-sm text-gray-500 mt-1">Choose how you want to receive notifications.</p>
      </div>

      {/* Delivery Methods */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-4">
        <h4 className="text-sm font-medium text-gray-900">Delivery Methods</h4>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Mail className="w-5 h-5 text-gray-500" />
            <div>
              <p className="text-sm font-medium text-gray-700">Email Notifications</p>
              <p className="text-xs text-gray-500">Receive notifications via email</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={notificationPrefs.email_enabled}
              onChange={(e) => setNotificationPrefs(prev => ({ ...prev, email_enabled: e.target.checked }))}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#647C47]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#647C47]"></div>
          </label>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-gray-500" />
            <div>
              <p className="text-sm font-medium text-gray-700">In-App Notifications</p>
              <p className="text-xs text-gray-500">Show notifications in the app</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={notificationPrefs.in_app_enabled}
              onChange={(e) => setNotificationPrefs(prev => ({ ...prev, in_app_enabled: e.target.checked }))}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#647C47]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#647C47]"></div>
          </label>
        </div>
      </div>

      {/* Notification Types */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-900">Task Notifications</h4>
        
        {[
          { key: 'task_assigned', label: 'Task Assigned', desc: 'When a task is assigned to you', icon: '📋' },
          { key: 'task_due_soon', label: 'Task Due Soon', desc: 'Reminder 24 hours before due date', icon: '⏰' },
          { key: 'task_overdue', label: 'Task Overdue', desc: 'When a task passes its due date', icon: '🚨' },
          { key: 'task_completed', label: 'Task Completed', desc: 'When a task you created is completed', icon: '✅' },
        ].map(item => (
          <div key={item.key} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
            <div className="flex items-center gap-3">
              <span className="text-lg">{item.icon}</span>
              <div>
                <p className="text-sm font-medium text-gray-700">{item.label}</p>
                <p className="text-xs text-gray-500">{item.desc}</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notificationPrefs[item.key as keyof NotificationPreference] as boolean}
                onChange={(e) => setNotificationPrefs(prev => ({ ...prev, [item.key]: e.target.checked }))}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#647C47]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#647C47]"></div>
            </label>
          </div>
        ))}
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t border-gray-200">
        <button
          onClick={saveNotificationPrefs}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )

  const renderTeamTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Team Members</h3>
          <p className="text-sm text-gray-500 mt-1">Manage your team and their roles.</p>
        </div>
        <button 
          onClick={() => router.push('/team-members/new')}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Member
        </button>
      </div>

      {/* Team List */}
      <div className="space-y-3">
        {teamMembers.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 border border-dashed border-gray-300 rounded-lg">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No team members yet</p>
            <p className="text-sm text-gray-400 mt-1">Add team members to assign tasks</p>
          </div>
        ) : (
          teamMembers.map(member => (
            <div key={member.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                    <User className="w-5 h-5 text-primary-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium text-gray-900">{member.name}</h4>
                      {!member.is_active && (
                        <span className="px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 rounded">
                          Inactive
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-2 py-1 text-xs font-medium bg-[#647C47]/10 text-[#647C47] rounded">
                    {member.role}
                  </span>
                  <button 
                    onClick={() => router.push(`/team-members/${member.id}`)}
                    className="p-1.5 text-gray-400 hover:text-[#647C47] hover:bg-gray-100 rounded transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
          <Settings className="w-5 h-5 text-gray-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500">Manage your account and preferences</p>
        </div>
      </div>

      {/* Success Toast */}
      {saveSuccess && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 text-green-700 rounded-lg shadow-lg animate-in slide-in-from-top">
          <CheckCircle className="w-5 h-5" />
          <span className="text-sm font-medium">Settings saved successfully!</span>
        </div>
      )}

      {/* Error Toast */}
      {error && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg shadow-lg">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm font-medium">{error}</span>
          <button onClick={() => setError(null)} className="ml-2 p-1 hover:bg-red-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Content Card */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex overflow-x-auto">
            {TABS.map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`
                    flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors
                    ${isActive 
                      ? 'border-[#647C47] text-[#647C47]' 
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-[#647C47] animate-spin" />
            </div>
          ) : (
            <>
              {activeTab === 'profile' && renderProfileTab()}
              {activeTab === 'email' && renderEmailTab()}
              {activeTab === 'templates' && renderTemplatesTab()}
              {activeTab === 'notifications' && renderNotificationsTab()}
              {activeTab === 'team' && renderTeamTab()}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================
// EXPORT WITH SUSPENSE BOUNDARY
// ============================================

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 text-[#647C47] animate-spin" />
      </div>
    }>
      <SettingsContent />
    </Suspense>
  )
}