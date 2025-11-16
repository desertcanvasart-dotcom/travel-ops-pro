'use client'

import { useEffect, useState } from 'react'
import Navigation from '../components/Navigation'
import { useRouter } from 'next/navigation'

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
}

export default function ItinerariesPage() {
  const [itineraries, setItineraries] = useState<Itinerary[]>([])
  const [filteredItineraries, setFilteredItineraries] = useState<Itinerary[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    fetchItineraries()
  }, [])

  useEffect(() => {
    filterItineraries()
  }, [itineraries, searchQuery, statusFilter])

  const fetchItineraries = async () => {
    try {
      const response = await fetch('/api/itineraries')
      const data = await response.json()
      if (data.success) {
        setItineraries(data.data)
      }
    } catch (error) {
      console.error('Error fetching itineraries:', error)
    } finally {
      setLoading(false)
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
        setDeleteConfirm(null)
      } else {
        alert('Failed to delete itinerary: ' + data.error)
      }
    } catch (error) {
      console.error('Error deleting itinerary:', error)
      alert('Failed to delete itinerary')
    }
  }

  const getStatusColor = (status: string) => {
    const colors: any = {
      draft: 'bg-gray-100 text-gray-700',
      sent: 'bg-blue-100 text-blue-700',
      confirmed: 'bg-green-100 text-green-700',
      completed: 'bg-purple-100 text-purple-700',
      cancelled: 'bg-red-100 text-red-700'
    }
    return colors[status] || 'bg-gray-100 text-gray-700'
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
        <Navigation />
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading itineraries...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
      <Navigation />

      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Itinerary Management</h1>
            <p className="text-gray-600">Create and manage client trip itineraries</p>
          </div>
          <button
            onClick={() => router.push('/itineraries/new')}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <span className="text-xl">+</span>
            Create New Itinerary
          </button>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
          <div className="bg-blue-600 text-white rounded-xl p-6 text-center">
            <div className="text-sm mb-2">Total</div>
            <div className="text-4xl font-bold">{statusCounts.total}</div>
            <div className="text-2xl mt-2">📋</div>
          </div>
          <div className="bg-gray-600 text-white rounded-xl p-6 text-center">
            <div className="text-sm mb-2">Draft</div>
            <div className="text-4xl font-bold">{statusCounts.draft}</div>
            <div className="text-2xl mt-2">📝</div>
          </div>
          <div className="bg-blue-500 text-white rounded-xl p-6 text-center">
            <div className="text-sm mb-2">Sent</div>
            <div className="text-4xl font-bold">{statusCounts.sent}</div>
            <div className="text-2xl mt-2">📤</div>
          </div>
          <div className="bg-green-600 text-white rounded-xl p-6 text-center">
            <div className="text-sm mb-2">Confirmed</div>
            <div className="text-4xl font-bold">{statusCounts.confirmed}</div>
            <div className="text-2xl mt-2">✓</div>
          </div>
          <div className="bg-purple-600 text-white rounded-xl p-6 text-center">
            <div className="text-sm mb-2">Completed</div>
            <div className="text-4xl font-bold">{statusCounts.completed}</div>
            <div className="text-2xl mt-2">🎉</div>
          </div>
          <div className="bg-red-600 text-white rounded-xl p-6 text-center">
            <div className="text-sm mb-2">Cancelled</div>
            <div className="text-4xl font-bold">{statusCounts.cancelled}</div>
            <div className="text-2xl mt-2">✕</div>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6 flex gap-4">
          <div className="flex-1">
            <div className="relative">
              <span className="absolute left-3 top-3 text-gray-400">🔍</span>
              <input
                type="text"
                placeholder="Search by client name, trip name, or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        <div className="text-sm text-gray-600 mb-4">
          Showing <span className="font-bold">{filteredItineraries.length}</span> of {itineraries.length} itineraries
        </div>

        {/* Itineraries Table */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <table className="w-full">
            <thead className="bg-blue-600 text-white">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold">Code</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Client</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Trip Name</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Dates</th>
                <th className="px-6 py-3 text-center text-sm font-semibold">Duration</th>
                <th className="px-6 py-3 text-center text-sm font-semibold">Pax</th>
                <th className="px-6 py-3 text-right text-sm font-semibold">Total Cost</th>
                <th className="px-6 py-3 text-center text-sm font-semibold">Status</th>
                <th className="px-6 py-3 text-center text-sm font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredItineraries.map((itinerary) => (
                <tr key={itinerary.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="text-sm font-mono text-blue-600">{itinerary.itinerary_code}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{itinerary.client_name}</div>
                    <div className="text-sm text-gray-500">{itinerary.client_email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{itinerary.trip_name}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    <div>{new Date(itinerary.start_date).toLocaleDateString()}</div>
                    <div className="text-xs">to {new Date(itinerary.end_date).toLocaleDateString()}</div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-block bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">
                      {itinerary.total_days} days
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center text-sm">
                    <div>{itinerary.num_adults} adults</div>
                    <div className="text-xs text-gray-500">{itinerary.num_children} children</div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="font-bold text-green-600">
                      {itinerary.currency} {itinerary.total_cost.toFixed(2)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(itinerary.status)}`}>
                      {itinerary.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => router.push(`/itineraries/${itinerary.id}`)}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm flex items-center gap-1"
                      >
                        👁️ View
                      </button>
                      <button
                        onClick={() => router.push(`/itineraries/${itinerary.id}/edit`)}
                        className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 text-sm flex items-center gap-1"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        onClick={() => deleteItinerary(itinerary.id)}
                        className={`px-4 py-2 rounded-lg text-sm flex items-center gap-1 ${
                          deleteConfirm === itinerary.id
                            ? 'bg-red-600 text-white hover:bg-red-700'
                            : 'bg-red-100 text-red-700 hover:bg-red-200'
                        }`}
                      >
                        {deleteConfirm === itinerary.id ? '⚠️ Confirm?' : '🗑️ Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredItineraries.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <div className="text-6xl mb-4">📭</div>
              <p className="text-xl font-medium">No itineraries found</p>
              <p className="mt-2">Try adjusting your search or filters</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
