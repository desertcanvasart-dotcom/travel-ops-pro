'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import {
  FileText,
  Plus,
  Search,
  Mail,
  MessageSquare,
  Users,
  Building2,
  Briefcase,
  Edit2,
  Trash2,
  Copy,
  Send,
  ChevronDown,
  Loader2,
  Check,
  X,
  Eye,
  Sparkles,
  Ship,
  Car,
  Hotel,
  User
} from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'

// ============================================
// TYPES
// ============================================

interface Template {
  id: string
  name: string
  description: string
  category: 'customer' | 'partner' | 'supplier' | 'internal'
  subcategory: string
  channel: 'email' | 'whatsapp' | 'both'
  subject?: string
  body: string
  placeholders: string[]
  is_active: boolean
  usage_count: number
  last_used_at: string | null
  created_at: string
}

interface Placeholder {
  placeholder: string
  display_name: string
  description: string
  category: string
  example_value: string
}

interface Recipient {
  id: string
  name: string
  email?: string
  phone?: string
  type: 'client' | 'hotel' | 'cruise' | 'transport' | 'guide'
}

// ============================================
// CONSTANTS
// ============================================

const CATEGORY_IDS = [
  { id: 'all', icon: FileText },
  { id: 'customer', icon: Users },
  { id: 'partner', icon: Building2 },
  { id: 'supplier', icon: Car },
  { id: 'internal', icon: Briefcase },
]

const CHANNEL_IDS = [
  { id: 'all', icon: null },
  { id: 'email', icon: Mail },
  { id: 'whatsapp', icon: MessageSquare },
  { id: 'both', icon: Sparkles },
]

// Map subcategories to partner/supplier types
const SUBCATEGORY_TO_PARTNER_TYPE: Record<string, string> = {
  // Partner (B2B)
  rate_request: 'hotel',
  booking_request: 'hotel',
  cruise_hold: 'cruise',
  // Supplier
  hotel_reservation: 'hotel',
  transport_booking: 'transport',
  guide_assignment: 'guide',
  cruise_booking: 'cruise',
  service_order: 'supplier',
  confirmation_request: 'supplier',
  payment_notice: 'supplier',
  amendment: 'supplier',
  cancellation: 'supplier',
  // Internal
  transport: 'transport',
  guide_booking: 'guide',
}

// ============================================
// COMPONENT
// ============================================

