'use client'

import { useEffect, useState } from 'react'
import { 
  TrendingUp, 
  Users, 
  DollarSign, 
  Calendar,
  MapPin,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  FileText,
  CheckCircle,
  Clock,
  XCircle,
  Target,
  Zap
} from 'lucide-react'
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts'

interface AnalyticsData {
  revenue: {
    total: number
    growth: number
    monthlyData: { month: string; revenue: number }[]
  }
  bookings: {
    total: number
    confirmed: number
    pending: number
    cancelled: number
  }
  clients: {
    total: number
    new: number
    returning: number
  }
  destinations: {
    name: string
    bookings: number
    revenue: number
  }[]
  conversionRate: number
  avgDealSize: number
}

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | '1y'>('30d')
  const [destinationFilter, setDestinationFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => {
    fetchAnalytics()
  }, [timeRange])

  const fetchAnalytics = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/analytics?range=${timeRange}`)
      const data = await response.json()
      
      if (data.success) {
        setAnalytics(data.data)
      }
    } catch (error) {
      console.error('Error fetching analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  // Mock data for demonstration - with minimum 4 weeks
  const mockData: AnalyticsData = {
    revenue: {
      total: 125840,
      growth: 23.5,
      monthlyData: [
        { month: 'Week 1', revenue: 22100 },
        { month: 'Week 2', revenue: 28400 },
        { month: 'Week 3', revenue: 31200 },
        { month: 'Week 4', revenue: 26040 },
        { month: 'Week 5', revenue: 18100 }
      ]
    },
    bookings: {
      total: 156,
      confirmed: 89,
      pending: 42,
      cancelled: 25
    },
    clients: {
      total: 234,
      new: 45,
      returning: 189
    },
    destinations: [
      { name: 'Cairo', bookings: 78, revenue: 45600 },
      { name: 'Luxor', bookings: 56, revenue: 32400 },
      { name: 'Aswan', bookings: 34, revenue: 21200 },
      { name: 'Hurghada', bookings: 28, revenue: 18900 },
      { name: 'Sharm El Sheikh', bookings: 22, revenue: 15400 }
    ],
    conversionRate: 34.5,
    avgDealSize: 806
  }

  const displayData = analytics || mockData

  // Color system
  const COLORS = {
    revenue: '#10B981', // Green
    clients: '#3B82F6', // Blue
    bookings: '#8B5CF6', // Purple
    conversion: '#F59E0B', // Orange
    confirmed: '#10B981',
    pending: '#F59E0B',
    cancelled: '#EF4444'
  }

  const PIE_COLORS = [COLORS.confirmed, COLORS.pending, COLORS.cancelled]

  // Calculate insights
  const getInsights = () => {
    const revenueData = displayData.revenue.monthlyData
    const maxRevenue = Math.max(...revenueData.map(d => d.revenue))
    const maxRevenueWeek = revenueData.find(d => d.revenue === maxRevenue)
    
    const pendingPercentage = Math.round((displayData.bookings.pending / displayData.bookings.total) * 100)
    
    return {
      revenueInsight: `Your busiest period was ${maxRevenueWeek?.month} with €${maxRevenue.toLocaleString()} in revenue.`,
      bookingInsight: `${pendingPercentage}% of active bookings are still pending — consider follow-ups.`,
      conversionInsight: displayData.conversionRate > 30 
        ? 'Strong conversion rate! Your sales process is working well.' 
        : 'Conversion rate needs attention. Review your sales funnel.'
    }
  }

  const insights = getInsights()

  // Filter destinations
  const filteredDestinations = destinationFilter === 'all' 
    ? displayData.destinations 
    : displayData.destinations.filter(d => d.name === destinationFilter)

  // Pipeline data
  const pipelineData = {
    leads: 9,
    followups: 3,
    pending: displayData.bookings.pending,
    confirmed: displayData.bookings.confirmed,
    completed: Math.floor(displayData.bookings.confirmed * 0.8)
  }

  if (loading && !analytics) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading analytics...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="text-sm text-gray-600 mt-1">Business performance and insights</p>
        </div>
        
        {/* Time Range Filter */}
        <div className="flex gap-2">
          {(['7d', '30d', '90d', '1y'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                timeRange === range
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {range === '7d' && 'Last 7 Days'}
              {range === '30d' && 'Last 30 Days'}
              {range === '90d' && 'Last 90 Days'}
              {range === '1y' && 'Last Year'}
            </button>
          ))}
        </div>
      </div>

      {/* Key Metrics Cards with Sparklines */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total Revenue - Green tint */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 relative overflow-hidden">
          {/* Subtle green background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-green-50/50 to-transparent pointer-events-none" />
          
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-gray-400" />
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS.revenue }} />
              </div>
              {displayData.revenue.growth >= 0 ? (
                <span className="flex items-center text-xs font-medium" style={{ color: COLORS.revenue }}>
                  <ArrowUpRight className="w-3 h-3 mr-1" />
                  {displayData.revenue.growth}%
                </span>
              ) : (
                <span className="flex items-center text-danger text-xs font-medium">
                  <ArrowDownRight className="w-3 h-3 mr-1" />
                  {Math.abs(displayData.revenue.growth)}%
                </span>
              )}
            </div>
            <h3 className="text-xs text-gray-600 font-medium mb-1">Total Revenue</h3>
            <p className="text-3xl font-bold text-gray-900">
              €{displayData.revenue.total.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 mt-1 mb-2">vs. previous period</p>
            
            {/* Mini Sparkline */}
            <div className="h-8 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={displayData.revenue.monthlyData.slice(-5)}>
                  <Line 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke={COLORS.revenue}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Total Bookings - Purple */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS.bookings }} />
            </div>
          </div>
          <h3 className="text-xs text-gray-600 font-medium mb-1">Total Bookings</h3>
          <p className="text-3xl font-bold text-gray-900">
            {displayData.bookings.total}
          </p>
          <div className="flex items-center gap-3 mt-1 text-xs">
            <span className="text-gray-600">{displayData.bookings.confirmed} confirmed</span>
            <span className="text-gray-600">{displayData.bookings.pending} pending</span>
          </div>
          
          {/* Mini bar indicator */}
          <div className="flex gap-1 mt-2 h-8 items-end">
            <div className="flex-1 rounded-t" style={{ 
              backgroundColor: COLORS.confirmed, 
              height: `${(displayData.bookings.confirmed / displayData.bookings.total) * 100}%`,
              minHeight: '20%'
            }} />
            <div className="flex-1 rounded-t" style={{ 
              backgroundColor: COLORS.pending, 
              height: `${(displayData.bookings.pending / displayData.bookings.total) * 100}%`,
              minHeight: '15%'
            }} />
            <div className="flex-1 rounded-t" style={{ 
              backgroundColor: COLORS.cancelled, 
              height: `${(displayData.bookings.cancelled / displayData.bookings.total) * 100}%`,
              minHeight: '10%'
            }} />
          </div>
        </div>

        {/* Total Clients - Blue */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-400" />
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS.clients }} />
            </div>
          </div>
          <h3 className="text-xs text-gray-600 font-medium mb-1">Total Clients</h3>
          <p className="text-3xl font-bold text-gray-900">
            {displayData.clients.total}
          </p>
          <div className="flex items-center gap-3 mt-1 text-xs">
            <span className="text-gray-600">{displayData.clients.new} new</span>
            <span className="text-gray-600">{displayData.clients.returning} returning</span>
          </div>
          
          {/* Progress bar */}
          <div className="mt-2">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="h-2 rounded-full transition-all"
                style={{ 
                  backgroundColor: COLORS.clients,
                  width: `${(displayData.clients.returning / displayData.clients.total) * 100}%`
                }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {Math.round((displayData.clients.returning / displayData.clients.total) * 100)}% returning rate
            </p>
          </div>
        </div>

        {/* Conversion Rate - Orange */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-gray-400" />
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS.conversion }} />
            </div>
          </div>
          <h3 className="text-xs text-gray-600 font-medium mb-1">Conversion Rate</h3>
          <p className="text-3xl font-bold text-gray-900">
            {displayData.conversionRate}%
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Avg deal: €{displayData.avgDealSize}
          </p>
          
          {/* Circular progress indicator */}
          <div className="mt-2 flex items-center gap-2">
            <div className="relative w-12 h-12">
              <svg className="transform -rotate-90 w-12 h-12">
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  stroke="#e5e7eb"
                  strokeWidth="4"
                  fill="transparent"
                />
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  stroke={COLORS.conversion}
                  strokeWidth="4"
                  fill="transparent"
                  strokeDasharray={`${2 * Math.PI * 20}`}
                  strokeDashoffset={`${2 * Math.PI * 20 * (1 - displayData.conversionRate / 100)}`}
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <p className="text-xs text-gray-500 flex-1">{insights.conversionInsight}</p>
          </div>
        </div>
      </div>

      {/* Booking Pipeline */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <h3 className="text-base font-semibold text-gray-900 mb-3">Booking Pipeline</h3>
        <div className="flex items-center gap-2">
          {/* Leads */}
          <div className="flex-1">
            <div className="text-center">
              <div className="h-16 rounded-lg flex items-center justify-center text-white font-bold text-xl mb-2"
                   style={{ backgroundColor: '#94a3b8' }}>
                {pipelineData.leads}
              </div>
              <p className="text-xs text-gray-600 font-medium">Leads</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
          
          {/* Follow-ups */}
          <div className="flex-1">
            <div className="text-center">
              <div className="h-16 rounded-lg flex items-center justify-center text-white font-bold text-xl mb-2"
                   style={{ backgroundColor: COLORS.clients }}>
                {pipelineData.followups}
              </div>
              <p className="text-xs text-gray-600 font-medium">Follow-ups</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
          
          {/* Pending */}
          <div className="flex-1">
            <div className="text-center">
              <div className="h-16 rounded-lg flex items-center justify-center text-white font-bold text-xl mb-2"
                   style={{ backgroundColor: COLORS.pending }}>
                {pipelineData.pending}
              </div>
              <p className="text-xs text-gray-600 font-medium">Pending</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
          
          {/* Confirmed */}
          <div className="flex-1">
            <div className="text-center">
              <div className="h-16 rounded-lg flex items-center justify-center text-white font-bold text-xl mb-2"
                   style={{ backgroundColor: COLORS.confirmed }}>
                {pipelineData.confirmed}
              </div>
              <p className="text-xs text-gray-600 font-medium">Confirmed</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
          
          {/* Completed */}
          <div className="flex-1">
            <div className="text-center">
              <div className="h-16 rounded-lg flex items-center justify-center text-white font-bold text-xl mb-2"
                   style={{ backgroundColor: COLORS.bookings }}>
                {pipelineData.completed}
              </div>
              <p className="text-xs text-gray-600 font-medium">Completed</p>
            </div>
          </div>
        </div>
      </div>

      {/* Highlights of the Month */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-5 h-5 text-yellow-500" />
          <h3 className="text-base font-semibold text-gray-900">Highlights This Month</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">{displayData.clients.new}</p>
            <p className="text-xs text-gray-600 mt-1">New clients</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">{displayData.bookings.pending}</p>
            <p className="text-xs text-gray-600 mt-1">Pending bookings</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">€{displayData.avgDealSize}</p>
            <p className="text-xs text-gray-600 mt-1">Avg deal size</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">
              {displayData.destinations && displayData.destinations.length > 0 
                ? displayData.destinations[0].name 
                : 'N/A'}
            </p>
            <p className="text-xs text-gray-600 mt-1">Top destination</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">WhatsApp</p>
            <p className="text-xs text-gray-600 mt-1">Best channel</p>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Revenue Trend Chart with Insight */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h3 className="text-base font-semibold text-gray-900 mb-3">Revenue Trend</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={displayData.revenue.monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="month" 
                stroke="#666" 
                style={{ fontSize: '12px' }}
              />
              <YAxis 
                stroke="#666" 
                style={{ fontSize: '12px' }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#fff', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
                formatter={(value: any) => [`€${value.toLocaleString()}`, 'Revenue']}
              />
              <Line 
                type="monotone" 
                dataKey="revenue" 
                stroke={COLORS.revenue}
                strokeWidth={3}
                dot={{ fill: COLORS.revenue, r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-2 p-2 bg-green-50 rounded text-xs text-gray-700">
            💡 {insights.revenueInsight}
          </div>
        </div>

        {/* Top Destinations Chart with Filter */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">Top Destinations</h3>
            <select
              value={destinationFilter}
              onChange={(e) => setDestinationFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Destinations</option>
              {displayData.destinations.map(dest => (
                <option key={dest.name} value={dest.name}>{dest.name}</option>
              ))}
            </select>
          </div>
          
          {filteredDestinations.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={filteredDestinations}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="name" 
                    stroke="#666"
                    style={{ fontSize: '12px' }}
                  />
                  <YAxis 
                    stroke="#666"
                    style={{ fontSize: '12px' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#fff', 
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                  />
                  <Bar 
                    dataKey="bookings" 
                    fill={COLORS.bookings}
                    radius={[8, 8, 0, 0]} 
                  />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 p-2 bg-purple-50 rounded text-xs text-gray-700">
                💡 {filteredDestinations.length > 0 
                  ? `${filteredDestinations[0].name} leads with ${filteredDestinations[0].bookings} bookings`
                  : 'No destination data available yet'}
              </div>
            </>
          ) : (
            <div className="h-80 flex flex-col items-center justify-center text-center">
              <MapPin className="w-12 h-12 text-gray-300 mb-3" />
              <p className="text-sm text-gray-500 mb-2">No destination data yet</p>
              <p className="text-xs text-gray-400">Data will appear as you add bookings</p>
            </div>
          )}
        </div>
      </div>

      {/* Booking Status Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Pie Chart with Labels and Filter */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">Booking Status</h3>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Status</option>
              <option value="confirmed">Confirmed</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={[
                  { name: 'Confirmed', value: displayData.bookings.confirmed },
                  { name: 'Pending', value: displayData.bookings.pending },
                  { name: 'Cancelled', value: displayData.bookings.cancelled }
                ]}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {[
                  { name: 'Confirmed', value: displayData.bookings.confirmed },
                  { name: 'Pending', value: displayData.bookings.pending },
                  { name: 'Cancelled', value: displayData.bookings.cancelled }
                ].map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={PIE_COLORS[index]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          
          {/* Status Legend with Counts */}
          <div className="space-y-2 mt-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS.confirmed }} />
                <span className="text-xs text-gray-700">Confirmed</span>
              </div>
              <span className="text-xs font-bold text-gray-900">
                {displayData.bookings.confirmed} ({Math.round((displayData.bookings.confirmed / displayData.bookings.total) * 100)}%)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS.pending }} />
                <span className="text-xs text-gray-700">Pending</span>
              </div>
              <span className="text-xs font-bold text-gray-900">
                {displayData.bookings.pending} ({Math.round((displayData.bookings.pending / displayData.bookings.total) * 100)}%)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS.cancelled }} />
                <span className="text-xs text-gray-700">Cancelled</span>
              </div>
              <span className="text-xs font-bold text-gray-900">
                {displayData.bookings.cancelled} ({Math.round((displayData.bookings.cancelled / displayData.bookings.total) * 100)}%)
              </span>
            </div>
          </div>
          
          <div className="mt-3 p-2 bg-orange-50 rounded text-xs text-gray-700">
            💡 {insights.bookingInsight}
          </div>
        </div>

        {/* Destination Revenue Breakdown */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h3 className="text-base font-semibold text-gray-900 mb-3">Revenue by Destination</h3>
          {displayData.destinations && displayData.destinations.length > 0 ? (
            <div className="space-y-3">
              {displayData.destinations.map((dest, index) => (
                <div key={dest.name}>
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-medium text-gray-900">{dest.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-gray-900">€{dest.revenue.toLocaleString()}</span>
                      <span className="text-xs text-gray-500 ml-2">({dest.bookings} bookings)</span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="h-2 rounded-full transition-all duration-500"
                      style={{ 
                        backgroundColor: COLORS.revenue,
                        width: `${(dest.revenue / displayData.destinations[0].revenue) * 100}%` 
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <MapPin className="w-12 h-12 text-gray-300 mb-3" />
              <p className="text-sm text-gray-500 mb-2">No destination data yet</p>
              <p className="text-xs text-gray-400">Revenue will appear as you add bookings</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions - Enhanced */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <h3 className="text-base font-semibold text-gray-900 mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button className="p-3 border border-gray-200 rounded-lg hover:shadow-md hover:border-primary-300 transition-all text-left group">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-gray-400 group-hover:text-primary-600 transition-colors" />
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS.revenue }} />
            </div>
            <p className="text-sm font-medium text-gray-900">View Reports</p>
            <p className="text-xs text-gray-500 mt-1">Export detailed reports</p>
          </button>
          
          <button className="p-3 border border-gray-200 rounded-lg hover:shadow-md hover:border-blue-300 transition-all text-left group">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors" />
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS.clients }} />
            </div>
            <p className="text-sm font-medium text-gray-900">Booking Calendar</p>
            <p className="text-xs text-gray-500 mt-1">See all bookings</p>
          </button>
          
          <button className="p-3 border border-gray-200 rounded-lg hover:shadow-md hover:border-purple-300 transition-all text-left group">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-gray-400 group-hover:text-purple-600 transition-colors" />
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS.bookings }} />
            </div>
            <p className="text-sm font-medium text-gray-900">Client Insights</p>
            <p className="text-xs text-gray-500 mt-1">Top clients & trends</p>
          </button>
          
          <button className="p-3 border border-gray-200 rounded-lg hover:shadow-md hover:border-green-300 transition-all text-left group">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-gray-400 group-hover:text-green-600 transition-colors" />
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS.revenue }} />
            </div>
            <p className="text-sm font-medium text-gray-900">Revenue Forecast</p>
            <p className="text-xs text-gray-500 mt-1">Predict next month</p>
          </button>
        </div>
      </div>
    </div>
  )
}

// Helper component for ArrowRight
function ArrowRight({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  )
}