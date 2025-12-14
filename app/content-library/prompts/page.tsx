// =====================================================
// CONTENT LIBRARY - AI PROMPTS PAGE
// =====================================================
// 📁 COPY TO: app/content-library/prompts/page.tsx
// =====================================================

'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/app/supabase'
import Link from 'next/link'
import {
  ArrowLeft,
  Plus,
  Edit,
  Trash2,
  X,
  Save,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Wand2,
  Star,
  Code,
  FileText,
  Mail,
  MessageSquare,
  Copy,
  Check
} from 'lucide-react'

const PURPOSES = [
  { id: 'itinerary_full', label: 'Full Itinerary', icon: FileText },
  { id: 'day_description', label: 'Day Description', icon: FileText },
  { id: 'site_description', label: 'Site Description', icon: FileText },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { id: 'summary', label: 'Summary', icon: FileText },
  { id: 'transfer', label: 'Transfer', icon: FileText },
]

interface PromptTemplate {
  id: string
  name: string
  purpose: string
  description: string | null
  system_prompt: string | null
  user_prompt_template: string
  variables: string[]
  model: string
  temperature: number
  max_tokens: number
  is_active: boolean
  is_default: boolean
  version: number
}

interface PromptFormData {
  id?: string
  name: string
  purpose: string
  description: string
  system_prompt: string
  user_prompt_template: string
  variables: string[]
  model: string
  temperature: number
  max_tokens: number
  is_default: boolean
}

const DEFAULT_FORM: PromptFormData = {
  name: '',
  purpose: 'day_description',
  description: '',
  system_prompt: '',
  user_prompt_template: '',
  variables: [],
  model: 'claude-sonnet-4-20250514',
  temperature: 0.7,
  max_tokens: 2000,
  is_default: false,
}