export default function TemplatesPage() {
  const t = useTranslations('templates')
  const dialog = useConfirmDialog()
  const [templates, setTemplates] = useState<Template[]>([])
  const [placeholders, setPlaceholders] = useState<Placeholder[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedChannel, setSelectedChannel] = useState('all')
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [showSendModal, setShowSendModal] = useState(false)
  const [showDropdown, setShowDropdown] = useState<string | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  
  // Form states
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'customer' as const,
    subcategory: '',
    channel: 'email' as const,
    subject: '',
    body: '',
  })
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  // ============================================
  // DATA FETCHING
  // ============================================

  useEffect(() => {
    fetchTemplates()
    fetchPlaceholders()
  }, [])

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/templates')
      if (response.ok) {
        const result = await response.json()
        
        let templateData = []
        if (Array.isArray(result)) {
          templateData = result
        } else if (result.data && Array.isArray(result.data)) {
          templateData = result.data
        } else if (result.success && Array.isArray(result.data)) {
          templateData = result.data
        }
        
        setTemplates(templateData)
      }
    } catch (error) {
      console.error('Error fetching templates:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPlaceholders = async () => {
    try {
      const response = await fetch('/api/templates/placeholders')
      if (response.ok) {
        const data = await response.json()
        setPlaceholders(data.data || [])
      }
    } catch (error) {
      console.error('Error fetching placeholders:', error)
    }
  }

  // ============================================
  // FILTERING
  // ============================================

  const filteredTemplates = templates.filter(template => {
    const searchLower = searchQuery.toLowerCase()
    const matchesSearch = !searchQuery || 
      template.name?.toLowerCase().includes(searchLower) ||
      template.description?.toLowerCase().includes(searchLower) ||
      template.body?.toLowerCase().includes(searchLower)
    
    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory
    
    let matchesChannel = selectedChannel === 'all'
    if (!matchesChannel) {
      if (selectedChannel === 'email') {
        matchesChannel = template.channel === 'email' || template.channel === 'both'
      } else if (selectedChannel === 'whatsapp') {
        matchesChannel = template.channel === 'whatsapp' || template.channel === 'both'
      } else if (selectedChannel === 'both') {
        matchesChannel = template.channel === 'both'
      }
    }
    
    return matchesSearch && matchesCategory && matchesChannel
  })

  // ============================================
  // ACTIONS
  // ============================================

  const handleCopy = async (template: Template) => {
    const text = template.channel === 'email' 
      ? `Subject: ${template.subject}\n\n${template.body}`
      : template.body
    
    await navigator.clipboard.writeText(text)
    setCopied(template.id)
    setTimeout(() => setCopied(null), 2000)
    
    fetch(`/api/templates/${template.id}/use`, { method: 'POST' })
  }

  const handlePreview = (template: Template) => {
    setSelectedTemplate(template)
    setShowPreviewModal(true)
  }

  const handleSend = (template: Template) => {
    setSelectedTemplate(template)
    setShowSendModal(true)
  }

  const handleEdit = (template: Template) => {
    setFormData({
      name: template.name,
      description: template.description || '',
      category: template.category as any,
            subcategory: template.subcategory || '',
            channel: template.channel as any,
      subject: template.subject || '',
      body: template.body,
    })
    setSelectedTemplate(template)
    setShowCreateModal(true)
  }

  const handleDelete = async (template: Template) => {
    const confirmed = await dialog.confirmDelete(template.name)
    if (!confirmed) return

    try {
      const response = await fetch(`/api/templates/${template.id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setTemplates(templates.filter(t => t.id !== template.id))
      }
    } catch (error) {
      console.error('Error deleting template:', error)
    }
  }

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    
    try {
      const url = selectedTemplate 
        ? `/api/templates/${selectedTemplate.id}`
        : '/api/templates'
      
      const response = await fetch(url, {
        method: selectedTemplate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      
      if (response.ok) {
        fetchTemplates()
        setShowCreateModal(false)
        setSelectedTemplate(null)
        setFormData({
          name: '',
          description: '',
          category: 'customer',
          subcategory: '',
          channel: 'email',
          subject: '',
          body: '',
        })
      }
    } catch (error) {
      console.error('Error saving template:', error)
    } finally {
      setSaving(false)
    }
  }

  // ============================================
  // RENDER HELPERS
  // ============================================

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'email': return <Mail className="w-4 h-4" />
      case 'whatsapp': return <MessageSquare className="w-4 h-4" />
      case 'both': return <Sparkles className="w-4 h-4" />
      default: return null
    }
  }

  const getChannelColor = (channel: string) => {
    switch (channel) {
      case 'email': return 'bg-blue-100 text-blue-700'
      case 'whatsapp': return 'bg-green-100 text-green-700'
      case 'both': return 'bg-purple-100 text-purple-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'customer': return 'bg-emerald-100 text-emerald-700'
      case 'partner': return 'bg-amber-100 text-amber-700'
      case 'supplier': return 'bg-blue-100 text-blue-700'
      case 'internal': return 'bg-slate-100 text-slate-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  // ============================================
  // RENDER
  // ============================================

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-[#647C47] animate-spin" />
        <span className="sr-only">{t('loading')}</span>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t('title')}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('subtitle', { filtered: filteredTemplates.length, total: templates.length })}
          </p>
        </div>
        <button
          onClick={() => {
            setSelectedTemplate(null)
            setFormData({
              name: '',
              description: '',
              category: 'customer',
              subcategory: '',
              channel: 'email',
              subject: '',
              body: '',
            })
            setShowCreateModal(true)
          }}
          className="flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#4f6339] transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t('newTemplate')}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 space-y-3">
        {/* Row 1: Search + Category Filter */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
            />
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {CATEGORY_IDS.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <cat.icon className="w-4 h-4" />
                {t(`categories.${cat.id}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Channel Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{t('channel')}:</span>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {CHANNEL_IDS.map((ch) => (
              <button
                key={ch.id}
                onClick={() => setSelectedChannel(ch.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                  selectedChannel === ch.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {ch.icon && <ch.icon className="w-4 h-4" />}
                {t(`channels.${ch.id}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Templates Grid */}
      {filteredTemplates.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">{t('empty.noTemplates')}</p>
          <p className="text-sm text-gray-400 mt-1">{t('empty.tryAdjusting')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-md hover:border-gray-300 transition-all group"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 text-sm truncate">{template.name}</h3>
                </div>
                <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${getChannelColor(template.channel)}`}>
                  {getChannelIcon(template.channel)}
                </span>
              </div>

              {/* Preview */}
              <div className="bg-gray-50 rounded p-2 mb-2 text-xs text-gray-600 line-clamp-2 font-mono leading-relaxed h-[40px] overflow-hidden">
                {template.body.substring(0, 80)}...
              </div>

              {/* Tags */}
              <div className="flex items-center gap-1.5 mb-2">
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${getCategoryColor(template.category)}`}>
                  {t(`categories.${template.category}`)}
                </span>
                <span className="text-[10px] text-gray-400 uppercase">
                  {template.subcategory}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 pt-2 border-t border-gray-100">
                <button
                  onClick={() => handleCopy(template)}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                  title={t('actions.copyToClipboard')}
                >
                  {copied === template.id ? (
                    <Check className="w-3 h-3 text-green-600" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
                <button
                  onClick={() => handlePreview(template)}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                  title={t('actions.preview')}
                >
                  <Eye className="w-3 h-3" />
                </button>
                <button
                  onClick={() => handleSend(template)}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-white bg-[#647C47] hover:bg-[#4f6339] rounded transition-colors ml-auto"
                >
                  <Send className="w-3 h-3" />
                  {t('actions.send')}
                </button>
                <div className="relative">
                  <button
                    onClick={() => setShowDropdown(showDropdown === template.id ? null : template.id)}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  {showDropdown === template.id && (
                    <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10 min-w-[100px]">
                      <button
                        onClick={() => { handleEdit(template); setShowDropdown(null); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        <Edit2 className="w-3 h-3" />
                        {t('actions.edit')}
                      </button>
                      <button
                        onClick={() => { handleDelete(template); setShowDropdown(null); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-3 h-3" />
                        {t('actions.delete')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {selectedTemplate ? t('modal.editTemplate') : t('modal.newTemplate')}
              </h2>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('modal.name')}</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('modal.category')}</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  >
                    <option value="customer">{t('categories.customer')}</option>
                    <option value="partner">{t('modal.partnerB2B')}</option>
                    <option value="supplier">{t('categories.supplier')}</option>
                    <option value="internal">{t('categories.internal')}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('modal.channelLabel')}</label>
                  <select
                    value={formData.channel}
                    onChange={(e) => setFormData({ ...formData, channel: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  >
                    <option value="email">{t('channels.email')}</option>
                    <option value="whatsapp">{t('channels.whatsapp')}</option>
                    <option value="both">{t('channels.both')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('modal.subcategory')}</label>
                  <input
                    type="text"
                    value={formData.subcategory}
                    onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                    placeholder={t('modal.subcategoryPlaceholder')}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('modal.description')}</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  placeholder={t('modal.descriptionPlaceholder')}
                />
              </div>

              {(formData.channel === 'email' || formData.channel === 'both') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('modal.subjectEmail')}</label>
                  <input
                    type="text"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                    placeholder={t('modal.subjectPlaceholder')}
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('modal.body')}</label>
                <textarea
                  value={formData.body}
                  onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] font-mono text-sm"
                  rows={12}
                  placeholder={t('modal.bodyPlaceholder')}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  {t('modal.placeholderHint')}
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  {t('modal.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#4f6339] transition-colors disabled:opacity-50"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {selectedTemplate ? t('modal.updateTemplate') : t('modal.createTemplate')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreviewModal && selectedTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{selectedTemplate.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${getCategoryColor(selectedTemplate.category)}`}>
                    {t(`categories.${selectedTemplate.category}`)}
                  </span>
                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${getChannelColor(selectedTemplate.channel)}`}>
                    {getChannelIcon(selectedTemplate.channel)}
                    {t(`channels.${selectedTemplate.channel}`)}
                  </span>
                </div>
              </div>
              <button onClick={() => setShowPreviewModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {selectedTemplate.subject && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-500 mb-1">{t('preview.subject')}</label>
                  <div className="p-3 bg-gray-50 rounded-lg text-gray-900">{selectedTemplate.subject}</div>
                </div>
              )}

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-500 mb-1">{t('preview.body')}</label>
                <div className="p-4 bg-gray-50 rounded-lg whitespace-pre-wrap font-mono text-sm text-gray-800">
                  {selectedTemplate.body}
                </div>
              </div>

              {selectedTemplate.placeholders && selectedTemplate.placeholders.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-2">{t('preview.placeholdersUsed')}</label>
                  <div className="flex flex-wrap gap-2">
                    {selectedTemplate.placeholders.map((ph) => (
                      <span key={ph} className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-mono">
                        {ph}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => handleCopy(selectedTemplate)}
                className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <Copy className="w-4 h-4" />
                {t('actions.copy')}
              </button>
              <button
                onClick={() => {
                  setShowPreviewModal(false)
                  handleSend(selectedTemplate)
                }}
                className="flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#4f6339] transition-colors"
              >
                <Send className="w-4 h-4" />
                {t('preview.sendThisTemplate')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Modal */}
      {showSendModal && selectedTemplate && (
        <SendTemplateModal
          template={selectedTemplate}
          onClose={() => setShowSendModal(false)}
          placeholders={placeholders}
        />
      )}
    </div>
  )
}

// ============================================
// SEND TEMPLATE MODAL - UPDATED WITH PARTNER SUPPORT
// ============================================

interface SendTemplateModalProps {
  template: Template
  onClose: () => void
  placeholders: Placeholder[]
}

function SendTemplateModal({ template, onClose, placeholders }: SendTemplateModalProps) {
  const t = useTranslations('templates')
  const dialog = useConfirmDialog()
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(null)
  const [filledValues, setFilledValues] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [channel, setChannel] = useState<'email' | 'whatsapp'>(
    template.channel === 'both' ? 'whatsapp' : template.channel
  )

  // Determine recipient type based on template
  const isPartnerTemplate = template.category === 'partner'  // B2B partners (travel agencies)
  const isSupplierTemplate = template.category === 'supplier'  // Service providers (hotels, transport, guides)
  const supplierType = SUBCATEGORY_TO_PARTNER_TYPE[template.subcategory] || 'supplier'

  const getRecipientLabel = () => {
    if (isPartnerTemplate) return t('send.selectB2BPartner')
    if (!isSupplierTemplate) return t('send.selectClient')
    switch (supplierType) {
      case 'hotel': return t('send.selectHotel')
      case 'cruise': return t('send.selectCruise')
      case 'transport': return t('send.selectTransport')
      case 'guide': return t('send.selectGuide')
      default: return t('send.selectSupplier')
    }
  }

  const getRecipientIcon = () => {
    if (isPartnerTemplate) return <Building2 className="w-4 h-4" />
    if (!isSupplierTemplate) return <User className="w-4 h-4" />
    switch (supplierType) {
      case 'hotel': return <Hotel className="w-4 h-4" />
      case 'cruise': return <Ship className="w-4 h-4" />
      case 'transport': return <Car className="w-4 h-4" />
      case 'guide': return <User className="w-4 h-4" />
      default: return <Building2 className="w-4 h-4" />
    }
  }

  useEffect(() => {
    fetchRecipients()
  }, [])

  useEffect(() => {
    // Auto-fill from selected recipient
    if (selectedRecipient) {
      const values: Record<string, string> = {}

      if (isPartnerTemplate) {
        // B2B Partner placeholders (travel agencies)
        values['{{PartnerName}}'] = selectedRecipient.name || ''
        values['{{PartnerCompany}}'] = selectedRecipient.name || ''
        values['{{PartnerEmail}}'] = selectedRecipient.email || ''
        values['{{PartnerPhone}}'] = selectedRecipient.phone || ''
        values['{{ContactName}}'] = selectedRecipient.name || ''
      } else if (isSupplierTemplate) {
        // Supplier placeholders (hotels, transport, guides, etc.)
        values['{{ProviderName}}'] = selectedRecipient.name || ''
        values['{{HotelName}}'] = selectedRecipient.name || ''
        values['{{CruiseName}}'] = selectedRecipient.name || ''
        values['{{SupplierName}}'] = selectedRecipient.name || ''
        values['{{GuideName}}'] = selectedRecipient.name || ''
        values['{{SupplierEmail}}'] = selectedRecipient.email || ''
        values['{{SupplierPhone}}'] = selectedRecipient.phone || ''
        values['{{SupplierWhatsApp}}'] = selectedRecipient.phone || ''
        values['{{ContactName}}'] = selectedRecipient.name || ''
      } else {
        // Client placeholders
        values['{{GuestName}}'] = selectedRecipient.name || ''
        values['{{ClientName}}'] = selectedRecipient.name || ''
        values['{{ClientPhone}}'] = selectedRecipient.phone || ''
        values['{{ClientEmail}}'] = selectedRecipient.email || ''
      }

      setFilledValues(prev => ({ ...prev, ...values }))
    }
  }, [selectedRecipient, isPartnerTemplate, isSupplierTemplate])

  useEffect(() => {
    // Generate preview
    let text = template.body
    Object.entries(filledValues).forEach(([key, value]) => {
      text = text.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value || key)
    })
    setPreview(text)
  }, [filledValues, template.body])

  const fetchRecipients = async () => {
    setLoading(true)
    try {
      let endpoint = '/api/clients?limit=100'

      if (isPartnerTemplate) {
        // B2B partners are travel agencies who request quotes
        endpoint = '/api/b2b/partners'
      } else if (isSupplierTemplate) {
        // Suppliers are service providers (hotels, transport, guides, etc.)
        switch (supplierType) {
          case 'hotel':
            endpoint = '/api/suppliers?type=hotel'
            break
          case 'cruise':
            endpoint = '/api/cruises'
            break
          case 'transport':
            endpoint = '/api/suppliers?type=transport_company'
            break
          case 'guide':
            endpoint = '/api/guides'
            break
          default:
            endpoint = '/api/suppliers'
        }
      }

      const response = await fetch(endpoint)
      if (response.ok) {
        const data = await response.json()

        // Handle different response formats from various APIs
        let items: any[] = []
        if (Array.isArray(data)) {
          // Direct array response (e.g., guides)
          items = data
        } else if (data.success && Array.isArray(data.data)) {
          // Standard { success: true, data: [...] } format (suppliers, cruises, etc.)
          items = data.data
        } else if (Array.isArray(data.data)) {
          // { data: [...] } format
          items = data.data
        } else if (Array.isArray(data.clients)) {
          // Clients API returns { clients: [...] }
          items = data.clients
        }

        // Normalize to Recipient format
        const normalized: Recipient[] = items.map(item => ({
          id: item.id,
          name: item.company_name || item.name || item.hotel_name || item.cruise_name || item.supplier_name || 'Unknown',
          email: item.email || item.contact_email || item.reservations_email,
          phone: item.phone || item.contact_phone || item.whatsapp_number || item.whatsapp,
          type: isPartnerTemplate ? 'partner' : isSupplierTemplate ? supplierType as any : 'client'
        }))

        setRecipients(normalized)
      }
    } catch (error) {
      console.error('Error fetching recipients:', error)
      setRecipients([])
    } finally {
      setLoading(false)
    }
  }

  // Extract placeholders from template
  const templatePlaceholders = template.body.match(/\{\{[^}]+\}\}/g) || []
  const uniquePlaceholders = [...new Set(templatePlaceholders)]

  const handleSend = async () => {
    if (!selectedRecipient) {
      await dialog.alert(t('send.missingRecipient'), t('send.pleaseSelectRecipient'), 'warning')
      return
    }

    const recipientContact = channel === 'email' ? selectedRecipient.email : selectedRecipient.phone
    if (!recipientContact) {
      await dialog.alert(t('send.contactMissing'), channel === 'email' ? t('send.noEmailAvailable') : t('send.noPhoneAvailable'), 'warning')
      return
    }

    setSending(true)
    try {
      const response = await fetch('/api/templates/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: template.id,
          channel,
          recipientId: selectedRecipient.id,
          recipientType: selectedRecipient.type,
          recipient: recipientContact,
          subject: template.subject ? Object.entries(filledValues).reduce(
            (s, [k, v]) => s.replace(new RegExp(k.replace(/[{}]/g, '\\$&'), 'g'), v),
            template.subject
          ) : undefined,
          body: preview,
        }),
      })

      if (response.ok) {
        await dialog.alert(t('send.success'), t('send.messageSent'), 'success')
        onClose()
      } else {
        const data = await response.json()
        await dialog.alert(t('send.error'), data.error || t('send.failedToSend'), 'warning')
      }
    } catch (error) {
      console.error('Error sending:', error)
      await dialog.alert(t('send.error'), t('send.failedToSend'), 'warning')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{t('send.title', { name: template.name })}</h2>
            <p className="text-sm text-gray-500">{t('send.subtitle')}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 divide-x divide-gray-200">
            {/* Left: Fill Values */}
            <div className="p-6 space-y-4">
              {/* Channel Selector */}
              {template.channel === 'both' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('send.sendVia')}</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setChannel('whatsapp')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${
                        channel === 'whatsapp'
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      <MessageSquare className="w-4 h-4" />
                      {t('channels.whatsapp')}
                    </button>
                    <button
                      onClick={() => setChannel('email')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${
                        channel === 'email'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      <Mail className="w-4 h-4" />
                      {t('channels.email')}
                    </button>
                  </div>
                </div>
              )}

              {/* Recipient Selector */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                  {getRecipientIcon()}
                  {getRecipientLabel()} {t('send.autoFill')}
                </label>
                {loading ? (
                  <div className="flex items-center gap-2 px-3 py-2 text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('send.loadingRecipients')}
                  </div>
                ) : (
                  <select
                    value={selectedRecipient?.id || ''}
                    onChange={(e) => {
                      const recipient = recipients.find(r => r.id === e.target.value)
                      setSelectedRecipient(recipient || null)
                    }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  >
                    <option value="">-- {getRecipientLabel()} --</option>
                    {recipients.map((recipient) => (
                      <option key={recipient.id} value={recipient.id}>
                        {recipient.name} {recipient.email ? `(${recipient.email})` : recipient.phone ? `(${recipient.phone})` : ''}
                      </option>
                    ))}
                  </select>
                )}
                {recipients.length === 0 && !loading && (
                  <p className="text-xs text-amber-600 mt-1">
                    {t('send.noRecipientsFound', { type: isSupplierTemplate ? t('categories.supplier').toLowerCase() : isPartnerTemplate ? t('categories.partner').toLowerCase() : t('categories.customer').toLowerCase() })}
                  </p>
                )}
              </div>

              {/* Placeholder Fields */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">{t('send.fillPlaceholders')}</label>
                {uniquePlaceholders.map((ph) => {
                  const info = placeholders.find(p => p.placeholder === ph)
                  return (
                    <div key={ph}>
                      <label className="block text-xs text-gray-500 mb-1">
                        {info?.display_name || ph}
                        {info?.example_value && (
                          <span className="text-gray-400 ml-1">{t('send.example')} {info.example_value}</span>
                        )}
                      </label>
                      <input
                        type="text"
                        value={filledValues[ph] || ''}
                        onChange={(e) => setFilledValues({ ...filledValues, [ph]: e.target.value })}
                        placeholder={info?.example_value || ph}
                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                      />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Right: Preview */}
            <div className="p-6 bg-gray-50">
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('send.previewLabel')}</label>
              {template.subject && (
                <div className="mb-3">
                  <span className="text-xs text-gray-500">{t('send.subjectLabel')}</span>
                  <div className="p-2 bg-white rounded border border-gray-200 text-sm">
                    {Object.entries(filledValues).reduce(
                      (s, [k, v]) => s.replace(new RegExp(k.replace(/[{}]/g, '\\$&'), 'g'), v || k),
                      template.subject
                    )}
                  </div>
                </div>
              )}
              <div className="p-4 bg-white rounded-lg border border-gray-200 whitespace-pre-wrap text-sm max-h-[400px] overflow-y-auto">
                {preview}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex justify-between items-center bg-gray-50">
          <div className="text-sm text-gray-500">
            {selectedRecipient && (
              <>
                {t('send.sendingTo')} <strong>{selectedRecipient.name}</strong>
                {channel === 'email' && selectedRecipient.email && ` (${selectedRecipient.email})`}
                {channel === 'whatsapp' && selectedRecipient.phone && ` (${selectedRecipient.phone})`}
              </>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            >
              {t('modal.cancel')}
            </button>
            <button
              onClick={handleSend}
              disabled={sending || !selectedRecipient}
              className="flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#4f6339] transition-colors disabled:opacity-50"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {channel === 'whatsapp' ? t('send.sendWhatsApp') : t('send.sendEmail')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}