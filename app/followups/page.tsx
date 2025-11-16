'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import {
  Calendar, Clock, AlertCircle, CheckCircle, Phone, Mail, 
  MessageSquare, Users, TrendingUp, Filter, X
} from 'lucide-react'

const supabase = createClient()

interface Followup {
  id: string
  client_id: string
  followup_type: string
  due_date: string
  priority: string
  status: string
  notes: string | null
  created_at: string
  client: {
    client_code: string
    first_name: string
    last_name: string
    email: string
    phone: string
  }
}

export default function FollowupDashboard() {
  const [followups, setFollowups] = useState<Followup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'today' | 'week' | 'overdue'>('today')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  useEffect(() => {
    loadFollowups()
  }, [])

  const loadFollowups = async () => {
    setIsLoading(true)

    try {
      const { data, error } = await supabase
        .from('client_followups')
        .select(`
          *,
          client:clients!client_id (
            client_code,
            first_name,
            last_name,
            email,
            phone
          )
        `)
        .eq('status', 'pending')
        .order('due_date', { ascending: true })

      if (error) throw error

      setFollowups(data || [])
    } catch (error) {
      console.error('Error loading follow-ups:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const completeFollowup = async (id: string) => {
    try {
      const { error } = await supabase
        .from('client_followups')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', id)

      if (error) throw error

      loadFollowups()
    } catch (error) {
      console.error('Error completing follow-up:', error)
    }
  }

  const snoozeFollowup = async (id: string, days: number) => {
    try {
      const newDate = new Date()
      newDate.setDate(newDate.getDate() + days)

      const { error } = await supabase
        .from('client_followups')
        .update({ 
          due_date: newDate.toISOString().split('T')[0]
        })
        .eq('id', id)

      if (error) throw error

      loadFollowups()
    } catch (error) {
      console.error('Error snoozing follow-up:', error)
    }
  }

  const deleteFollowup = async (id: string) => {
    if (!confirm('Are you sure you want to delete this follow-up?')) return

    try {
      const { error } = await supabase
        .from('client_followups')
        .delete()
        .eq('id', id)

      if (error) throw error

      loadFollowups()
    } catch (error) {
      console.error('Error deleting follow-up:', error)
    }
  }

  const getFilteredFollowups = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const weekFromNow = new Date()
    weekFromNow.setDate(weekFromNow.getDate() + 7)
    weekFromNow.setHours(23, 59, 59, 999)

    let filtered = followups.filter(f => {
      const dueDate = new Date(f.due_date)
      dueDate.setHours(0, 0, 0, 0)

      if (filter === 'today') {
        return dueDate.getTime() === today.getTime()
      } else if (filter === 'week') {
        return dueDate >= today && dueDate <= weekFromNow
      } else if (filter === 'overdue') {
        return dueDate < today
      }
      return true
    })

    if (priorityFilter !== 'all') {
      filtered = filtered.filter(f => f.priority === priorityFilter)
    }

    if (typeFilter !== 'all') {
      filtered = filtered.filter(f => f.followup_type === typeFilter)
    }

    return filtered
  }

  const filteredFollowups = getFilteredFollowups()

  const stats = {
    today: followups.filter(f => {
      const dueDate = new Date(f.due_date)
      const today = new Date()
      dueDate.setHours(0, 0, 0, 0)
      today.setHours(0, 0, 0, 0)
      return dueDate.getTime() === today.getTime()
    }).length,
    week: followups.filter(f => {
      const dueDate = new Date(f.due_date)
      const today = new Date()
      const weekFromNow = new Date()
      weekFromNow.setDate(weekFromNow.getDate() + 7)
      return dueDate >= today && dueDate <= weekFromNow
    }).length,
    overdue: followups.filter(f => {
      const dueDate = new Date(f.due_date)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      return dueDate < today
    }).length,
    total: followups.length
  }

  const isOverdue = (dateString: string) => {
    const dueDate = new Date(dateString)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return dueDate < today
  }

  const isToday = (dateString: string) => {
    const dueDate = new Date(dateString)
    const today = new Date()
    dueDate.setHours(0, 0, 0, 0)
    today.setHours(0, 0, 0, 0)
    return dueDate.getTime() === today.getTime()
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    })
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-700 border-red-200'
      case 'medium':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200'
      case 'low':
        return 'bg-green-100 text-green-700 border-green-200'
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200'
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'call':
        return Phone
      case 'email':
        return Mail
      case 'whatsapp':
        return MessageSquare
      case 'meeting':
        return Users
      default:
        return Calendar
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Follow-up Dashboard</h1>
              <p className="text-gray-600 mt-1">Never miss a client touchpoint</p>
            </div>
            <Link
              href="/clients"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Back to Clients
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-6 mt-8">
            <div 
              onClick={() => setFilter('today')}
              className={`cursor-pointer rounded-lg p-6 transition-all ${
                filter === 'today' 
                  ? 'bg-blue-600 text-white shadow-lg' 
                  : 'bg-blue-50 hover:bg-blue-100'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <Calendar className="w-6 h-6" />
                <div className={`text-3xl font-bold ${filter === 'today' ? 'text-white' : 'text-blue-600'}`}>
                  {stats.today}
                </div>
              </div>
              <div className={`text-sm font-medium ${filter === 'today' ? 'text-blue-100' : 'text-blue-700'}`}>
                Due Today
              </div>
            </div>

            <div 
              onClick={() => setFilter('week')}
              className={`cursor-pointer rounded-lg p-6 transition-all ${
                filter === 'week' 
                  ? 'bg-purple-600 text-white shadow-lg' 
                  : 'bg-purple-50 hover:bg-purple-100'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <TrendingUp className="w-6 h-6" />
                <div className={`text-3xl font-bold ${filter === 'week' ? 'text-white' : 'text-purple-600'}`}>
                  {stats.week}
                </div>
              </div>
              <div className={`text-sm font-medium ${filter === 'week' ? 'text-purple-100' : 'text-purple-700'}`}>
                This Week
              </div>
            </div>

            <div 
              onClick={() => setFilter('overdue')}
              className={`cursor-pointer rounded-lg p-6 transition-all ${
                filter === 'overdue' 
                  ? 'bg-red-600 text-white shadow-lg' 
                  : 'bg-red-50 hover:bg-red-100'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <AlertCircle className="w-6 h-6" />
                <div className={`text-3xl font-bold ${filter === 'overdue' ? 'text-white' : 'text-red-600'}`}>
                  {stats.overdue}
                </div>
              </div>
              <div className={`text-sm font-medium ${filter === 'overdue' ? 'text-red-100' : 'text-red-700'}`}>
                Overdue
              </div>
            </div>

            <div 
              onClick={() => setFilter('all')}
              className={`cursor-pointer rounded-lg p-6 transition-all ${
                filter === 'all' 
                  ? 'bg-gray-600 text-white shadow-lg' 
                  : 'bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <Clock className="w-6 h-6" />
                <div className={`text-3xl font-bold ${filter === 'all' ? 'text-white' : 'text-gray-600'}`}>
                  {stats.total}
                </div>
              </div>
              <div className={`text-sm font-medium ${filter === 'all' ? 'text-gray-100' : 'text-gray-700'}`}>
                All Pending
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <div className="flex items-center gap-4">
            <Filter className="w-5 h-5 text-gray-400" />
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Priorities</option>
              <option value="high">High Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="low">Low Priority</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Types</option>
              <option value="call">Phone Call</option>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="meeting">Meeting</option>
              <option value="quote">Send Quote</option>
            </select>

            <div className="ml-auto text-sm text-gray-600">
              Showing {filteredFollowups.length} follow-up{filteredFollowups.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Follow-ups List */}
        <div className="space-y-4">
          {filteredFollowups.length === 0 ? (
            <div className="bg-white rounded-xl shadow-lg p-12 text-center">
              <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">All Caught Up!</h3>
              <p className="text-gray-600">No follow-ups matching your filters</p>
            </div>
          ) : (
            filteredFollowups.map((followup) => {
              const TypeIcon = getTypeIcon(followup.followup_type)
              const overdue = isOverdue(followup.due_date)
              const today = isToday(followup.due_date)

              return (
                <div
                  key={followup.id}
                  className={`bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow ${
                    overdue ? 'border-2 border-red-300' : today ? 'border-2 border-blue-300' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      {/* Icon */}
                      <div className={`p-3 rounded-lg ${
                        overdue ? 'bg-red-100' : today ? 'bg-blue-100' : 'bg-gray-100'
                      }`}>
                        <TypeIcon className={`w-6 h-6 ${
                          overdue ? 'text-red-600' : today ? 'text-blue-600' : 'text-gray-600'
                        }`} />
                      </div>

                      {/* Content */}
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Link
                            href={`/clients/${followup.client_id}`}
                            className="text-lg font-bold text-gray-900 hover:text-blue-600"
                          >
                            {followup.client.first_name} {followup.client.last_name}
                          </Link>
                          <span className="text-sm text-gray-500">
                            {followup.client.client_code}
                          </span>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getPriorityColor(followup.priority)}`}>
                            {followup.priority}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                          <div className="flex items-center gap-1">
                            <TypeIcon className="w-4 h-4" />
                            <span className="capitalize">{followup.followup_type}</span>
                          </div>
                          <div className={`flex items-center gap-1 font-medium ${
                            overdue ? 'text-red-600' : today ? 'text-blue-600' : ''
                          }`}>
                            <Calendar className="w-4 h-4" />
                            <span>{formatDate(followup.due_date)}</span>
                            {overdue && <span className="text-xs">(Overdue)</span>}
                            {today && <span className="text-xs">(Today)</span>}
                          </div>
                        </div>

                        {followup.notes && (
                          <p className="text-sm text-gray-700 mt-2 bg-gray-50 p-3 rounded-lg">
                            {followup.notes}
                          </p>
                        )}

                        {/* Contact Info */}
                        <div className="flex items-center gap-4 mt-3 text-sm">
                          {followup.client.phone && (
                            
                              href={`tel:${followup.client.phone}`}
                              className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
                            >
                              <Phone className="w-4 h-4" />
                              {followup.client.phone}
                            </a>
                          )}
                          {followup.client.email && (
                            
                              href={`mailto:${followup.client.email}`}
                              className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
                            >
                              <Mail className="w-4 h-4" />
                              {followup.client.email}
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => completeFollowup(followup.id)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center gap-2"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Complete
                      </button>
                      <button
                        onClick={() => snoozeFollowup(followup.id, 1)}
                        className="px-4 py-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 font-medium text-sm"
                      >
                        Snooze 1 day
                      </button>
                      <button
                        onClick={() => snoozeFollowup(followup.id, 7)}
                        className="px-4 py-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 font-medium text-sm"
                      >
                        Snooze 1 week
                      </button>
                      <button
                        onClick={() => deleteFollowup(followup.id)}
                        className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium text-sm flex items-center gap-2"
                      >
                        <X className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}