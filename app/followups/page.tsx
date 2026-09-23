'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import {
  Calendar, Clock, AlertCircle, CheckCircle, Phone, Mail,
  MessageSquare, Users, TrendingUp, Filter, X
} from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { shiftDateISO, todayLocal } from '@/lib/today'

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
  const t = useTranslations('followups')
  const dialog = useConfirmDialog()
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

      // Show success message
      await dialog.alert(t('success'), t('followupCompleted'), 'success')
      loadFollowups()
    } catch (error) {
      console.error('Error completing follow-up:', error)
      await dialog.alert(t('error'), t('failedToCompleteFollowup'), 'warning')
    }
  }

  const snoozeFollowup = async (id: string, days: number) => {
    try {

      const { error } = await supabase
        .from('client_followups')
        .update({
          // Our calendar date + days (toISOString gave the UTC date: a day
          // early in Japan before 09:00).
          due_date: shiftDateISO(todayLocal(), days)
        })
        .eq('id', id)

      if (error) throw error

      // Show success message
      await dialog.alert(t('snoozed'), t('followupSnoozed', { days }), 'success')
      loadFollowups()
    } catch (error) {
      console.error('Error snoozing follow-up:', error)
      await dialog.alert(t('error'), t('failedToSnoozeFollowup'), 'warning')
    }
  }

  const deleteFollowup = async (id: string) => {
    const confirmed = await dialog.confirmDelete(t('followup'))
    if (!confirmed) return

    try {
      const { error } = await supabase
        .from('client_followups')
        .delete()
        .eq('id', id)

      if (error) throw error

      await dialog.alert(t('deleted'), t('followupDeleted'), 'success')
      loadFollowups()
    } catch (error) {
      console.error('Error deleting follow-up:', error)
      await dialog.alert(t('error'), t('failedToDeleteFollowup'), 'warning')
    }
  }

  const getFilteredFollowups = () => {
    // Calendar dates compared as YYYY-MM-DD strings in OUR timezone. Parsing
    // the date column with new Date() gives UTC midnight — 09:00 in Japan — so
    // a follow-up due today turned "overdue" at 09:00 and dropped out of "this
    // week"; comparisons mixed that with local midnight and with "now".
    const today = todayLocal()
    const weekEnd = shiftDateISO(today, 7)

    let filtered = followups.filter(f => {
      const due = f.due_date.slice(0, 10)
      if (filter === 'today') {
        return due === today
      } else if (filter === 'week') {
        return due >= today && due <= weekEnd
      } else if (filter === 'overdue') {
        return due < today
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

  const todayStr = todayLocal()
  const weekEndStr = shiftDateISO(todayStr, 7)
  const stats = {
    today: followups.filter(f => f.due_date.slice(0, 10) === todayStr).length,
    week: followups.filter(f => f.due_date.slice(0, 10) >= todayStr && f.due_date.slice(0, 10) <= weekEndStr).length,
    overdue: followups.filter(f => f.due_date.slice(0, 10) < todayStr).length,
    total: followups.length
  }

  const isOverdue = (dateString: string) => dateString.slice(0, 10) < todayLocal()

  const isToday = (dateString: string) => dateString.slice(0, 10) === todayLocal()

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
        return 'bg-danger/10 text-danger border-danger/20'
      case 'medium':
        return 'bg-warning/10 text-warning border-warning/20'
      case 'low':
        return 'bg-success/10 text-success border-success/20'
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('followupDashboard')}</h1>
            <p className="text-sm text-gray-600 mt-1">{t('neverMissClientTouchpoint')}</p>
          </div>
          <Link
            href="/clients"
            className="px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 font-medium"
          >
            {t('backToClients')}
          </Link>
        </div>

        {/* Stats - White cards with dots */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          <div 
            onClick={() => setFilter('today')}
            className={`cursor-pointer rounded-lg border p-4 transition-all ${
              filter === 'today' 
                ? 'border-primary-600 bg-primary-50 shadow-sm' 
                : 'border-gray-200 bg-white hover:border-primary-300 shadow-sm'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <div className="w-1.5 h-1.5 rounded-full bg-primary-600" />
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {stats.today}
            </div>
            <div className="text-xs font-medium text-gray-600 mt-1">
              {t('dueToday')}
            </div>
          </div>

          <div
            onClick={() => setFilter('week')}
            className={`cursor-pointer rounded-lg border p-4 transition-all ${
              filter === 'week'
                ? 'border-purple-600 bg-purple-50 shadow-sm'
                : 'border-gray-200 bg-white hover:border-purple-300 shadow-sm'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-gray-400" />
              <div className="w-1.5 h-1.5 rounded-full bg-purple-600" />
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {stats.week}
            </div>
            <div className="text-xs font-medium text-gray-600 mt-1">
              {t('thisWeek')}
            </div>
          </div>

          <div
            onClick={() => setFilter('overdue')}
            className={`cursor-pointer rounded-lg border p-4 transition-all ${
              filter === 'overdue'
                ? 'border-danger bg-red-50 shadow-sm'
                : 'border-gray-200 bg-white hover:border-red-300 shadow-sm'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-gray-400" />
              <div className="w-1.5 h-1.5 rounded-full bg-danger" />
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {stats.overdue}
            </div>
            <div className="text-xs font-medium text-gray-600 mt-1">
              {t('overdue')}
            </div>
          </div>

          <div
            onClick={() => setFilter('all')}
            className={`cursor-pointer rounded-lg border p-4 transition-all ${
              filter === 'all'
                ? 'border-gray-600 bg-gray-50 shadow-sm'
                : 'border-gray-200 bg-white hover:border-gray-400 shadow-sm'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <div className="w-1.5 h-1.5 rounded-full bg-gray-600" />
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {stats.total}
            </div>
            <div className="text-xs font-medium text-gray-600 mt-1">
              {t('allPending')}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">{t('allPriorities')}</option>
            <option value="high">{t('highPriority')}</option>
            <option value="medium">{t('mediumPriority')}</option>
            <option value="low">{t('lowPriority')}</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">{t('allTypes')}</option>
            <option value="call">{t('phoneCall')}</option>
            <option value="email">{t('email')}</option>
            <option value="whatsapp">{t('whatsapp')}</option>
            <option value="meeting">{t('meeting')}</option>
            <option value="quote">{t('sendQuote')}</option>
          </select>

          <div className="ml-auto text-xs text-gray-600">
            {t('showingFollowups', { count: filteredFollowups.length })}
          </div>
        </div>
      </div>

      {/* Follow-ups List */}
      <div className="space-y-3">
        {filteredFollowups.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <CheckCircle className="w-12 h-12 text-success mx-auto mb-3" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">{t('allCaughtUp')}</h3>
            <p className="text-sm text-gray-600">{t('noFollowupsMatchingFilters')}</p>
          </div>
        ) : (
          filteredFollowups.map((followup) => {
            const TypeIcon = getTypeIcon(followup.followup_type)
            const overdue = isOverdue(followup.due_date)
            const today = isToday(followup.due_date)

            return (
              <div
                key={followup.id}
                className={`bg-white rounded-lg shadow-sm border p-4 hover:shadow-md transition-all ${
                  overdue ? 'border-danger' : today ? 'border-primary-300' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    {/* Icon */}
                    <div className={`p-2 rounded-lg ${
                      overdue ? 'bg-danger/10' : today ? 'bg-primary-100' : 'bg-gray-100'
                    }`}>
                      <TypeIcon className={`w-4 h-4 ${
                        overdue ? 'text-danger' : today ? 'text-primary-600' : 'text-gray-600'
                      }`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Link
                          href={`/clients/${followup.client_id}`}
                          className="text-base font-bold text-gray-900 hover:text-primary-600"
                          >
                            {followup.client?.first_name || t('unknown')} {followup.client?.last_name || t('client')}
                          </Link>
                          <span className="text-xs text-gray-500">
                            {followup.client?.client_code || t('noClientLinked')}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getPriorityColor(followup.priority)}`}>
                          {t(followup.priority)}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-gray-600 mb-2">
                        <div className="flex items-center gap-1">
                          <TypeIcon className="w-3 h-3" />
                          <span className="capitalize">{followup.followup_type}</span>
                        </div>
                        <div className={`flex items-center gap-1 font-medium ${
                          overdue ? 'text-danger' : today ? 'text-primary-600' : ''
                        }`}>
                          <Calendar className="w-3 h-3" />
                          <span>{formatDate(followup.due_date)}</span>
                          {overdue && <span className="text-xs">({t('overdue')})</span>}
                          {today && <span className="text-xs">({t('today')})</span>}
                        </div>
                      </div>

                      {followup.notes && (
                        <p className="text-xs text-gray-700 mt-2 bg-gray-50 p-2 rounded-lg">
                          {followup.notes}
                        </p>
                      )}
                    
                      {/* Contact Info */}
                        <div className="flex items-center gap-3 mt-2 text-xs">
                        {followup.client?.phone && (
  
                        <a  href={`tel:${followup.client?.phone}`}
                          className="flex items-center gap-1 text-primary-600 hover:text-primary-700"
                                >
                            <Phone className="w-3 h-3" />
                          {followup.client?.phone}
                              </a>
                         )}

                        {followup.client?.email && (
                          <a
                            href={`mailto:${followup.client?.email}`}
                            className="flex items-center gap-1 text-primary-600 hover:text-primary-700"
                          >
                            <Mail className="w-3 h-3" />
                            {followup.client?.email}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => completeFollowup(followup.id)}
                      className="px-3 py-1.5 bg-success text-white text-sm rounded-lg hover:bg-success/90 font-medium flex items-center gap-2 whitespace-nowrap"
                    >
                      <CheckCircle className="w-3 h-3" />
                      {t('complete')}
                    </button>
                    <button
                      onClick={() => snoozeFollowup(followup.id, 1)}
                      className="px-3 py-1.5 bg-warning/10 text-warning text-xs rounded-lg hover:bg-warning/20 font-medium whitespace-nowrap"
                    >
                      {t('snooze1Day')}
                    </button>
                    <button
                      onClick={() => snoozeFollowup(followup.id, 7)}
                      className="px-3 py-1.5 bg-warning/10 text-warning text-xs rounded-lg hover:bg-warning/20 font-medium whitespace-nowrap"
                    >
                      {t('snooze1Week')}
                    </button>
                    <button
                      onClick={() => deleteFollowup(followup.id)}
                      className="px-3 py-1.5 bg-danger/10 text-danger text-xs rounded-lg hover:bg-danger/20 font-medium flex items-center gap-2 whitespace-nowrap"
                    >
                      <X className="w-3 h-3" />
                      {t('delete')}
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}