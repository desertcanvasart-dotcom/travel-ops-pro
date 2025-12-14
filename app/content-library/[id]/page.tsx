// =====================================================
// CONTENT LIBRARY - EDITOR PAGE
// =====================================================
// 📁 COPY TO: app/content-library/[id]/page.tsx
// =====================================================

'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/app/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Save,
  Trash2,
  Plus,
  X,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Wallet,
  Star,
  Gem,
  Crown,
  MapPin,
  Clock,
  Tag,
  FileText,
  Library
} from 'lucide-react'

const TIERS = [
  { id: 'budget', label: 'Budget', icon: Wallet, color: 'emerald' },
  { id: 'standard', label: 'Standard', icon: Star, color: 'blue' },
  { id: 'deluxe', label: 'Deluxe', icon: Gem, color: 'purple' },
  { id: 'luxury', label: 'Luxury', icon: Crown, color: 'amber' },
] as const

type Tier = 'budget' | 'standard' | 'deluxe' | 'luxury'

interface Category {
  id: string
  name: string
  slug: string
}

interface Variation {
  id?: string
  tier: Tier
  title: string
  description: string
  highlights: string[]
  inclusions: string[]
  internal_notes: string
  is_active: boolean
}

interface ContentData {
  id: string
  category_id: string
  name: string
  slug: string
  short_description: string
  location: string
  duration: string
  tags: string[]
  is_active: boolean
  category?: Category
  variations?: Variation[]
}

