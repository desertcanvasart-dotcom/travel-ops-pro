'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { 
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  Download,
  BarChart3,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Receipt,
  Users,
  FileText,
  Building,
  Percent
} from 'lucide-react'

interface MonthlyData {
  month: string
  year: number
  month_num: number
  revenue: number
  invoiced: number
  collected: number
  expenses: number
  expenses_paid: number
  net_profit: number
  trip_count: number
  invoice_count: number
  expense_count: number
}

interface QuarterlyData {
  quarter: string
  year: number
  revenue: number
  expenses: number
  net_profit: number
  margin: number
}

interface CashFlow {
  inflows: number
  outflows: number
  net_cash_flow: number
  pending_receivables: number
  pending_payables: number
  projected_cash: number
  monthly_cash_flow: { month: string; inflow: number; outflow: number; net: number }[]
}

interface CategoryExpense {
  category: string
  amount: number
  percentage: number
}

interface TaxSummary {
  gross_revenue: number
  total_expenses: number
  deductible_expenses: number
  taxable_income: number
  expense_breakdown: CategoryExpense[]
  estimated_vat_collected: number
  estimated_vat_paid: number
  net_vat: number
}

interface CommissionRecipient {
  name: string
  type: string
  total_earned: number
  total_paid: number
  total_pending: number
  trip_count: number
}

interface CommissionSummary {
  total_commissions: number
  total_paid: number
  total_pending: number
  by_type: { type: string; amount: number; count: number }[]
  recipients: CommissionRecipient[]
}

interface Summary {
  year: number
  total_revenue: number
  total_collected: number
  total_expenses: number
  total_expenses_paid: number
  gross_profit: number
  profit_margin: number
  trip_count: number
  invoice_count: number
  expense_count: number
  average_trip_value: number
  collection_rate: number
}

interface YearOverYear {
  current_year: number
  previous_year: number
  revenue_change: number
  revenue_change_percent: number
  expense_change: number
  expense_change_percent: number
}

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  guide: { label: 'Tour Guide', icon: '👨‍🏫' },
  driver: { label: 'Driver', icon: '🚗' },
  hotel: { label: 'Hotel', icon: '🏨' },
  transportation: { label: 'Transportation', icon: '🚐' },
  entrance: { label: 'Entrance Fees', icon: '🎫' },
  meal: { label: 'Meals', icon: '🍽️' },
  airport_staff: { label: 'Airport Staff', icon: '✈️' },
  hotel_staff: { label: 'Hotel Staff', icon: '🛎️' },
  ground_handler: { label: 'Ground Handler', icon: '🧳' },
  tipping: { label: 'Tipping', icon: '💵' },
  permits: { label: 'Permits', icon: '📋' },
  toll: { label: 'Toll Fees', icon: '🛣️' },
  parking: { label: 'Parking', icon: '🅿️' },
  fuel: { label: 'Fuel', icon: '⛽' },
  office: { label: 'Office', icon: '🏢' },
  software: { label: 'Software', icon: '💻' },
  marketing: { label: 'Marketing', icon: '📣' },
  other: { label: 'Other', icon: '📦' }
}