export default function AIPromptsPage() {
  const [prompts, setPrompts] = useState<PromptTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<PromptFormData>(DEFAULT_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [viewPromptId, setViewPromptId] = useState<string | null>(null)

  useEffect(() => {
    fetchPrompts()
  }, [])

  async function fetchPrompts() {
    try {
      const response = await fetch('/api/content-library/prompts')
      if (!response.ok) throw new Error('Failed to fetch prompts')
      const data = await response.json()
      setPrompts(data)
    } catch (err) {
      console.error('Error fetching prompts:', err)
      setError('Failed to load prompts')
    } finally {
      setLoading(false)
    }
  }

  function handleEdit(prompt: PromptTemplate) {
    setFormData({
      id: prompt.id,
      name: prompt.name,
      purpose: prompt.purpose,
      description: prompt.description || '',
      system_prompt: prompt.system_prompt || '',
      user_prompt_template: prompt.user_prompt_template,
      variables: prompt.variables || [],
      model: prompt.model,
      temperature: prompt.temperature,
      max_tokens: prompt.max_tokens,
      is_default: prompt.is_default,
    })
    setShowForm(true)
  }

  function handleNew() {
    setFormData(DEFAULT_FORM)
    setShowForm(true)
  }

  function extractVariables(template: string): string[] {
    const matches = template.match(/\{\{(\w+)\}\}/g)
    if (!matches) return []
    return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))]
  }

  function handleTemplateChange(value: string) {
    const variables = extractVariables(value)
    setFormData({ ...formData, user_prompt_template: value, variables })
  }

  async function handleSave() {
    if (!formData.name || !formData.user_prompt_template) {
      setError('Name and user prompt template are required')
      return
    }

    setSaving(true)
    setError(null)

    try {
      if (formData.id) {
        // Update
        const response = await fetch('/api/content-library/prompts', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        })
        if (!response.ok) throw new Error('Failed to update')
      } else {
        // Create
        const response = await fetch('/api/content-library/prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        })
        if (!response.ok) throw new Error('Failed to create')
      }

      setSuccess(formData.id ? 'Prompt updated!' : 'Prompt created!')
      setShowForm(false)
      fetchPrompts()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      console.error('Save error:', err)
      setError('Failed to save prompt')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const response = await fetch(`/api/content-library/prompts?id=${id}`, {
        method: 'DELETE'
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete')
      }
      
      setPrompts(prompts.filter(p => p.id !== id))
      setDeleteId(null)
      setSuccess('Prompt deleted')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      console.error('Delete error:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete prompt')
      setDeleteId(null)
    }
  }

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Group prompts by purpose
  const groupedPrompts = prompts.reduce((acc, prompt) => {
    if (!acc[prompt.purpose]) acc[prompt.purpose] = []
    acc[prompt.purpose].push(prompt)
    return acc
  }, {} as Record<string, PromptTemplate[]>)

  const viewingPrompt = viewPromptId ? prompts.find(p => p.id === viewPromptId) : null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/content-library"
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">AI Prompts</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  {prompts.length} prompt templates for content generation
                </p>
              </div>
            </div>
            <button
              onClick={handleNew}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f613a] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Prompt
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="w-5 h-5" />
            <span>{success}</span>
          </div>
        )}

        {/* Prompts List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-[#647C47] animate-spin" />
          </div>
        ) : prompts.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <Wand2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No prompts yet</h3>
            <p className="text-gray-500 mb-6">Create your first AI prompt template</p>
            <button
              onClick={handleNew}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f613a] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add First Prompt
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {PURPOSES.map(purpose => {
              const purposePrompts = groupedPrompts[purpose.id] || []
              if (purposePrompts.length === 0) return null
              
              const Icon = purpose.icon
              
              return (
                <div key={purpose.id}>
                  <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    {purpose.label}
                    <span className="text-gray-400 font-normal">({purposePrompts.length})</span>
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {purposePrompts.map(prompt => (
                      <div
                        key={prompt.id}
                        className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Wand2 className="w-4 h-4 text-[#647C47]" />
                            <h3 className="font-medium text-gray-900">{prompt.name}</h3>
                            {prompt.is_default && (
                              <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded">
                                <Star className="w-3 h-3" />
                                Default
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setViewPromptId(prompt.id)}
                              className="p-1.5 text-gray-400 hover:text-[#647C47] hover:bg-gray-100 rounded-lg transition-colors"
                              title="View"
                            >
                              <Code className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleEdit(prompt)}
                              className="p-1.5 text-gray-400 hover:text-[#647C47] hover:bg-gray-100 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            {!prompt.is_default && (
                              <button
                                onClick={() => setDeleteId(prompt.id)}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                        
                        {prompt.description && (
                          <p className="text-sm text-gray-500 mb-3">{prompt.description}</p>
                        )}
                        
                        <div className="flex flex-wrap gap-2 mb-3">
                          <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
                            {prompt.model}
                          </span>
                          <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
                            Temp: {prompt.temperature}
                          </span>
                          <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
                            v{prompt.version}
                          </span>
                        </div>
                        
                        {prompt.variables && prompt.variables.length > 0 && (
                          <div>
                            <p className="text-xs text-gray-400 mb-1">Variables:</p>
                            <div className="flex flex-wrap gap-1">
                              {prompt.variables.slice(0, 5).map(v => (
                                <code key={v} className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">
                                  {`{{${v}}}`}
                                </code>
                              ))}
                              {prompt.variables.length > 5 && (
                                <span className="text-xs text-gray-400">
                                  +{prompt.variables.length - 5} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* View Prompt Modal */}
      {viewingPrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-3xl w-full my-8 shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">{viewingPrompt.name}</h2>
              <button
                onClick={() => setViewPromptId(null)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {viewingPrompt.system_prompt && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">System Prompt</label>
                    <button
                      onClick={() => copyToClipboard(viewingPrompt.system_prompt || '', 'system')}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                    >
                      {copiedId === 'system' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedId === 'system' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-sm overflow-x-auto whitespace-pre-wrap">
                    {viewingPrompt.system_prompt}
                  </pre>
                </div>
              )}
              
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">User Prompt Template</label>
                  <button
                    onClick={() => copyToClipboard(viewingPrompt.user_prompt_template, 'user')}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                  >
                    {copiedId === 'user' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedId === 'user' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-sm overflow-x-auto whitespace-pre-wrap">
                  {viewingPrompt.user_prompt_template}
                </pre>
              </div>
              
              {viewingPrompt.variables && viewingPrompt.variables.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-2">
                    Variables ({viewingPrompt.variables.length})
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {viewingPrompt.variables.map(v => (
                      <code key={v} className="text-sm px-2 py-1 bg-blue-50 text-blue-700 rounded">
                        {`{{${v}}}`}
                      </code>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 p-5 border-t border-gray-200">
              <button
                onClick={() => {
                  setViewPromptId(null)
                  handleEdit(viewingPrompt)
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f613a] transition-colors"
              >
                <Edit className="w-4 h-4" />
                Edit Prompt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit/Create Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-3xl w-full my-8 shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {formData.id ? 'Edit Prompt' : 'New Prompt Template'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Name & Purpose */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Day Description Generator"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Purpose</label>
                  <select
                    value={formData.purpose}
                    onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
                  >
                    {PURPOSES.map(p => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="What does this prompt generate?"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
                />
              </div>

              {/* System Prompt */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">System Prompt</label>
                <textarea
                  value={formData.system_prompt}
                  onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
                  placeholder="Instructions for the AI's behavior and role..."
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47] resize-none"
                />
              </div>

              {/* User Prompt Template */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  User Prompt Template <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formData.user_prompt_template}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  placeholder="Use {{variable_name}} for dynamic content..."
                  rows={8}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47] resize-none"
                />
                {formData.variables.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 mb-1">Detected variables:</p>
                    <div className="flex flex-wrap gap-1">
                      {formData.variables.map(v => (
                        <code key={v} className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">
                          {`{{${v}}}`}
                        </code>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Model Settings */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                  <select
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
                  >
                    <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                    <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                    <option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="gpt-4o-mini">GPT-4o Mini</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Temperature: {formData.temperature}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={formData.temperature}
                    onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
                    className="w-full accent-[#647C47]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Tokens</label>
                  <input
                    type="number"
                    value={formData.max_tokens}
                    onChange={(e) => setFormData({ ...formData, max_tokens: parseInt(e.target.value) })}
                    min={100}
                    max={8000}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
                  />
                </div>
              </div>

              {/* Default Toggle */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_default"
                  checked={formData.is_default}
                  onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                  className="w-4 h-4 text-[#647C47] border-gray-300 rounded focus:ring-[#647C47]"
                />
                <label htmlFor="is_default" className="text-sm text-gray-700">
                  Set as default for this purpose
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-5 border-t border-gray-200">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f613a] disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Save Prompt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Prompt?</h3>
            <p className="text-gray-600 mb-6">
              This prompt template will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}