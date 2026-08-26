'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/app/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import {
  Users,
  CheckSquare,
  FileText,
  TrendingUp,
  Clock,
  ArrowRight,
  AlertCircle,
  Calendar,
  MessageSquare,
  DollarSign,
  Activity,
  Sparkles,
  MapPin,
  Mail,
  CheckCircle,
  Package,
  CalendarDays,
  Layers,
  AlertTriangle,
  Wallet,
  CreditCard,
  Receipt,
} from 'lucide-react'

const supabase = createClient()

interface DashboardStats {
  totalClients: number
  clientsThisMonth: number
  clientsPrevMonth: number
  activeClients: number
  pendingFollowups: number
  overdueFollowups: number
  totalQuotes: number
  quotesSent: number
  quotesConfirmed: number
  upcomingTrips: number
  // Operations row — real counts from /api/dashboard/summary
  departingSoon: number
  departingSoonItems: { id: string; booking_code?: string; trip_name?: string; client_name?: string; start_date?: string }[]
  tripsInProgress: number
  tasksDueToday: number
  tasksOverdue: number
  unreadInbox: number
  todayQuotesCreated: number
  todayBookingsCreated: number
  todayPaymentsReceived: number
}

export default function DashboardPage() {
  const t = useTranslations('dashboard')
  const tCommon = useTranslations('common')
  const tDates = useTranslations('dates')
  const { profile } = useAuth()
  const { canViewFinancials } = useRole()
  const [money, setMoney] = useState<any | null>(null)
  const [stats, setStats] = useState<DashboardStats>({
    totalClients: 0,
    clientsThisMonth: 0,
    clientsPrevMonth: 0,
    activeClients: 0,
    pendingFollowups: 0,
    overdueFollowups: 0,
    totalQuotes: 0,
    quotesSent: 0,
    quotesConfirmed: 0,
    upcomingTrips: 0,
    departingSoon: 0,
    departingSoonItems: [],
    tripsInProgress: 0,
    tasksDueToday: 0,
    tasksOverdue: 0,
    unreadInbox: 0,
    todayQuotesCreated: 0,
    todayBookingsCreated: 0,
    todayPaymentsReceived: 0
  })
  const [attention, setAttention] = useState<any[]>([])
  const [recentClients, setRecentClients] = useState<any[]>([])
  const [upcomingFollowups, setUpcomingFollowups] = useState<any[]>([])
  const [recentQuotes, setRecentQuotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Get first name from profile
  const firstName = profile?.full_name?.split(' ')[0] || ''

  useEffect(() => {
    loadDashboardData()
  }, [])

  // Money row — fetched only for roles the financial gate admits, so agents
  // never even issue the (middleware-403'd) request.
  useEffect(() => {
    if (!canViewFinancials) return
    let alive = true
    fetch('/api/dashboard/money')
      .then(res => (res.ok ? res.json() : null))
      .then(body => { if (alive && body?.data) setMoney(body.data) })
      .catch(() => {})
    return () => { alive = false }
  }, [canViewFinancials])

  // "¥879,917 · €70" — one figure per currency, never summed across them.
  const CURRENCY_SYMBOLS: Record<string, string> = { JPY: '¥', USD: '$', EUR: '€', EGP: 'E£' }
  const fmtTotals = (t: Record<string, number> | undefined | null) => {
    const entries = Object.entries(t || {}).filter(([, v]) => v !== 0)
    if (entries.length === 0) return '0'
    return entries
      .map(([c, v]) => `${CURRENCY_SYMBOLS[c] || c + ' '}${Math.round(v).toLocaleString()}`)
      .join(' · ')
  }

  async function loadDashboardData() {
    try {
      // One computed summary from the server (ops row, pipeline, today) —
      // every number here is calculated, none are hardcoded strings.
      const [summaryRes, attentionRes] = await Promise.all([
        fetch('/api/dashboard/summary'),
        fetch('/api/dashboard/attention'),
      ])
      const summary = summaryRes.ok ? (await summaryRes.json()).data : null
      const attentionData = attentionRes.ok ? (await attentionRes.json()).data : null
      setAttention(attentionData?.items || [])

      // Recent clients (side panel)
      const { data: clients } = await supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5)

      // Upcoming follow-ups list
      const { data: upcoming } = await supabase
        .from('client_followups')
        .select(`
          *,
          clients (
            id,
            first_name,
            last_name,
            email
          )
        `)
        .eq('status', 'pending')
        .gte('due_date', new Date().toISOString())
        .order('due_date', { ascending: true })
        .limit(5)

      // Recent quotes list (first page is plenty for 5 rows)
      let recentQuotes: any[] = []
      try {
        const res = await fetch('/api/itineraries?page=1')
        if (res.ok) {
          const body = await res.json()
          const rows: any[] = body.data || body.itineraries || []
          recentQuotes = rows.slice(0, 5).map((q: any) => ({
            id: q.id,
            action: `Quote ${q.itinerary_code} for ${q.client_name}`,
            time: new Date(q.created_at).toLocaleString(),
            status: q.status
          }))
        }
      } catch { /* the list is decorative — the counts above are authoritative */ }

      if (summary) {
        setStats({
          totalClients: summary.clients.total,
          clientsThisMonth: summary.clients.thisMonth,
          clientsPrevMonth: summary.clients.prevMonth,
          activeClients: summary.clients.total, // active concept folded into total; row removed below
          pendingFollowups: summary.followups.pending,
          overdueFollowups: summary.followups.overdue,
          totalQuotes: summary.quotes.total,
          quotesSent: summary.quotes.sent,
          quotesConfirmed: summary.quotes.confirmed,
          upcomingTrips: summary.quotes.upcoming30d,
          departingSoon: summary.ops.departingSoon.count,
          departingSoonItems: summary.ops.departingSoon.items,
          tripsInProgress: summary.ops.inProgress,
          tasksDueToday: summary.ops.tasksDueToday,
          tasksOverdue: summary.ops.tasksOverdue,
          unreadInbox: summary.ops.unreadWhatsApp + summary.ops.unreadEmail,
          todayQuotesCreated: summary.today.quotesCreated,
          todayBookingsCreated: summary.today.bookingsCreated,
          todayPaymentsReceived: summary.today.paymentsReceived
        })
      }
      setRecentClients(clients || [])
      setUpcomingFollowups(upcoming || [])
      setRecentQuotes(recentQuotes)
    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {t('welcomeBack')}{firstName ? `, ${firstName}` : ''}! 👋
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          {t('subtitle')}
        </p>
      </div>

      {/* Row 1 — today's operations */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title={t('departingThisWeek')}
          value={stats.departingSoon}
          icon={CalendarDays}
          subtitle={t('next7Days')}
          href="/bookings"
          color="orange"
        />

        <StatCard
          title={t('tripsInProgress')}
          value={stats.tripsInProgress}
          icon={Activity}
          subtitle={t('onTheGround')}
          href="/bookings"
          color="primary"
        />

        <StatCard
          title={t('unreadInbox')}
          value={stats.unreadInbox}
          icon={MessageSquare}
          subtitle={t('acrossWhatsappEmail')}
          href="/communications"
          color="purple"
        />

        <StatCard
          title={t('tasksDueToday')}
          value={stats.tasksDueToday}
          icon={CheckSquare}
          badge={stats.tasksOverdue > 0 ? `${stats.tasksOverdue} ${t('overdue')}` : undefined}
          badgeColor="danger"
          href="/tasks"
          color="warning"
        />
      </div>

      {/* Row 2 — clients & pipeline */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title={t('totalClients')}
          value={stats.totalClients}
          icon={Users}
          trend={stats.clientsThisMonth > 0 ? `+${stats.clientsThisMonth}` : undefined}
          trendUp={stats.clientsThisMonth >= stats.clientsPrevMonth}
          href="/clients"
          color="primary"
          trendLabel={t('newThisMonth')}
        />

        <StatCard
          title={t('pendingFollowups')}
          value={stats.pendingFollowups}
          icon={CheckSquare}
          badge={stats.overdueFollowups > 0 ? `${stats.overdueFollowups} ${t('overdue')}` : undefined}
          badgeColor="danger"
          href="/followups"
          color="warning"
        />

        <StatCard
          title={t('clientQuotes')}
          value={stats.totalQuotes}
          icon={FileText}
          href="/itineraries"
          color="purple"
        />

        <StatCard
          title={t('upcomingTrips')}
          value={stats.upcomingTrips}
          icon={CalendarDays}
          subtitle={t('next30Days')}
          href="/calendar"
          color="orange"
        />
      </div>

      {/* Quick Stats - Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Quotes Sent */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h3 className="text-xs text-gray-600">{t('quotesSent')}</h3>
              <div className="w-1.5 h-1.5 rounded-full bg-purple-600" />
            </div>
            <Mail className="w-4 h-4 text-gray-400" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.quotesSent}</p>
          <p className="text-xs text-gray-500 mt-1">
            {t('sentRate', { percent: stats.totalQuotes > 0
              ? Math.round((stats.quotesSent / stats.totalQuotes) * 100)
              : 0
            })}
          </p>
        </div>

        {/* Confirmed Bookings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h3 className="text-xs text-gray-600">{t('confirmed')}</h3>
              <div className="w-1.5 h-1.5 rounded-full bg-success" />
            </div>
            <CheckCircle className="w-4 h-4 text-gray-400" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.quotesConfirmed}</p>
          <p className="text-xs text-gray-500 mt-1">
            {t('conversion', { percent: stats.quotesSent > 0
              ? Math.round((stats.quotesConfirmed / stats.quotesSent) * 100)
              : 0
            })}
          </p>
        </div>

        {/* New clients this month (real period-over-period, not a slogan) */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h3 className="text-xs text-gray-600">{t('newThisMonth')}</h3>
              <div className="w-1.5 h-1.5 rounded-full bg-primary-600" />
            </div>
            <Users className="w-4 h-4 text-gray-400" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.clientsThisMonth}</p>
          <p className="text-xs text-gray-500 mt-1">{t('vsLastMonth', { count: stats.clientsPrevMonth })}</p>
        </div>
      </div>

      {/* Money row — manager/owner only (mirrors the middleware financial gate) */}
      {canViewFinancials && money && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            title={t('outstandingReceivables')}
            value={fmtTotals(money.receivables.totals)}
            icon={Wallet}
            badge={Object.keys(money.receivables.overdue || {}).length > 0
              ? t('overdueBadge', { amount: fmtTotals(money.receivables.overdue) })
              : undefined}
            badgeColor="danger"
            subtitle={t('invoicesCount', { count: money.receivables.count })}
            href="/accounts-receivable"
            color="primary"
          />
          <StatCard
            title={t('unpaidExpensesBills')}
            value={fmtTotals({
              ...money.payables.expenseTotals,
              ...Object.fromEntries(Object.entries(money.payables.billTotals as Record<string, number>).map(([c, v]) => [
                c, (money.payables.expenseTotals[c] || 0) + v,
              ])),
            })}
            icon={CreditCard}
            subtitle={t('itemsCount', { count: money.payables.expenseCount + money.payables.billCount })}
            href="/accounts-payable"
            color="warning"
          />
          <StatCard
            title={t('receivedThisMonth')}
            value={fmtTotals(money.month.received)}
            icon={DollarSign}
            subtitle={t('paymentsCount', { count: money.month.receivedCount })}
            href="/payments"
            color="primary"
          />
          <StatCard
            title={t('spentThisMonth')}
            value={fmtTotals(money.month.spent)}
            icon={Receipt}
            subtitle={t('paymentsCount', { count: money.month.spentCount })}
            href="/expenses"
            color="orange"
          />
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <h3 className="text-base font-semibold text-gray-900 mb-3">
          {t('quickActions')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickActionButton
            icon={MessageSquare}
            label={t('unifiedInbox')}
            href="/communications"
            description={t('manageConversations')}
            color="bg-success"
            startNowLabel={t('startNow')}
          />
          <QuickActionButton
            icon={Sparkles}
            label={t('newQuote')}
            href="/itineraries/new"
            description={t('createFromScratch')}
            color="bg-purple-500"
            startNowLabel={t('startNow')}
          />
          <QuickActionButton
            icon={Layers}
            label={t('ratesHub')}
            href="/rates"
            description={t('manageRates')}
            color="bg-primary-600"
            startNowLabel={t('startNow')}
          />
          <QuickActionButton
            icon={Package}
            label={t('b2bPackages')}
            href="/tours"
            description={t('readyMadePackages')}
            color="bg-warning"
            startNowLabel={t('startNow')}
          />
        </div>
      </div>

      {/* Needs Attention — departures with a problem to fix before the group flies */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className={`w-4 h-4 ${attention.length > 0 ? 'text-amber-500' : 'text-gray-300'}`} />
          <h3 className="text-base font-semibold text-gray-900">{t('needsAttention')}</h3>
          {attention.length > 0 && (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
              {attention.length}
            </span>
          )}
        </div>
        {attention.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
            <CheckCircle className="w-4 h-4 text-success" />
            {t('allClear')}
          </div>
        ) : (
          <div className="space-y-2">
            {attention.map((item, i) => (
              <Link
                key={`${item.type}-${item.bookingId}-${i}`}
                href={item.href}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${item.severity === 'urgent' ? 'bg-red-500' : 'bg-amber-400'}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {item.type === 'balance_due' && (item.detail.overdue
                      ? t('attnBalanceOverdue', { amount: Number(item.detail.balanceDue).toLocaleString() })
                      : t('attnBalanceDue', { amount: Number(item.detail.balanceDue).toLocaleString(), date: item.detail.dueDate || '' }))}
                    {item.type === 'forms_incomplete' && t('attnForms', { submitted: item.detail.submitted, total: item.detail.total })}
                    {item.type === 'no_guide' && t('attnNoGuide')}
                    {item.type === 'change_request' && t('attnChangeRequest')}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {[item.bookingCode, item.tripName || item.clientName, item.startDate ? t('departsOn', { date: item.startDate }) : null]
                      .filter(Boolean).join(' · ')}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Activity - 2 columns */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-gray-900">
                {t('recentActivity')}
              </h3>
              <Link
                href="/itineraries"
                className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
              >
                {t('viewAll')}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {recentQuotes.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500 mb-3">{t('noQuotesYet')}</p>
                <Link
                  href="/itineraries/new"
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                  {t('createFirstQuote')}
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {recentQuotes.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="p-1.5 bg-white rounded-lg border border-gray-200">
                      <FileText className="w-4 h-4 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{activity.action}</p>
                      <p className="text-xs text-gray-500">{activity.time}</p>
                    </div>
                    <Link
                      href={`/itineraries/${activity.id}`}
                      className="text-primary-600 hover:text-primary-700 text-sm font-medium whitespace-nowrap"
                    >
                      {tCommon('view')} →
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Follow-ups */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-gray-900">
                {t('upcomingFollowups')}
              </h3>
              <Link
                href="/followups"
                className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
              >
                {t('viewAll')}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {upcomingFollowups.length === 0 ? (
              <div className="text-center py-6">
                <CheckSquare className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">{t('noUpcomingFollowups')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingFollowups.map((followup) => (
                  <FollowupCard key={followup.id} followup={followup} t={t} tDates={tDates} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar - 1 column */}
        <div className="space-y-4">
          {/* Today's Summary */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-base font-bold text-gray-900">{t('todaysSummary')}</h3>
              <div className="w-1.5 h-1.5 rounded-full bg-primary-600" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600">{t('quotesCreated')}</span>
                <span className="font-bold text-lg text-gray-900">{stats.todayQuotesCreated}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600">{t('bookings')}</span>
                <span className="font-bold text-lg text-gray-900">{stats.todayBookingsCreated}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600">{t('paymentsReceived')}</span>
                <span className="font-bold text-lg text-gray-900">{stats.todayPaymentsReceived}</span>
              </div>
            </div>
          </div>

          {/* Quick Tips */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <h3 className="text-base font-bold text-gray-900 mb-3">💡 {t('quickTips')}</h3>
            <div className="space-y-2 text-xs text-gray-700">
              <p>• {t('tip1')}</p>
              <p>• {t('tip2')}</p>
              <p>• {t('tip3')}</p>
              <p>• {t('tip4')}</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

// Stat Card Component with consistent height
interface StatCardProps {
  title: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  trend?: string
  trendUp?: boolean
  trendLabel?: string
  badge?: string
  badgeColor?: 'primary' | 'danger'
  href: string
  color?: 'primary' | 'warning' | 'purple' | 'orange'
  subtitle?: string
}

function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  trendUp,
  trendLabel,
  badge,
  badgeColor = 'primary',
  href,
  color = 'primary',
  subtitle
}: StatCardProps) {

  const dotColors = {
    primary: 'bg-primary-600',
    warning: 'bg-warning',
    purple: 'bg-purple-600',
    orange: 'bg-orange-600'
  }

  return (
    <Link href={href} className="block group">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow h-full min-h-[120px] flex flex-col">
        <div className="flex items-start justify-between flex-1">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs text-gray-600">{title}</p>
              <div className={`w-1.5 h-1.5 rounded-full ${dotColors[color]}`} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            {trend && (
              <p className={`text-xs mt-1 ${trendUp ? 'text-success' : 'text-danger'}`}>
                {trend} {trendLabel}
              </p>
            )}
            {subtitle && (
              <p className="text-xs text-gray-600 mt-1">{subtitle}</p>
            )}
            {badge && (
              <span className={`
                inline-flex items-center mt-2 px-2 py-0.5 rounded-full text-xs font-medium
                ${badgeColor === 'danger' ? 'bg-danger/10 text-danger' : 'bg-primary-50 text-primary-700'}
              `}>
                <AlertCircle className="w-3 h-3 mr-1" />
                {badge}
              </span>
            )}
          </div>
          <Icon className="w-4 h-4 text-gray-400" />
        </div>
      </div>
    </Link>
  )
}

// Quick Action Button
function QuickActionButton({ icon: Icon, label, href, description, color, startNowLabel }: any) {
  const dotColors: Record<string, string> = {
    'bg-success': 'bg-success',
    'bg-purple-500': 'bg-purple-600',
    'bg-primary-600': 'bg-primary-600',
    'bg-warning': 'bg-warning'
  }

  return (
    <Link
      href={href}
      className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-all group"
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-gray-400" />
        <div className={`w-1.5 h-1.5 rounded-full ${dotColors[color] || 'bg-gray-400'}`} />
      </div>
      <h3 className="text-base font-bold text-gray-900">{label}</h3>
      <p className="text-xs text-gray-600 mt-1">{description}</p>
      <p className="text-xs text-gray-500 mt-2 group-hover:text-primary-600">{startNowLabel}</p>
    </Link>
  )
}

// Followup Card
function FollowupCard({ followup, t, tDates }: any) {
  const daysUntil = Math.ceil(
    (new Date(followup.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  )

  const getDaysLabel = () => {
    if (daysUntil === 0) return tDates ? tDates('today') : 'Today'
    if (daysUntil === 1) return tDates ? tDates('tomorrow') : 'Tomorrow'
    return `${daysUntil} ${t ? t('days') : 'days'}`
  }

  return (
    <Link
      href={`/clients/${followup.client_id}`}
      className="block p-3 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50/50 transition-all group"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 group-hover:text-primary-700">
            {followup.clients?.first_name} {followup.clients?.last_name}
          </p>
          <p className="text-xs text-gray-600 mt-1 line-clamp-2">
            {followup.description}
          </p>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <div className="text-right">
            <p className="text-xs text-gray-500">
              {getDaysLabel()}
            </p>
            <span className={`
              inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-xs font-medium
              ${followup.priority === 'high' ? 'bg-danger/10 text-danger' : ''}
              ${followup.priority === 'medium' ? 'bg-warning/10 text-warning' : ''}
              ${followup.priority === 'low' ? 'bg-gray-200 text-gray-700' : ''}
            `}>
              {followup.priority}
            </span>
          </div>
          <Clock className="w-4 h-4 text-gray-400 group-hover:text-primary-600 transition-colors" />
        </div>
      </div>
    </Link>
  )
}