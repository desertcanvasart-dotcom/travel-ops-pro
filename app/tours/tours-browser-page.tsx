'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useCurrency } from '@/app/contexts/PreferencesContext'
import { LanguageIndicator } from '@/components/multilingual'
import type { Language } from '@/types/multilingual'

// Updated interface to match the new API response structure
interface TourTemplate {
  id: string
  template_code: string
  template_name: string
  tour_type: string
  duration_days: number
  cities_covered: string[]
  highlights: string[]
  short_description: string | null
  is_featured: boolean
  cover_image_url: string | null
  category: {
    id: string
    category_name: string
    category_code: string
  } | null
  variations_count: number
  available_tiers: string[]
  min_pax: number
  max_pax: number
  starting_from: number | null
  starting_from_tier: string | null
  currency: string
  uses_day_builder: boolean
  pricing_mode: string
  available_languages: Language[]
}

type ViewMode = 'grid' | 'table' | 'list'

export default function ToursBrowsePage() {
  const t = useTranslations('tours')
  // Program prices come out of the EUR-denominated B2B engine; display them in
  // the user's preferred currency like the rates pages do.
  const { formatWithConversion, rateCurrency } = useCurrency()
  const [tours, setTours] = useState<TourTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterTier, setFilterTier] = useState<string>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [deleteTarget, setDeleteTarget] = useState<TourTemplate | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetchTours()
  }, [])

  const fetchTours = async () => {
    try {
      // This page is the whole catalogue, so walk every page — a bare fetch
      // used the API's default limit of 12 and silently hid the rest (26
      // programmes in the system, 12 on screen, no pager to reach the others).
      const all: TourTemplate[] = []
      let page = 1
      let totalPages = 1
      do {
        const response = await fetch(`/api/tours/browse?page=${page}&limit=50`)
        const data = await response.json()
        if (!data.success) {
          setError(data.error || 'Failed to load tours')
          return
        }
        all.push(...(data.data?.templates || []))
        totalPages = data.data?.pagination?.total_pages ?? 1
        page++
      } while (page <= totalPages && page <= 20) // hard stop: 1000 templates

      setTours(all)
    } catch (err) {
      setError('Error loading tours')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const response = await fetch(`/api/tours/templates/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      const data = await response.json()
      if (data.success) {
        setTours(prev => prev.filter(t => t.id !== deleteTarget.id))
        setDeleteTarget(null)
      } else {
        alert(data.error || t('error.failedToDelete'))
      }
    } catch {
      alert(t('error.failedToDelete'))
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget, t])

  const filteredTours = tours.filter(tour => {
    // Filter by tier - check if the tour has the selected tier available
    const matchesTier = filterTier === 'all' || tour.available_tiers?.includes(filterTier)

    // Filter by category
    const matchesCategory = filterCategory === 'all' || tour.category?.category_name === filterCategory

    // Search by name, description, or cities
    const searchLower = searchQuery.toLowerCase()
    const matchesSearch =
      tour.template_name.toLowerCase().includes(searchLower) ||
      (tour.short_description?.toLowerCase().includes(searchLower)) ||
      (tour.cities_covered?.some(city => city.toLowerCase().includes(searchLower)))

    return matchesTier && matchesCategory && matchesSearch
  })

  // Get unique categories from the tours
  const uniqueCategories = [...new Set(tours.map(t => t.category?.category_name).filter(Boolean))]

  const getTierBadge = (tier: string) => {
    const styles: Record<string, string> = {
      budget: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      standard: 'bg-blue-50 text-blue-700 border border-blue-200',
      deluxe: 'bg-purple-50 text-purple-700 border border-purple-200',
      luxury: 'bg-amber-50 text-amber-700 border border-amber-200'
    }
    return styles[tier] || 'bg-gray-50 text-gray-700 border border-gray-200'
  }

  const getTierIcon = (tier: string) => {
    const icons: Record<string, string> = {
      budget: '💰',
      standard: '💎',
      deluxe: '✨',
      luxury: '👑'
    }
    return icons[tier] || '📋'
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-[#647C47] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-gray-500 text-sm">{t('loading')}</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-md">
          <p className="text-sm font-medium text-red-800 mb-1">{t('errorLoading')}</p>
          <p className="text-sm text-red-600">{error}</p>
          <button
            onClick={() => { setError(null); fetchTours(); }}
            className="mt-3 text-sm text-red-700 underline hover:no-underline"
          >
            {t('tryAgain')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-lg">
            🗺️
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{t('title')}</h1>
            <p className="text-sm text-gray-500">{t('subtitle')}</p>
          </div>
        </div>
        <Link
          href="/tours/manage"
          className="px-4 py-2 text-sm bg-[#647C47] text-white rounded-lg hover:bg-[#4a5c35] transition-colors font-medium"
        >
          {t('manageTours')}
        </Link>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🎯</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          </div>
          <p className="text-xs text-gray-500 mb-1">{t('stats.tourPackages')}</p>
          <p className="text-2xl font-semibold text-gray-900">{tours.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">📋</span>
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
          </div>
          <p className="text-xs text-gray-500 mb-1">{t('stats.withAutoPricing')}</p>
          <p className="text-2xl font-semibold text-gray-900">
            {tours.filter(t => t.uses_day_builder || t.pricing_mode === 'auto').length}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🏷️</span>
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
          </div>
          <p className="text-xs text-gray-500 mb-1">{t('stats.categories')}</p>
          <p className="text-2xl font-semibold text-gray-900">{uniqueCategories.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">💶</span>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          </div>
          <p className="text-xs text-gray-500 mb-1">{t('stats.startingFrom')}</p>
          <p className="text-2xl font-semibold text-gray-900">
            {tours.some(t => t.starting_from) ? formatWithConversion(Math.min(...tours.filter(t => t.starting_from).map(t => t.starting_from as number)), 'EUR') : '—'}
          </p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-4">
        <div className="flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('filters.searchPlaceholder')}
            className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] outline-none"
          />
        </div>
        <select
          value={filterTier}
          onChange={(e) => setFilterTier(e.target.value)}
          className="px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] outline-none bg-white min-w-[150px]"
        >
          <option value="all">{t('filters.allTiers')}</option>
          <option value="budget">💰 {t('tiers.budget')}</option>
          <option value="standard">💎 {t('tiers.standard')}</option>
          <option value="deluxe">✨ {t('tiers.deluxe')}</option>
          <option value="luxury">👑 {t('tiers.luxury')}</option>
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] outline-none bg-white min-w-[180px]"
        >
          <option value="all">{t('filters.allCategories')}</option>
          {uniqueCategories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      {/* Results Info + View Toggle */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          {t('results.showing')} <span className="font-medium text-gray-900">{filteredTours.length}</span> {t('results.of')} {tours.length} {t('results.tours')}
        </p>
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 text-sm transition-colors ${viewMode === 'grid' ? 'bg-[#647C47] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              title={t('views.grid')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="3" width="7" height="7" rx="1" strokeWidth="2" />
                <rect x="14" y="3" width="7" height="7" rx="1" strokeWidth="2" />
                <rect x="3" y="14" width="7" height="7" rx="1" strokeWidth="2" />
                <rect x="14" y="14" width="7" height="7" rx="1" strokeWidth="2" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 text-sm transition-colors border-x border-gray-200 ${viewMode === 'list' ? 'bg-[#647C47] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              title={t('views.list')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 text-sm transition-colors ${viewMode === 'table' ? 'bg-[#647C47] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              title={t('views.table')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="2" />
                <path strokeWidth="2" d="M3 9h18M3 15h18M9 3v18" />
              </svg>
            </button>
          </div>
          <button
            onClick={() => {
              setSearchQuery('')
              setFilterTier('all')
              setFilterCategory('all')
            }}
            className="text-sm text-[#647C47] hover:text-[#4a5c35] font-medium"
          >
            {t('filters.clearFilters')}
          </button>
        </div>
      </div>

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTours.map((tour) => (
            <div
              key={tour.id}
              className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-[#647C47] transition-colors group"
            >
              {/* Card Header */}
              <div className="p-4 border-b border-gray-100">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-gray-900 leading-tight">{tour.template_name}</h3>
                  <div className="flex items-center gap-1 shrink-0">
                    {tour.is_featured && (
                      <span className="text-amber-500 text-xs">⭐</span>
                    )}
                    <button
                      onClick={(e) => { e.preventDefault(); setDeleteTarget(tour); }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all rounded"
                      title={t('actions.delete')}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  {tour.cities_covered?.join(', ') || 'Egypt'}
                </p>
              </div>

              {/* Card Body */}
              <div className="p-4">
                {/* Available Tiers */}
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  {tour.available_tiers?.length > 0 ? (
                    tour.available_tiers.map(tier => (
                      <span
                        key={tier}
                        className={`px-2 py-1 rounded text-xs font-medium ${getTierBadge(tier)}`}
                      >
                        {getTierIcon(tier)} {t(`tiers.${tier}`)}
                      </span>
                    ))
                  ) : (
                    <span className="px-2 py-1 bg-gray-50 text-gray-600 border border-gray-200 rounded text-xs">
                      {t('card.noVariationsYet')}
                    </span>
                  )}
                </div>

                {/* Tour Details */}
                <div className="space-y-2 text-sm text-gray-600 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">📅</span>
                    <span>{tour.duration_days} {tour.duration_days === 1 ? t('card.day') : t('card.days')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">👥</span>
                    <span>{tour.min_pax || 1}-{tour.max_pax || 15} {t('card.passengers')}</span>
                  </div>
                  {tour.category && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">🏷️</span>
                      <span className="text-gray-500 text-xs">{tour.category.category_name}</span>
                    </div>
                  )}
                  {tour.uses_day_builder && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">⚡</span>
                      <span className="text-[#647C47] text-xs font-medium">{t('card.autoPricing')}</span>
                    </div>
                  )}
                </div>

                {/* Short Description */}
                {tour.short_description && (
                  <p className="text-xs text-gray-500 mb-4 line-clamp-2">
                    {tour.short_description}
                  </p>
                )}

                {/* Price & Action */}
                <div className="flex items-end justify-between pt-3 border-t border-gray-100">
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">{t('card.startingFrom')}</p>
                    <p className="text-xl font-semibold text-[#647C47]">
                      {tour.starting_from ? formatWithConversion(tour.starting_from, rateCurrency) : 'N/A'}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {t('card.perPerson')}{tour.starting_from_tier ? ` • ${tour.starting_from_tier}` : ''}
                    </p>
                  </div>
                  <Link
                      href={`/tours/${tour.id}`}
                      className="bg-[#647C47] text-white px-4 py-2 rounded-lg hover:bg-[#4a5c35] transition-colors text-xs font-medium"
                    >
                      {t('card.viewDetails')}
                    </Link>
                </div>
              </div>

              {/* Card Footer */}
              <div className="bg-gray-50 px-4 py-2 border-t border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] text-gray-400 font-mono uppercase">{tour.template_code}</p>
                  <LanguageIndicator availableLanguages={tour.available_languages || []} size="sm" />
                </div>
                <p className="text-[10px] text-gray-400">
                  {tour.variations_count || 0} {tour.variations_count !== 1 ? t('card.variations') : t('card.variation')}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="space-y-3">
          {filteredTours.map((tour) => (
            <div
              key={tour.id}
              className="bg-white border border-gray-200 rounded-lg hover:border-[#647C47] transition-colors group"
            >
              <div className="flex items-center gap-4 p-4">
                {/* Left: Name & Meta */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">{tour.template_name}</h3>
                    {tour.is_featured && <span className="text-amber-500 text-xs shrink-0">⭐</span>}
                    {tour.uses_day_builder && (
                      <span className="text-[10px] font-medium text-[#647C47] bg-[#647C47]/10 px-1.5 py-0.5 rounded shrink-0">⚡ {t('card.autoPricing')}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="font-mono uppercase text-gray-400">{tour.template_code}</span>
                    <span>{tour.cities_covered?.join(', ') || 'Egypt'}</span>
                    {tour.category && (
                      <>
                        <span className="text-gray-300">|</span>
                        <span>{tour.category.category_name}</span>
                      </>
                    )}
                  </div>
                  {tour.short_description && (
                    <p className="text-xs text-gray-400 mt-1 truncate">{tour.short_description}</p>
                  )}
                </div>

                {/* Center: Tiers */}
                <div className="hidden md:flex items-center gap-1.5 shrink-0">
                  {tour.available_tiers?.length > 0 ? (
                    tour.available_tiers.map(tier => (
                      <span
                        key={tier}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium ${getTierBadge(tier)}`}
                      >
                        {getTierIcon(tier)} {t(`tiers.${tier}`)}
                      </span>
                    ))
                  ) : (
                    <span className="px-2 py-0.5 bg-gray-50 text-gray-400 border border-gray-200 rounded text-[10px]">
                      {t('card.noVariationsYet')}
                    </span>
                  )}
                </div>

                {/* Right: Duration, Pax, Price */}
                <div className="hidden sm:flex items-center gap-4 shrink-0 text-xs text-gray-600">
                  <div className="text-center">
                    <p className="font-medium">{tour.duration_days}d</p>
                  </div>
                  <div className="text-center">
                    <p className="font-medium">{tour.min_pax || 1}-{tour.max_pax || 15}</p>
                    <p className="text-[10px] text-gray-400">{t('card.passengers')}</p>
                  </div>
                  <div className="text-right min-w-[70px]">
                    <p className="font-semibold text-[#647C47] text-sm">
                      {tour.starting_from ? formatWithConversion(tour.starting_from, rateCurrency) : 'N/A'}
                    </p>
                    <p className="text-[10px] text-gray-400">{t('card.perPerson')}</p>
                  </div>
                </div>

                {/* Languages */}
                <div className="hidden lg:block shrink-0">
                  <LanguageIndicator availableLanguages={tour.available_languages || []} size="sm" />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <Link
                      href={`/tours/${tour.id}`}
                      className="bg-[#647C47] text-white px-3 py-1.5 rounded-lg hover:bg-[#4a5c35] transition-colors text-xs font-medium"
                    >
                      {t('card.viewDetails')}
                    </Link>
                  <button
                    onClick={() => setDeleteTarget(tour)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 transition-all rounded"
                    title={t('actions.delete')}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('table.template')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('table.category')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('table.tiers')}</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('table.duration')}</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('table.passengers')}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('table.cities')}</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('table.lang')}</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('table.price')}</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredTours.map((tour) => (
                  <tr key={tour.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-4 py-3">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium text-gray-900 text-sm">{tour.template_name}</p>
                          {tour.is_featured && <span className="text-amber-500 text-xs">⭐</span>}
                          {tour.uses_day_builder && (
                            <span className="text-[10px] font-medium text-[#647C47] bg-[#647C47]/10 px-1 py-0.5 rounded">⚡</span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-400 font-mono uppercase">{tour.template_code}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {tour.category?.category_name || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        {tour.available_tiers?.length > 0 ? (
                          tour.available_tiers.map(tier => (
                            <span
                              key={tier}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getTierBadge(tier)}`}
                            >
                              {getTierIcon(tier)}
                            </span>
                          ))
                        ) : (
                          <span className="text-[10px] text-gray-400">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-600">
                      {tour.duration_days}d
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-600">
                      {tour.min_pax || 1}-{tour.max_pax || 15}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate">
                      {tour.cities_covered?.join(', ') || 'Egypt'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <LanguageIndicator availableLanguages={tour.available_languages || []} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-semibold text-[#647C47] text-sm">
                        {tour.starting_from ? formatWithConversion(tour.starting_from, rateCurrency) : 'N/A'}
                      </p>
                      <p className="text-[10px] text-gray-400">{tour.starting_from_tier || ''}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Link
                            href={`/tours/${tour.id}`}
                            className="text-[#647C47] hover:text-[#4a5c35] text-xs font-medium hover:underline"
                          >
                            {t('actions.view')}
                          </Link>
                        <span className="text-gray-200">|</span>
                        <button
                          onClick={() => setDeleteTarget(tour)}
                          className="text-gray-400 hover:text-red-500 text-xs font-medium transition-colors"
                        >
                          {t('actions.delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {filteredTours.length === 0 && (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
          <div className="text-4xl mb-3">🔍</div>
          <h3 className="text-sm font-medium text-gray-900 mb-1">{t('empty.noToursFound')}</h3>
          <p className="text-xs text-gray-500 mb-4">{t('empty.adjustFilters')}</p>
          <Link
            href="/tours/manage"
            className="text-sm text-[#647C47] hover:text-[#4a5c35] font-medium"
          >
            {t('empty.createNewTour')}
          </Link>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => !deleting && setDeleteTarget(null)} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{t('delete.confirmTitle')}</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t('delete.confirmMessage', { name: deleteTarget.template_name })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium disabled:opacity-50"
              >
                {t('manager.cancel')}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors font-medium disabled:opacity-50"
              >
                {deleting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    {t('actions.delete')}...
                  </span>
                ) : (
                  t('actions.delete')
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-xs text-gray-400">© 2026 Autoura Operations System</p>
      </div>
    </div>
  )
}