export default function ContentEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [activeTier, setActiveTier] = useState<Tier>('budget')
  const [tagInput, setTagInput] = useState('')

  // Form state
  const [formData, setFormData] = useState<ContentData>({
    id: '',
    category_id: '',
    name: '',
    slug: '',
    short_description: '',
    location: '',
    duration: '',
    tags: [],
    is_active: true,
  })

  const [variations, setVariations] = useState<Record<Tier, Variation>>({
    budget: { tier: 'budget', title: '', description: '', highlights: [], inclusions: [], internal_notes: '', is_active: true },
    standard: { tier: 'standard', title: '', description: '', highlights: [], inclusions: [], internal_notes: '', is_active: true },
    deluxe: { tier: 'deluxe', title: '', description: '', highlights: [], inclusions: [], internal_notes: '', is_active: true },
    luxury: { tier: 'luxury', title: '', description: '', highlights: [], inclusions: [], internal_notes: '', is_active: true },
  })

  useEffect(() => {
    fetchCategories()
    if (id !== 'new') {
      fetchContent()
    } else {
      setLoading(false)
    }
  }, [id])

  async function fetchCategories() {
    try {
      const response = await fetch('/api/content-library/categories')
      if (!response.ok) throw new Error('Failed to fetch categories')
      const data = await response.json()
      setCategories(data)
    } catch (err) {
      console.error('Error fetching categories:', err)
    }
  }

  async function fetchContent() {
    try {
      const response = await fetch(`/api/content-library/${id}`)
      if (!response.ok) throw new Error('Failed to fetch content')
      const data = await response.json()

      setFormData({
        id: data.id,
        category_id: data.category_id,
        name: data.name,
        slug: data.slug,
        short_description: data.short_description || '',
        location: data.location || '',
        duration: data.duration || '',
        tags: data.tags || [],
        is_active: data.is_active,
      })

      // Map variations to state
      if (data.variations) {
        const variationMap = { ...variations }
        data.variations.forEach((v: Variation) => {
          variationMap[v.tier] = {
            id: v.id,
            tier: v.tier,
            title: v.title || '',
            description: v.description || '',
            highlights: v.highlights || [],
            inclusions: v.inclusions || [],
            internal_notes: v.internal_notes || '',
            is_active: v.is_active,
          }
        })
        setVariations(variationMap)
      }
    } catch (err) {
      console.error('Error fetching content:', err)
      setError('Failed to load content')
    } finally {
      setLoading(false)
    }
  }

  function generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  function handleNameChange(name: string) {
    setFormData(prev => ({
      ...prev,
      name,
      slug: id === 'new' ? generateSlug(name) : prev.slug
    }))
  }

  function handleAddTag() {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim().toLowerCase())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim().toLowerCase()]
      }))
      setTagInput('')
    }
  }

  function handleRemoveTag(tag: string) {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag)
    }))
  }

  function handleVariationChange(tier: Tier, field: keyof Variation, value: unknown) {
    setVariations(prev => ({
      ...prev,
      [tier]: {
        ...prev[tier],
        [field]: value
      }
    }))
  }

  function handleAddHighlight(tier: Tier) {
    const current = variations[tier].highlights
    handleVariationChange(tier, 'highlights', [...current, ''])
  }

  function handleUpdateHighlight(tier: Tier, index: number, value: string) {
    const current = [...variations[tier].highlights]
    current[index] = value
    handleVariationChange(tier, 'highlights', current)
  }

  function handleRemoveHighlight(tier: Tier, index: number) {
    const current = variations[tier].highlights.filter((_, i) => i !== index)
    handleVariationChange(tier, 'highlights', current)
  }

  function handleAddInclusion(tier: Tier) {
    const current = variations[tier].inclusions
    handleVariationChange(tier, 'inclusions', [...current, ''])
  }

  function handleUpdateInclusion(tier: Tier, index: number, value: string) {
    const current = [...variations[tier].inclusions]
    current[index] = value
    handleVariationChange(tier, 'inclusions', current)
  }

  function handleRemoveInclusion(tier: Tier, index: number) {
    const current = variations[tier].inclusions.filter((_, i) => i !== index)
    handleVariationChange(tier, 'inclusions', current)
  }

  async function handleSave() {
    if (!formData.name || !formData.category_id) {
      setError('Name and category are required')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      // Prepare variations (only ones with description)
      const variationsToSave = Object.values(variations)
        .filter(v => v.description.trim())
        .map(v => ({
          ...v,
          highlights: v.highlights.filter(h => h.trim()),
          inclusions: v.inclusions.filter(i => i.trim()),
        }))

      if (id === 'new') {
        // Create new content
        const response = await fetch('/api/content-library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            variations: variationsToSave
          })
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to create content')
        }

        const data = await response.json()
        setSuccess('Content created successfully!')
        
        // Redirect to edit page
        setTimeout(() => {
          router.push(`/content-library/${data.id}`)
        }, 1000)
      } else {
        // Update existing content
        const response = await fetch(`/api/content-library/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            variations: variationsToSave
          })
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to update content')
        }

        setSuccess('Content saved successfully!')
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      console.error('Save error:', err)
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#647C47] animate-spin" />
      </div>
    )
  }

  const currentVariation = variations[activeTier]
  const filledTiers = Object.values(variations).filter(v => v.description.trim()).length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/content-library"
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  {id === 'new' ? 'New Content' : formData.name || 'Edit Content'}
                </h1>
                <p className="text-sm text-gray-500">
                  {filledTiers}/4 tier variations
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f613a] disabled:opacity-50 transition-colors"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Basic Info */}
          <div className="lg:col-span-1 space-y-6">
            {/* Basic Information */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-400" />
                Basic Information
              </h2>

              <div className="space-y-4">
                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.category_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, category_id: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
                  >
                    <option value="">Select category...</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="e.g., Pyramids of Giza"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
                  />
                </div>

                {/* Slug */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Slug
                  </label>
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                    placeholder="pyramids-of-giza"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-500 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
                  />
                </div>

                {/* Short Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Short Description
                  </label>
                  <textarea
                    value={formData.short_description}
                    onChange={(e) => setFormData(prev => ({ ...prev, short_description: e.target.value }))}
                    placeholder="Brief description for lists..."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47] resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Location & Duration */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-400" />
                Details
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                    placeholder="e.g., Giza, Cairo"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Clock className="w-3.5 h-3.5 inline mr-1" />
                    Duration
                  </label>
                  <input
                    type="text"
                    value={formData.duration}
                    onChange={(e) => setFormData(prev => ({ ...prev, duration: e.target.value }))}
                    placeholder="e.g., 3-4 hours"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
                  />
                </div>
              </div>
            </div>

            {/* Tags */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Tag className="w-4 h-4 text-gray-400" />
                Tags
              </h2>

              <div className="flex flex-wrap gap-2 mb-3">
                {formData.tags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-700 text-sm rounded-full"
                  >
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                  placeholder="Add tag..."
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
                />
                <button
                  onClick={handleAddTag}
                  className="px-3 py-2 text-sm font-medium text-[#647C47] bg-[#647C47]/10 rounded-lg hover:bg-[#647C47]/20 transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* Right Column - Tier Variations */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-gray-200">
              {/* Tier Tabs */}
              <div className="border-b border-gray-200">
                <div className="flex">
                  {TIERS.map(tier => {
                    const Icon = tier.icon
                    const hasContent = variations[tier.id].description.trim()
                    const isActive = activeTier === tier.id
                    
                    return (
                      <button
                        key={tier.id}
                        onClick={() => setActiveTier(tier.id)}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                          isActive
                            ? `border-${tier.color}-500 text-${tier.color}-700 bg-${tier.color}-50/50`
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {tier.label}
                        {hasContent && (
                          <CheckCircle2 className={`w-3.5 h-3.5 text-${tier.color}-500`} />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Variation Form */}
              <div className="p-5 space-y-5">
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Title (Optional)
                  </label>
                  <input
                    type="text"
                    value={currentVariation.title}
                    onChange={(e) => handleVariationChange(activeTier, 'title', e.target.value)}
                    placeholder={`e.g., ${formData.name || 'Content'} ${TIERS.find(t => t.id === activeTier)?.label} Experience`}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={currentVariation.description}
                    onChange={(e) => handleVariationChange(activeTier, 'description', e.target.value)}
                    placeholder={`Write the ${activeTier} tier description. This is what the AI will use when generating itineraries...`}
                    rows={6}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47] resize-none"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    {currentVariation.description.length} characters
                  </p>
                </div>

                {/* Highlights */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Highlights
                  </label>
                  <div className="space-y-2">
                    {currentVariation.highlights.map((highlight, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          type="text"
                          value={highlight}
                          onChange={(e) => handleUpdateHighlight(activeTier, index, e.target.value)}
                          placeholder="Key selling point..."
                          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
                        />
                        <button
                          onClick={() => handleRemoveHighlight(activeTier, index)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => handleAddHighlight(activeTier)}
                      className="flex items-center gap-1 text-sm text-[#647C47] hover:text-[#4f613a] transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Add Highlight
                    </button>
                  </div>
                </div>

                {/* Inclusions */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Inclusions
                  </label>
                  <div className="space-y-2">
                    {currentVariation.inclusions.map((inclusion, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          type="text"
                          value={inclusion}
                          onChange={(e) => handleUpdateInclusion(activeTier, index, e.target.value)}
                          placeholder="What's included..."
                          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
                        />
                        <button
                          onClick={() => handleRemoveInclusion(activeTier, index)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => handleAddInclusion(activeTier)}
                      className="flex items-center gap-1 text-sm text-[#647C47] hover:text-[#4f613a] transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Add Inclusion
                    </button>
                  </div>
                </div>

                {/* Internal Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Internal Notes
                    <span className="ml-2 text-xs text-gray-400 font-normal">(Team only)</span>
                  </label>
                  <textarea
                    value={currentVariation.internal_notes}
                    onChange={(e) => handleVariationChange(activeTier, 'internal_notes', e.target.value)}
                    placeholder="Notes for your team (not included in generated content)..."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47] resize-none bg-amber-50/50"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}