export default function FinancialReportsPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [monthly, setMonthly] = useState<MonthlyData[]>([])
  const [quarterly, setQuarterly] = useState<QuarterlyData[]>([])
  const [cashFlow, setCashFlow] = useState<CashFlow | null>(null)
  const [taxSummary, setTaxSummary] = useState<TaxSummary | null>(null)
  const [commissionSummary, setCommissionSummary] = useState<CommissionSummary | null>(null)
  const [yearOverYear, setYearOverYear] = useState<YearOverYear | null>(null)
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [activeTab, setActiveTab] = useState<'overview' | 'revenue' | 'cashflow' | 'tax' | 'commission'>('overview')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/financial-reports?year=${selectedYear}`)
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setSummary(result.summary)
          setMonthly(result.monthly)
          setQuarterly(result.quarterly)
          setCashFlow(result.cashFlow)
          setTaxSummary(result.taxSummary)
          setCommissionSummary(result.commissionSummary)
          setYearOverYear(result.yearOverYear)
          setAvailableYears(result.availableYears)
        }
      }
    } catch (error) {
      console.error('Error fetching financial data:', error)
    } finally {
      setLoading(false)
    }
  }, [selectedYear])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const exportToCSV = (data: any[], filename: string) => {
    const headers = Object.keys(data[0] || {}).join(',')
    const rows = data.map(row => Object.values(row).join(','))
    const csv = [headers, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}_${selectedYear}.csv`
    a.click()
  }

  const getChangeColor = (value: number) => {
    if (value > 0) return 'text-green-600'
    if (value < 0) return 'text-red-600'
    return 'text-gray-600'
  }

  const getChangeIcon = (value: number) => {
    if (value > 0) return <ArrowUpRight className="h-4 w-4" />
    if (value < 0) return <ArrowDownRight className="h-4 w-4" />
    return null
  }

  const maxMonthlyRevenue = Math.max(...monthly.map(m => Math.max(m.revenue, m.expenses)), 1)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#647C47]"></div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-lg">
            📊
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Financial Reports</h1>
            <p className="text-sm text-gray-500">Revenue, cash flow, tax & commission analysis</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
          >
            {availableYears.length > 0 ? (
              availableYears.map(year => (
                <option key={year} value={year}>{year}</option>
              ))
            ) : (
              <option value={new Date().getFullYear()}>{new Date().getFullYear()}</option>
            )}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        {[
          { id: 'overview', label: 'Overview', icon: BarChart3 },
          { id: 'revenue', label: 'Revenue', icon: DollarSign },
          { id: 'cashflow', label: 'Cash Flow', icon: Wallet },
          { id: 'tax', label: 'Tax Summary', icon: FileText },
          { id: 'commission', label: 'Commissions', icon: Users }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && summary && (
        <div className="space-y-5">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">💰</span>
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              </div>
              <p className="text-xs text-gray-500 mb-1">Total Revenue</p>
              <p className="text-2xl font-semibold text-blue-600">€{summary.total_revenue.toLocaleString()}</p>
              {yearOverYear && (
                <p className={`text-xs mt-1 flex items-center gap-1 ${getChangeColor(yearOverYear.revenue_change_percent)}`}>
                  {getChangeIcon(yearOverYear.revenue_change_percent)}
                  {yearOverYear.revenue_change_percent >= 0 ? '+' : ''}{yearOverYear.revenue_change_percent.toFixed(1)}% YoY
                </p>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">💸</span>
                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
              </div>
              <p className="text-xs text-gray-500 mb-1">Total Expenses</p>
              <p className="text-2xl font-semibold text-red-600">€{summary.total_expenses.toLocaleString()}</p>
              {yearOverYear && (
                <p className={`text-xs mt-1 flex items-center gap-1 ${getChangeColor(-yearOverYear.expense_change_percent)}`}>
                  {getChangeIcon(yearOverYear.expense_change_percent)}
                  {yearOverYear.expense_change_percent >= 0 ? '+' : ''}{yearOverYear.expense_change_percent.toFixed(1)}% YoY
                </p>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">📈</span>
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              </div>
              <p className="text-xs text-gray-500 mb-1">Gross Profit</p>
              <p className={`text-2xl font-semibold ${summary.gross_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                €{summary.gross_profit.toLocaleString()}
              </p>
              <p className="text-xs text-gray-400 mt-1">{summary.profit_margin.toFixed(1)}% margin</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">✅</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              </div>
              <p className="text-xs text-gray-500 mb-1">Collected</p>
              <p className="text-2xl font-semibold text-emerald-600">€{summary.total_collected.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-1">{summary.collection_rate.toFixed(1)}% collected</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🎯</span>
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
              </div>
              <p className="text-xs text-gray-500 mb-1">Trips</p>
              <p className="text-2xl font-semibold text-purple-600">{summary.trip_count}</p>
              <p className="text-xs text-gray-400 mt-1">€{summary.average_trip_value.toLocaleString()} avg</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">📄</span>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              </div>
              <p className="text-xs text-gray-500 mb-1">Invoices</p>
              <p className="text-2xl font-semibold text-amber-600">{summary.invoice_count}</p>
              <p className="text-xs text-gray-400 mt-1">{summary.expense_count} expenses</p>
            </div>
          </div>

          {/* Quarterly Overview */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Quarterly Performance</h3>
              <button
                onClick={() => exportToCSV(quarterly, 'quarterly_report')}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
              >
                <Download className="h-3 w-3" />
                Export
              </button>
            </div>
            <div className="grid grid-cols-4 gap-4">
              {quarterly.map(q => (
                <div key={q.quarter} className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm font-semibold text-gray-900 mb-3">{q.quarter} {q.year}</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Revenue</span>
                      <span className="font-medium text-blue-600">€{q.revenue.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Expenses</span>
                      <span className="font-medium text-red-600">€{q.expenses.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm border-t border-gray-200 pt-2">
                      <span className="text-gray-500">Profit</span>
                      <span className={`font-semibold ${q.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        €{q.net_profit.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Margin</span>
                      <span className={`font-medium ${q.margin >= 20 ? 'text-green-600' : q.margin >= 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {q.margin.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Monthly Chart */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Monthly Revenue vs Expenses</h3>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-blue-500"></div>
                  <span className="text-gray-600">Revenue</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-red-400"></div>
                  <span className="text-gray-600">Expenses</span>
                </div>
              </div>
            </div>
            <div className="flex items-end gap-2 h-48">
              {monthly.map(m => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex gap-0.5 items-end h-40">
                    <div 
                      className="flex-1 bg-blue-500 rounded-t transition-all"
                      style={{ height: `${(m.revenue / maxMonthlyRevenue) * 100}%` }}
                      title={`Revenue: €${m.revenue.toLocaleString()}`}
                    />
                    <div 
                      className="flex-1 bg-red-400 rounded-t transition-all"
                      style={{ height: `${(m.expenses / maxMonthlyRevenue) * 100}%` }}
                      title={`Expenses: €${m.expenses.toLocaleString()}`}
                    />
                  </div>
                  <span className="text-xs text-gray-500">{m.month}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Revenue Tab */}
      {activeTab === 'revenue' && (
        <div className="space-y-5">
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">Monthly Revenue Report</h3>
              <button
                onClick={() => exportToCSV(monthly, 'monthly_revenue')}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <Download className="h-3 w-3" />
                Export CSV
              </button>
            </div>
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left text-xs font-semibold text-gray-600 uppercase px-4 py-3">Month</th>
                  <th className="text-right text-xs font-semibold text-gray-600 uppercase px-4 py-3">Invoiced</th>
                  <th className="text-right text-xs font-semibold text-gray-600 uppercase px-4 py-3">Collected</th>
                  <th className="text-right text-xs font-semibold text-gray-600 uppercase px-4 py-3">Expenses</th>
                  <th className="text-right text-xs font-semibold text-gray-600 uppercase px-4 py-3">Net Profit</th>
                  <th className="text-center text-xs font-semibold text-gray-600 uppercase px-4 py-3">Trips</th>
                  <th className="text-center text-xs font-semibold text-gray-600 uppercase px-4 py-3">Invoices</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {monthly.map(m => (
                  <tr key={m.month} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{m.month} {m.year}</td>
                    <td className="px-4 py-3 text-sm text-right text-blue-600">€{m.invoiced.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right text-emerald-600">€{m.collected.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right text-red-600">€{m.expenses.toLocaleString()}</td>
                    <td className={`px-4 py-3 text-sm text-right font-semibold ${m.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      €{m.net_profit.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-gray-600">{m.trip_count}</td>
                    <td className="px-4 py-3 text-sm text-center text-gray-600">{m.invoice_count}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-4 py-3 text-sm text-gray-900">Total</td>
                  <td className="px-4 py-3 text-sm text-right text-blue-600">
                    €{monthly.reduce((sum, m) => sum + m.invoiced, 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-emerald-600">
                    €{monthly.reduce((sum, m) => sum + m.collected, 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-red-600">
                    €{monthly.reduce((sum, m) => sum + m.expenses, 0).toLocaleString()}
                  </td>
                  <td className={`px-4 py-3 text-sm text-right ${summary && summary.gross_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    €{monthly.reduce((sum, m) => sum + m.net_profit, 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-center text-gray-600">
                    {monthly.reduce((sum, m) => sum + m.trip_count, 0)}
                  </td>
                  <td className="px-4 py-3 text-sm text-center text-gray-600">
                    {monthly.reduce((sum, m) => sum + m.invoice_count, 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cash Flow Tab */}
      {activeTab === 'cashflow' && cashFlow && (
        <div className="space-y-5">
          {/* Cash Flow Summary */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Cash Inflows</p>
              <p className="text-xl font-semibold text-green-600">€{cashFlow.inflows.toLocaleString()}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Cash Outflows</p>
              <p className="text-xl font-semibold text-red-600">€{cashFlow.outflows.toLocaleString()}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Net Cash Flow</p>
              <p className={`text-xl font-semibold ${cashFlow.net_cash_flow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                €{cashFlow.net_cash_flow.toLocaleString()}
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Pending Receivables</p>
              <p className="text-xl font-semibold text-blue-600">€{cashFlow.pending_receivables.toLocaleString()}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Pending Payables</p>
              <p className="text-xl font-semibold text-orange-600">€{cashFlow.pending_payables.toLocaleString()}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Projected Cash</p>
              <p className={`text-xl font-semibold ${cashFlow.projected_cash >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
                €{cashFlow.projected_cash.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Monthly Cash Flow */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">Monthly Cash Flow</h3>
              <button
                onClick={() => exportToCSV(cashFlow.monthly_cash_flow, 'cash_flow')}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <Download className="h-3 w-3" />
                Export
              </button>
            </div>
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left text-xs font-semibold text-gray-600 uppercase px-4 py-3">Month</th>
                  <th className="text-right text-xs font-semibold text-gray-600 uppercase px-4 py-3">Inflow</th>
                  <th className="text-right text-xs font-semibold text-gray-600 uppercase px-4 py-3">Outflow</th>
                  <th className="text-right text-xs font-semibold text-gray-600 uppercase px-4 py-3">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cashFlow.monthly_cash_flow.map(m => (
                  <tr key={m.month} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{m.month}</td>
                    <td className="px-4 py-3 text-sm text-right text-green-600">€{m.inflow.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right text-red-600">€{m.outflow.toLocaleString()}</td>
                    <td className={`px-4 py-3 text-sm text-right font-semibold ${m.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      €{m.net.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tax Summary Tab */}
      {activeTab === 'tax' && taxSummary && (
        <div className="space-y-5">
          {/* Tax Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Gross Revenue</p>
              <p className="text-xl font-semibold text-blue-600">€{taxSummary.gross_revenue.toLocaleString()}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Total Expenses</p>
              <p className="text-xl font-semibold text-red-600">€{taxSummary.total_expenses.toLocaleString()}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Deductible Expenses</p>
              <p className="text-xl font-semibold text-green-600">€{taxSummary.deductible_expenses.toLocaleString()}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Taxable Income</p>
              <p className="text-xl font-semibold text-purple-600">€{taxSummary.taxable_income.toLocaleString()}</p>
            </div>
          </div>

          {/* VAT Summary */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">VAT Summary (Estimated 14%)</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-xs text-blue-600 mb-1">VAT Collected</p>
                <p className="text-lg font-semibold text-blue-700">€{taxSummary.estimated_vat_collected.toLocaleString()}</p>
              </div>
              <div className="p-4 bg-red-50 rounded-lg">
                <p className="text-xs text-red-600 mb-1">VAT Paid</p>
                <p className="text-lg font-semibold text-red-700">€{taxSummary.estimated_vat_paid.toLocaleString()}</p>
              </div>
              <div className={`p-4 rounded-lg ${taxSummary.net_vat >= 0 ? 'bg-green-50' : 'bg-orange-50'}`}>
                <p className={`text-xs mb-1 ${taxSummary.net_vat >= 0 ? 'text-green-600' : 'text-orange-600'}`}>
                  Net VAT {taxSummary.net_vat >= 0 ? 'Payable' : 'Receivable'}
                </p>
                <p className={`text-lg font-semibold ${taxSummary.net_vat >= 0 ? 'text-green-700' : 'text-orange-700'}`}>
                  €{Math.abs(taxSummary.net_vat).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Expense Breakdown */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Expense Breakdown by Category</h3>
              <button
                onClick={() => exportToCSV(taxSummary.expense_breakdown, 'expense_breakdown')}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <Download className="h-3 w-3" />
                Export
              </button>
            </div>
            <div className="space-y-3">
              {taxSummary.expense_breakdown.slice(0, 10).map(cat => {
                const config = CATEGORY_LABELS[cat.category] || CATEGORY_LABELS.other
                return (
                  <div key={cat.category}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <div className="flex items-center gap-2">
                        <span>{config.icon}</span>
                        <span className="text-gray-700">{config.label}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-gray-500">{cat.percentage.toFixed(1)}%</span>
                        <span className="font-medium text-gray-900">€{cat.amount.toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-[#647C47] rounded-full transition-all"
                        style={{ width: `${cat.percentage}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Commission Tab */}
      {activeTab === 'commission' && commissionSummary && (
        <div className="space-y-5">
          {/* Commission Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Total Commissions</p>
              <p className="text-xl font-semibold text-blue-600">€{commissionSummary.total_commissions.toLocaleString()}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Paid</p>
              <p className="text-xl font-semibold text-green-600">€{commissionSummary.total_paid.toLocaleString()}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Pending</p>
              <p className="text-xl font-semibold text-orange-600">€{commissionSummary.total_pending.toLocaleString()}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Recipients</p>
              <p className="text-xl font-semibold text-purple-600">{commissionSummary.recipients.length}</p>
            </div>
          </div>

          {/* By Type */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Commissions by Type</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {commissionSummary.by_type.map(type => {
                const config = CATEGORY_LABELS[type.type] || CATEGORY_LABELS.other
                return (
                  <div key={type.type} className="p-4 bg-gray-50 rounded-lg text-center">
                    <span className="text-2xl">{config.icon}</span>
                    <p className="text-xs text-gray-500 mt-2">{config.label}</p>
                    <p className="text-lg font-semibold text-gray-900 mt-1">€{type.amount.toLocaleString()}</p>
                    <p className="text-xs text-gray-400">{type.count} payments</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Commission Recipients */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">Commission Recipients</h3>
              <button
                onClick={() => exportToCSV(commissionSummary.recipients.map(r => ({
                  name: r.name,
                  type: r.type,
                  total_earned: r.total_earned,
                  total_paid: r.total_paid,
                  total_pending: r.total_pending,
                  trip_count: r.trip_count
                })), 'commission_report')}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <Download className="h-3 w-3" />
                Export
              </button>
            </div>
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left text-xs font-semibold text-gray-600 uppercase px-4 py-3">Name</th>
                  <th className="text-left text-xs font-semibold text-gray-600 uppercase px-4 py-3">Type</th>
                  <th className="text-right text-xs font-semibold text-gray-600 uppercase px-4 py-3">Total Earned</th>
                  <th className="text-right text-xs font-semibold text-gray-600 uppercase px-4 py-3">Paid</th>
                  <th className="text-right text-xs font-semibold text-gray-600 uppercase px-4 py-3">Pending</th>
                  <th className="text-center text-xs font-semibold text-gray-600 uppercase px-4 py-3">Trips</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {commissionSummary.recipients.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                      No commission data
                    </td>
                  </tr>
                ) : (
                  commissionSummary.recipients.map((recipient, idx) => {
                    const config = CATEGORY_LABELS[recipient.type] || CATEGORY_LABELS.other
                    return (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span>{config.icon}</span>
                            <span className="text-sm font-medium text-gray-900">{recipient.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{config.label}</td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                          €{recipient.total_earned.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-green-600">
                          €{recipient.total_paid.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-orange-600">
                          €{recipient.total_pending.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-center text-gray-600">{recipient.trip_count}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center pt-4">
        <p className="text-xs text-gray-400">© 2024 Autoura Operations System</p>
      </div>
    </div>
  )
}