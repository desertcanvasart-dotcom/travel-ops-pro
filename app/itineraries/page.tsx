'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Search, Plus, FileText, Eye, Edit2, Trash2, CheckCircle2, AlertCircle, X } from 'lucide-react'
import { LanguageIndicator } from '@/components/multilingual'
import type { Language } from '@/types/multilingual'

interface Itinerary {
  id: string
  itinerary_code: string
  client_name: string
  client_email: string
  trip_name: string
  start_date: string
  end_date: string
  total_days: number
  num_adults: number
  num_children: number
  total_cost: number
  currency: string
  status: string
  created_at: string
  available_languages: Language[]
}
interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

const PAGE_SIZE = 100

export default function ItinerariesPage() {
  const t = useTranslations('itineraries')
  const [itineraries, setItineraries] = useState<Itinerary[]>([])
  const [filteredItineraries, setFilteredItineraries] = useState<Itinerary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const router = useRouter()

  const [toasts, setToasts] = useState<Toast[]>([])

const showToast = (type: 'success' | 'error' | 'info', message: string) => {
  const id = Date.now().toString()
  setToasts(prev => [...prev, { id, type, message }])
  setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
}

  useEffect(() => {
    fetchItineraries()
  }, [])
  interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

  useEffect(() => {
    filterItineraries()
  }, [itineraries, searchQuery, statusFilter])

  const fetchItineraries = async (pageToLoad = 1) => {
    if (pageToLoad > 1) setLoadingMore(true)
    try {
      const response = await fetch(`/api/itineraries?page=${pageToLoad}&limit=${PAGE_SIZE}`)
      const data = await response.json()
      if (data.success) {
        setTotalCount(data.count ?? data.data.length)
        setPage(pageToLoad)
        if (pageToLoad === 1) {
          setItineraries(data.data)
        } else {
          // Append the next page, de-duping by id in case rows shifted
          // between pages (e.g. a new itinerary was created meanwhile)
          setItineraries(prev => {
            const seen = new Set(prev.map(it => it.id))
            return [...prev, ...data.data.filter((it: Itinerary) => !seen.has(it.id))]
          })
        }
      }
    } catch (error) {
      console.error('Error fetching itineraries:', error)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const filterItineraries = () => {
    let filtered = itineraries

    if (statusFilter !== 'all') {
      filtered = filtered.filter(it => it.status === statusFilter)
    }

    if (searchQuery) {
      filtered = filtered.filter(it =>
        it.client_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        it.trip_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        it.itinerary_code?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    setFilteredItineraries(filtered)
  }

  const deleteItinerary = async (id: string) => {
    if (deleteConfirm !== id) {
      setDeleteConfirm(id)
      setTimeout(() => setDeleteConfirm(null), 3000)
      return
    }

    try {
      const response = await fetch(`/api/itineraries/${id}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        setItineraries(itineraries.filter(it => it.id !== id))
        setTotalCount(prev => Math.max(0, prev - 1))
        setDeleteConfirm(null)
      } else {
        showToast('error', data.error || t('errorDeleteFailed'))
      }
    } catch (error) {
      console.error('Error deleting itinerary:', error)
      showToast('error', t('errorDeleteFailed'))
    }
  }

  const updateStatus = async (id: string, newStatus: string) => {
    setUpdatingStatus(id)
    try {
      const response = await fetch(`/api/itineraries/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })

      const data = await response.json()

      if (data.success) {
        setItineraries(itineraries.map(it =>
          it.id === id ? { ...it, status: newStatus } : it
        ))
      } else {
        showToast('error', data.error || t('errorUpdateFailed'))
      }
    } catch (error) {
      console.error('Error updating status:', error)
      showToast('error', t('errorUpdateFailed'))
    } finally {
      setUpdatingStatus(null)
    }
  }

  const getStatusColor = (status: string) => {
    const colors: any = {
      draft: 'bg-gray-50 text-gray-600 border-gray-200',
      sent: 'bg-primary-50 text-primary-600 border-primary-200',
      confirmed: 'bg-green-50 text-green-600 border-green-200',
      completed: 'bg-purple-50 text-purple-600 border-purple-200',
      cancelled: 'bg-red-50 text-red-600 border-red-200'
    }
    return colors[status] || 'bg-gray-50 text-gray-600 border-gray-200'
  }

  const statusCounts = {
    total: itineraries.length,
    draft: itineraries.filter(i => i.status === 'draft').length,
    sent: itineraries.filter(i => i.status === 'sent').length,
    confirmed: itineraries.filter(i => i.status === 'confirmed').length,
    completed: itineraries.filter(i => i.status === 'completed').length,
    cancelled: itineraries.filter(i => i.status === 'cancelled').length
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-500">{t('loadingItineraries')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* ⭐ COMPACT HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t('title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('subtitle')}</p>
        </div>
        <button
          onClick={() => router.push('/itineraries/new')}
          className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 flex items-center gap-2 text-sm font-medium shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          {t('newItinerary')}
        </button>
      </div>

      {/* ⭐ COMPACT STATUS CARDS - Linear Style */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {/* Total */}
        <button
          onClick={() => setStatusFilter('all')}
          className={`rounded-lg border-2 p-3 text-left transition-all hover:shadow-md ${
            statusFilter === 'all'
              ? 'border-primary-600 bg-primary-50'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-600">{t('total')}</span>
            <FileText className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{statusCounts.total}</div>
        </button>

        {/* Draft */}
        <button
          onClick={() => setStatusFilter('draft')}
          className={`rounded-lg border-2 p-3 text-left transition-all hover:shadow-md ${
            statusFilter === 'draft'
              ? 'border-gray-400 bg-gray-50'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-600">{t('draft')}</span>
            <div className="w-2 h-2 rounded-full bg-gray-400"></div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{statusCounts.draft}</div>
        </button>

        {/* Sent */}
        <button
          onClick={() => setStatusFilter('sent')}
          className={`rounded-lg border-2 p-3 text-left transition-all hover:shadow-md ${
            statusFilter === 'sent'
              ? 'border-primary-500 bg-primary-50'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-600">{t('sent')}</span>
            <div className="w-2 h-2 rounded-full bg-primary-500"></div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{statusCounts.sent}</div>
        </button>

        {/* Confirmed */}
        <button
          onClick={() => setStatusFilter('confirmed')}
          className={`rounded-lg border-2 p-3 text-left transition-all hover:shadow-md ${
            statusFilter === 'confirmed'
              ? 'border-green-500 bg-green-50'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-600">{t('confirmed')}</span>
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{statusCounts.confirmed}</div>
        </button>

        {/* Completed */}
        <button
          onClick={() => setStatusFilter('completed')}
          className={`rounded-lg border-2 p-3 text-left transition-all hover:shadow-md ${
            statusFilter === 'completed'
              ? 'border-purple-500 bg-purple-50'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-600">{t('completed')}</span>
            <div className="w-2 h-2 rounded-full bg-purple-500"></div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{statusCounts.completed}</div>
        </button>

        {/* Cancelled */}
        <button
          onClick={() => setStatusFilter('cancelled')}
          className={`rounded-lg border-2 p-3 text-left transition-all hover:shadow-md ${
            statusFilter === 'cancelled'
              ? 'border-red-500 bg-red-50'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-600">{t('cancelled')}</span>
            <div className="w-2 h-2 rounded-full bg-red-500"></div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{statusCounts.cancelled}</div>
        </button>
      </div>

      {/* ⭐ SLIM SEARCH BAR */}
      <div className="relative">
        <input
          type="text"
          placeholder={t('searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-3 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
        />
      </div>

      <div className="text-xs text-gray-500">
        {t('showingOf', { count: filteredItineraries.length, total: itineraries.length })}
      </div>

      {/* ⭐ COMPACT TABLE - Linear Style */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-600 whitespace-nowrap">{t('code')}</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-600 whitespace-nowrap">{t('created')}</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-600 whitespace-nowrap">{t('client')}</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-600 whitespace-nowrap">{t('trip')}</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-600 whitespace-nowrap">{t('dates')}</th>
                <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-600 whitespace-nowrap">{t('days')}</th>
                <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-600 whitespace-nowrap">{t('pax')}</th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-600 whitespace-nowrap">{t('cost')}</th>
                <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-600 whitespace-nowrap">{t('lang')}</th>
                <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-600 whitespace-nowrap">{t('status')}</th>
                <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-600 whitespace-nowrap sticky right-0 bg-gray-50">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredItineraries.map((itinerary) => (
                <tr key={itinerary.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium bg-primary-50 text-primary-700 border border-primary-200">
                      {itinerary.itinerary_code}
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="text-xs text-gray-500">
                      {new Date(itinerary.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-sm font-medium text-gray-900">{itinerary.client_name}</div>
                    <div className="text-xs text-gray-500 truncate max-w-[150px]">{itinerary.client_email}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-sm text-gray-700 max-w-[250px] truncate">{itinerary.trip_name}</div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="text-xs text-gray-700">
                      {new Date(itinerary.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(itinerary.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center whitespace-nowrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700">
                      {itinerary.total_days}d
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center text-xs whitespace-nowrap">
                    <div className="text-gray-700">
                      {itinerary.num_adults}A
                      {itinerary.num_children > 0 && <span className="text-gray-500"> / {itinerary.num_children}C</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <div className="text-sm font-semibold text-gray-900">
                      {itinerary.currency} {itinerary.total_cost.toFixed(0)}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center whitespace-nowrap">
                    <LanguageIndicator availableLanguages={itinerary.available_languages || []} />
                  </td>
                  <td className="px-3 py-3 text-center whitespace-nowrap">
                    <select
                      value={itinerary.status}
                      onChange={(e) => updateStatus(itinerary.id, e.target.value)}
                      disabled={updatingStatus === itinerary.id}
                      className={`text-xs font-medium capitalize px-2 py-1 rounded border cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 ${getStatusColor(itinerary.status)} ${
                        updatingStatus === itinerary.id ? 'opacity-50' : ''
                      }`}
                    >
                      <option value="draft">{t('draft')}</option>
                      <option value="sent">{t('sent')}</option>
                      <option value="confirmed">{t('confirmed')}</option>
                      <option value="completed">{t('completed')}</option>
                      <option value="cancelled">{t('cancelled')}</option>
                    </select>
                  </td>
                  <td className="px-3 py-3 sticky right-0 bg-white">
                    <div className="flex gap-1 justify-center">
                      <button
                        onClick={() => router.push(`/itineraries/${itinerary.id}`)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-primary-600 transition-colors"
                        title={t('view')}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => router.push(`/itineraries/${itinerary.id}/edit`)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors"
                        title={t('edit')}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteItinerary(itinerary.id)}
                        className={`p-1.5 rounded transition-colors ${
                          deleteConfirm === itinerary.id
                            ? 'bg-red-500 text-white hover:bg-red-600'
                            : 'text-gray-600 hover:bg-red-50 hover:text-red-600'
                        }`}
                        title={deleteConfirm === itinerary.id ? t('clickToConfirm') : t('delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredItineraries.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-base font-medium text-gray-900">{t('noItinerariesFound')}</p>
            <p className="mt-1 text-sm text-gray-500">{t('tryAdjusting')}</p>
          </div>
        )}
      </div>

      {/* Load more (server-side pagination) */}
      {itineraries.length < totalCount && (
        <div className="flex justify-center">
          <button
            onClick={() => fetchItineraries(page + 1)}
            disabled={loadingMore}
            className="px-4 py-2 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors disabled:opacity-50"
          >
            {loadingMore
              ? t('loadingItineraries')
              : `${t('loadMore')} (${itineraries.length}/${totalCount})`}
          </button>
        </div>
      )}
{/* Toast Notifications */}
{toasts.length > 0 && (
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 space-y-2">
          {toasts.map(toast => (
            <div
              key={toast.id}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg ${
                toast.type === 'success' ? 'bg-green-50 border-green-200' :
                toast.type === 'error' ? 'bg-red-50 border-red-200' :
                'bg-blue-50 border-blue-200'
              }`}
            >
              {toast.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600" />
              )}
              <span className={`text-sm font-medium ${
                toast.type === 'success' ? 'text-green-800' :
                toast.type === 'error' ? 'text-red-800' :
                'text-blue-800'
              }`}>{toast.message}</span>
              <button 
                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                className="ml-2 hover:opacity-70"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}