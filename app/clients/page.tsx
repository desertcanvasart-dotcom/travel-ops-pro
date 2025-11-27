'use client'

import { 
  Users, UserPlus, Search, Filter, Star, TrendingUp, Calendar,
  Phone, Mail, MessageSquare, AlertCircle, CheckCircle, Clock,
  Trash2, SlidersHorizontal, X
} from 'lucide-react'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

interface ClientSummary {
  id: string
  client_code: string
  first_name: string
  last_name: string
  email: string
  phone?: string
  nationality?: string
  client_type: string
  vip_status: boolean
  status: string
  total_bookings_count: number
  total_revenue_generated: number
  last_contacted_at?: string
  created_at: string
  pending_followups: number
  total_communications: number
}

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  
  // Enhanced Filters
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    clientType: 'all',
    vipOnly: false,
    sortBy: 'recent',
    dateFrom: '',
    dateTo: ''
  })
  
  // Stats
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    vip: 0,
    newThisMonth: 0,
    totalRevenue: 0
  })

  const supabase = createClient()

  useEffect(() => {
    fetchClients()
    fetchStats()
  }, [filters])

  const fetchClients = async () => {
    try {
      setLoading(true)
      let query = supabase
        .from('client_summary')
        .select('*')

      // Apply search filter
      if (filters.search) {
        query = query.or(`first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,client_code.ilike.%${filters.search}%`)
      }

      // Apply status filter
      if (filters.status !== 'all') {
        query = query.eq('status', filters.status)
      }

      // Apply client type filter
      if (filters.clientType !== 'all') {
        query = query.eq('client_type', filters.clientType)
      }

      // Apply VIP filter
      if (filters.vipOnly) {
        query = query.eq('vip_status', true)
      }

      // Apply date range filter
      if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom)
      }
      if (filters.dateTo) {
        query = query.lte('created_at', filters.dateTo + 'T23:59:59')
      }

      // Apply sorting
      switch (filters.sortBy) {
        case 'name':
          query = query.order('first_name', { ascending: true })
          break
        case 'name_desc':
          query = query.order('first_name', { ascending: false })
          break
        case 'revenue':
          query = query.order('total_revenue_generated', { ascending: false })
          break
        case 'revenue_asc':
          query = query.order('total_revenue_generated', { ascending: true })
          break
        case 'bookings':
          query = query.order('total_bookings_count', { ascending: false })
          break
        case 'recent':
          query = query.order('created_at', { ascending: false })
          break
        case 'oldest':
          query = query.order('created_at', { ascending: true })
          break
        default:
          query = query.order('created_at', { ascending: false })
      }

      const { data, error } = await query

      if (error) throw error
      setClients(data || [])
    } catch (error) {
      console.error('Error fetching clients:', error)
    } finally {
      setLoading(false)
    }
  }

  const deleteClient = async (clientId: string, clientName: string) => {
    const confirmed = confirm(
      `Are you sure you want to delete ${clientName}?\n\nThis will also delete:\n- All client notes\n- All communications history\n- All follow-ups\n- Client preferences\n\nThis action cannot be undone!`
    )
    
    if (!confirmed) return
  
    try {
      setLoading(true)
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', clientId)
  
      if (error) throw error
      alert('Client deleted successfully!')
      fetchClients()
    } catch (error) {
      console.error('Error deleting client:', error)
      alert('Failed to delete client. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const { data: allClients } = await supabase
        .from('clients')
        .select('status, vip_status, total_revenue_generated, created_at')

      if (allClients) {
        const now = new Date()
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

        setStats({
          total: allClients.length,
          active: allClients.filter(c => c.status === 'active').length,
          vip: allClients.filter(c => c.vip_status).length,
          newThisMonth: allClients.filter(c => new Date(c.created_at) >= firstDayOfMonth).length,
          totalRevenue: allClients.reduce((sum, c) => sum + (c.total_revenue_generated || 0), 0)
        })
      }
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }

  const handleFilterChange = (key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const clearFilters = () => {
    setFilters({
      search: '',
      status: 'all',
      clientType: 'all',
      vipOnly: false,
      sortBy: 'recent',
      dateFrom: '',
      dateTo: ''
    })
  }

  const hasActiveFilters = 
    filters.search || 
    filters.status !== 'all' || 
    filters.clientType !== 'all' || 
    filters.vipOnly || 
    filters.dateFrom || 
    filters.dateTo ||
    filters.sortBy !== 'recent'

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'inactive': return 'bg-gray-100 text-gray-800'
      case 'prospect': return 'bg-primary-100 text-primary-800'
      case 'blacklisted': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'individual': return 'bg-purple-100 text-purple-800'
      case 'family': return 'bg-pink-100 text-pink-800'
      case 'group': return 'bg-orange-100 text-orange-800'
      case 'corporate': return 'bg-primary-100 text-primary-800'
      case 'agent': return 'bg-indigo-100 text-indigo-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-gray-400" />
                Client Management
              </h1>
              <p className="mt-1 text-xs text-gray-500">
                Manage your clients, track communications, and monitor relationships
              </p>
            </div>
            <Link
              href="/clients/new"
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              New Client
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
          {/* Total Clients */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-400" />
                <div className="w-1.5 h-1.5 rounded-full bg-primary-600" />
              </div>
            </div>
            <p className="text-xs text-gray-600">Total Clients</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
          </div>

          {/* Active */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-gray-400" />
                <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
              </div>
            </div>
            <p className="text-xs text-gray-600">Active</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.active}</p>
          </div>

          {/* VIP */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-gray-400" />
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
              </div>
            </div>
            <p className="text-xs text-gray-600">VIP Clients</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.vip}</p>
          </div>

          {/* New This Month */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-gray-400" />
                <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
              </div>
            </div>
            <p className="text-xs text-gray-600">New (This Month)</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.newThisMonth}</p>
          </div>

          {/* Total Revenue */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-gray-400" />
                <div className="w-1.5 h-1.5 rounded-full bg-purple-600" />
              </div>
            </div>
            <p className="text-xs text-gray-600">Total Revenue</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              €{stats.totalRevenue.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Enhanced Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-4">
          {/* Search Bar - Always Visible */}
          <div className="p-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search by name, email, phone, or client code..."
                  value={filters.search}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  showFilters || hasActiveFilters
                    ? 'bg-primary-50 border-primary-300 text-primary-700'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                Filters
                {hasActiveFilters && (
                  <span className="bg-primary-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                    {[filters.status !== 'all', filters.clientType !== 'all', filters.vipOnly, filters.dateFrom, filters.dateTo, filters.sortBy !== 'recent'].filter(Boolean).length}
                  </span>
                )}
              </button>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Advanced Filters - Collapsible */}
          {showFilters && (
            <div className="px-3 pb-3 border-t border-gray-200 pt-3">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Status Filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    value={filters.status}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="prospect">Prospect</option>
                    <option value="blacklisted">Blacklisted</option>
                  </select>
                </div>

                {/* Client Type Filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Client Type
                  </label>
                  <select
                    value={filters.clientType}
                    onChange={(e) => handleFilterChange('clientType', e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Types</option>
                    <option value="individual">Individual</option>
                    <option value="family">Family</option>
                    <option value="corporate">Corporate</option>
                    <option value="agent">Travel Agent</option>
                    <option value="group">Group</option>
                  </select>
                </div>

                {/* Sort By */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Sort By
                  </label>
                  <select
                    value={filters.sortBy}
                    onChange={(e) => handleFilterChange('sortBy', e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="recent">Most Recent</option>
                    <option value="oldest">Oldest First</option>
                    <option value="name">Name (A-Z)</option>
                    <option value="name_desc">Name (Z-A)</option>
                    <option value="revenue">Revenue (High to Low)</option>
                    <option value="revenue_asc">Revenue (Low to High)</option>
                    <option value="bookings">Bookings (Most)</option>
                  </select>
                </div>

                {/* VIP Toggle */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    VIP Clients
                  </label>
                  <label className="flex items-center gap-2 px-2 py-1.5 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={filters.vipOnly}
                      onChange={(e) => handleFilterChange('vipOnly', e.target.checked)}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <Star className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm text-gray-700">VIP Only</span>
                  </label>
                </div>
              </div>

              {/* Date Range */}
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Member Since (From)
                  </label>
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Member Since (To)
                  </label>
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Clients Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-3 text-sm text-gray-600">Loading clients...</p>
            </div>
          ) : clients.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-gray-900 mb-2">No clients found</h3>
              <p className="text-sm text-gray-600 mb-4">
                {hasActiveFilters
                  ? 'Try adjusting your search or filters'
                  : 'Get started by adding your first client'}
              </p>
              {hasActiveFilters ? (
                <button
                  onClick={clearFilters}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700"
                >
                  <X className="w-4 h-4" />
                  Clear Filters
                </button>
              ) : (
                <Link
                  href="/clients/new"
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700"
                >
                  <UserPlus className="w-4 h-4" />
                  Add First Client
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Client
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type & Status
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Bookings
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Revenue
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Activity
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {clients.map((client) => (
                    <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
                            <span className="text-primary-600 font-semibold text-xs">
                              {client.first_name[0]}{client.last_name[0]}
                            </span>
                          </div>
                          <div className="ml-3">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/clients/${client.id}`}
                                className="text-sm font-medium text-gray-900 hover:text-primary-600"
                              >
                                {client.first_name} {client.last_name}
                              </Link>
                              {client.vip_status && (
                                <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                              )}
                            </div>
                            <div className="text-xs text-gray-500">{client.client_code}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{client.email}</div>
                        {client.phone && (
                          <div className="text-xs text-gray-500">{client.phone}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${getTypeColor(client.client_type)}`}>
                            {client.client_type}
                          </span>
                          <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusColor(client.status)}`}>
                            {client.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        <div className="font-semibold">{client.total_bookings_count}</div>
                        <div className="text-xs text-gray-500">bookings</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <div className="font-semibold text-green-600">
                          €{client.total_revenue_generated.toLocaleString()}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <div className="flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />
                            <span>{client.total_communications}</span>
                          </div>
                          {client.pending_followups > 0 && (
                            <div className="flex items-center gap-1 text-orange-600">
                              <Clock className="w-3 h-3" />
                              <span>{client.pending_followups}</span>
                            </div>
                          )}
                        </div>
                        {client.last_contacted_at && (
                          <div className="text-xs text-gray-500 mt-1">
                            Last: {new Date(client.last_contacted_at).toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/clients/${client.id}`}
                            className="text-primary-600 hover:text-primary-800"
                          >
                            View
                          </Link>
                          <span className="text-gray-300">|</span>
                          <Link
                            href={`/clients/${client.id}/edit`}
                            className="text-gray-600 hover:text-gray-800"
                          >
                            Edit
                          </Link>
                          <span className="text-gray-300">|</span>
                          <button
                            onClick={() => deleteClient(client.id, `${client.first_name} ${client.last_name}`)}
                            className="text-red-600 hover:text-red-800 font-medium"
                            title="Delete client"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Results Count */}
        {!loading && clients.length > 0 && (
          <div className="mt-3 text-center text-xs text-gray-600">
            Showing {clients.length} client{clients.length !== 1 ? 's' : ''}
            {hasActiveFilters && ' (filtered)'}
          </div>
        )}
      </div>
    </div>
  )
}