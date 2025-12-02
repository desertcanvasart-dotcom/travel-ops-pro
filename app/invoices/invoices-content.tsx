'use client'

import { useState, useEffect, useCallback } from 'react'
import { 
  Search, 
  Plus, 
  Eye,
  Trash2, 
  X,
  FileText,
  ChevronDown,
  Send,
  Download,
  AlertCircle
} from 'lucide-react'
import Link from 'next/link'

interface Invoice {
  id: string
  invoice_number: string
  client_id: string
  itinerary_id: string | null
  client_name: string
  client_email: string
  line_items: LineItem[]
  subtotal: number
  tax_rate: number
  tax_amount: number
  discount_amount: number
  total_amount: number
  currency: string
  amount_paid: number
  balance_due: number
  status: string
  issue_date: string
  due_date: string
  notes: string | null
  payment_terms: string | null
  payment_instructions: string | null
  created_at: string
  updated_at: string
  sent_at: string | null
  paid_at: string | null
}

interface LineItem {
  description: string
  quantity: number
  unit_price: number
  amount: number
}

interface Client {
  id: string
  name: string
  email: string
}

interface Itinerary {
  id: string
  itinerary_code: string
  client_name: string
  client_email: string
  total_cost: number
}

interface FormData {
  client_id: string
  itinerary_id: string
  client_name: string
  client_email: string
  line_items: LineItem[]
  subtotal: number
  tax_rate: number
  tax_amount: number
  discount_amount: number
  total_amount: number
  currency: string
  issue_date: string
  due_date: string
  notes: string
  payment_terms: string
  payment_instructions: string
}

const initialFormData: FormData = {
  client_id: '',
  itinerary_id: '',
  client_name: '',
  client_email: '',
  line_items: [{ description: '', quantity: 1, unit_price: 0, amount: 0 }],
  subtotal: 0,
  tax_rate: 0,
  tax_amount: 0,
  discount_amount: 0,
  total_amount: 0,
  currency: 'EUR',
  issue_date: new Date().toISOString().split('T')[0],
  due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  notes: '',
  payment_terms: 'Payment due within 14 days',
  payment_instructions: ''
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Draft', color: 'text-gray-600', bg: 'bg-gray-100' },
  sent: { label: 'Sent', color: 'text-blue-700', bg: 'bg-blue-100' },
  viewed: { label: 'Viewed', color: 'text-purple-700', bg: 'bg-purple-100' },
  partial: { label: 'Partial', color: 'text-orange-700', bg: 'bg-orange-100' },
  paid: { label: 'Paid', color: 'text-green-700', bg: 'bg-green-100' },
  overdue: { label: 'Overdue', color: 'text-red-700', bg: 'bg-red-100' },
  cancelled: { label: 'Cancelled', color: 'text-gray-500', bg: 'bg-gray-100' }
}

export default function InvoicesContent() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [itineraries, setItineraries] = useState<Itinerary[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [saving, setSaving] = useState(false)

  const fetchInvoices = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)
      
      const response = await fetch(`/api/invoices?${params}`)
      if (response.ok) {
        const data = await response.json()
        setInvoices(data)
      }
    } catch (error) {
      console.error('Error fetching invoices:', error)
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  const fetchClients = async () => {
    try {
      const response = await fetch('/api/clients')
      if (response.ok) {
        const data = await response.json()
        const clientsData = data.success ? data.data : (Array.isArray(data) ? data : [])
        // Map first_name + last_name to name
        const mappedClients = (clientsData || []).map((c: any) => ({
          id: c.id,
          name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
          email: c.email || ''
        }))
        setClients(mappedClients)
      }
    } catch (error) {
      console.error('Error fetching clients:', error)
      setClients([])
    }
  }

  const fetchItineraries = async () => {
    try {
      const response = await fetch('/api/itineraries')
      if (response.ok) {
        const data = await response.json()
        // Handle both formats: { success, data } or direct array
        const itinerariesData = data.success ? data.data : (Array.isArray(data) ? data : [])
        setItineraries(itinerariesData || [])
      }
    } catch (error) {
      console.error('Error fetching itineraries:', error)
      setItineraries([])
    }
  }

  useEffect(() => {
    fetchInvoices()
    fetchClients()
    fetchItineraries()
  }, [fetchInvoices])

  const handleClientChange = (clientId: string) => {
    const client = clients.find(c => c.id === clientId)
    setFormData(prev => ({
      ...prev,
      client_id: clientId,
      client_name: client?.name || '',
      client_email: client?.email || ''
    }))
  }

  const handleItineraryChange = (itineraryId: string) => {
    const itinerary = itineraries.find(i => i.id === itineraryId)
    if (itinerary) {
      // Find matching client or use itinerary's client info
      const matchingClient = clients.find(c => 
        c.name === itinerary.client_name || 
        c.email === itinerary.client_email
      )
      
      setFormData(prev => ({
        ...prev,
        itinerary_id: itineraryId,
        client_id: matchingClient?.id || prev.client_id,
        client_name: itinerary.client_name || prev.client_name,
        client_email: itinerary.client_email || prev.client_email,
        line_items: [{
          description: `Tour Package - ${itinerary.itinerary_code}`,
          quantity: 1,
          unit_price: itinerary.total_cost,
          amount: itinerary.total_cost
        }],
        subtotal: itinerary.total_cost,
        total_amount: itinerary.total_cost
      }))
    } else {
      // Clear itinerary selection
      setFormData(prev => ({
        ...prev,
        itinerary_id: ''
      }))
    }
  }

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    setFormData(prev => {
      const newItems = [...prev.line_items]
      newItems[index] = { ...newItems[index], [field]: value }
      
      // Recalculate amount
      if (field === 'quantity' || field === 'unit_price') {
        newItems[index].amount = newItems[index].quantity * newItems[index].unit_price
      }
      
      // Recalculate totals
      const subtotal = newItems.reduce((sum, item) => sum + item.amount, 0)
      const taxAmount = subtotal * (prev.tax_rate / 100)
      const totalAmount = subtotal + taxAmount - prev.discount_amount
      
      return {
        ...prev,
        line_items: newItems,
        subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount
      }
    })
  }

  const addLineItem = () => {
    setFormData(prev => ({
      ...prev,
      line_items: [...prev.line_items, { description: '', quantity: 1, unit_price: 0, amount: 0 }]
    }))
  }

  const removeLineItem = (index: number) => {
    if (formData.line_items.length <= 1) return
    setFormData(prev => {
      const newItems = prev.line_items.filter((_, i) => i !== index)
      const subtotal = newItems.reduce((sum, item) => sum + item.amount, 0)
      const taxAmount = subtotal * (prev.tax_rate / 100)
      const totalAmount = subtotal + taxAmount - prev.discount_amount
      
      return {
        ...prev,
        line_items: newItems,
        subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount
      }
    })
  }

  const updateTaxRate = (rate: number) => {
    setFormData(prev => {
      const taxAmount = prev.subtotal * (rate / 100)
      const totalAmount = prev.subtotal + taxAmount - prev.discount_amount
      return { ...prev, tax_rate: rate, tax_amount: taxAmount, total_amount: totalAmount }
    })
  }

  const updateDiscount = (discount: number) => {
    setFormData(prev => {
      const totalAmount = prev.subtotal + prev.tax_amount - discount
      return { ...prev, discount_amount: discount, total_amount: totalAmount }
    })
  }

  const openAddModal = () => {
    setFormData(initialFormData)
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        setIsModalOpen(false)
        fetchInvoices()
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to create invoice')
      }
    } catch (error) {
      console.error('Error creating invoice:', error)
      alert('Failed to create invoice')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this invoice?')) return

    try {
      const response = await fetch(`/api/invoices/${id}`, { method: 'DELETE' })
      if (response.ok) {
        fetchInvoices()
      } else {
        alert('Failed to delete invoice')
      }
    } catch (error) {
      console.error('Error deleting invoice:', error)
      alert('Failed to delete invoice')
    }
  }

  const handleSendInvoice = async (id: string) => {
    try {
      const response = await fetch(`/api/invoices/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sent', sent_at: new Date().toISOString() })
      })
      if (response.ok) {
        fetchInvoices()
      }
    } catch (error) {
      console.error('Error updating invoice:', error)
    }
  }

  // Check for overdue invoices
  const processedInvoices = invoices.map(inv => {
    if (inv.status !== 'paid' && inv.status !== 'cancelled' && inv.due_date) {
      const dueDate = new Date(inv.due_date)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (dueDate < today && inv.balance_due > 0) {
        return { ...inv, status: 'overdue' }
      }
    }
    return inv
  })

  const filteredInvoices = processedInvoices.filter(invoice => {
    const matchesSearch = 
      invoice.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.client_email?.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesSearch
  })

  // Stats
  const totalInvoices = invoices.length
  const totalRevenue = invoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0)
  const totalPaid = invoices.reduce((sum, inv) => sum + Number(inv.amount_paid), 0)
  const totalOutstanding = invoices.reduce((sum, inv) => sum + Number(inv.balance_due), 0)
  const overdueAmount = processedInvoices
    .filter(inv => inv.status === 'overdue')
    .reduce((sum, inv) => sum + Number(inv.balance_due), 0)

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
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <FileText className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Invoices</h1>
            <p className="text-sm text-gray-500">Manage client invoices and payments</p>
          </div>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#647C47] text-white text-sm font-medium rounded-lg hover:bg-[#4f6238] transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          New Invoice
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <span className="text-xs text-gray-500 font-medium">Total Invoices</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">{totalInvoices}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-purple-500"></div>
            <span className="text-xs text-gray-500 font-medium">Total Billed</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">€{totalRevenue.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span className="text-xs text-gray-500 font-medium">Paid</span>
          </div>
          <p className="text-2xl font-bold text-green-600 mt-2">€{totalPaid.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-orange-500"></div>
            <span className="text-xs text-gray-500 font-medium">Outstanding</span>
          </div>
          <p className="text-2xl font-bold text-orange-600 mt-2">€{totalOutstanding.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500"></div>
            <span className="text-xs text-gray-500 font-medium">Overdue</span>
          </div>
          <p className="text-2xl font-bold text-red-600 mt-2">€{overdueAmount.toLocaleString()}</p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-4 bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search invoices..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47] shadow-sm"
          />
        </div>

        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="appearance-none pl-4 pr-10 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47] bg-white shadow-sm cursor-pointer"
          >
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Invoice #</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Client</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Issue Date</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Due Date</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Total</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Paid</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Balance</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Status</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredInvoices.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">
                  No invoices found
                </td>
              </tr>
            ) : (
              filteredInvoices.map((invoice) => {
                const statusConfig = STATUS_CONFIG[invoice.status] || STATUS_CONFIG.draft
                return (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <span className="text-sm font-mono font-medium text-blue-600">{invoice.invoice_number}</span>
                    </td>
                    <td className="px-4 py-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{invoice.client_name}</p>
                        <p className="text-xs text-gray-500">{invoice.client_email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-sm text-gray-600">
                        {invoice.issue_date ? new Date(invoice.issue_date).toLocaleDateString() : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-sm ${invoice.status === 'overdue' ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                        {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className="text-sm font-medium text-gray-900">
                        €{Number(invoice.total_amount).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className="text-sm text-green-600">
                        €{Number(invoice.amount_paid).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className={`text-sm font-medium ${Number(invoice.balance_due) > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                        €{Number(invoice.balance_due).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.color}`}>
                        {statusConfig.label}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/invoices/${invoice.id}`}
                          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        {invoice.status === 'draft' && (
                          <button
                            onClick={() => handleSendInvoice(invoice.id)}
                            className="p-1 text-gray-400 hover:text-green-600 transition-colors"
                            title="Mark as Sent"
                          >
                            <Send className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(invoice.id)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add Invoice Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-xl">
              <h2 className="text-lg font-semibold text-gray-900">New Invoice</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Client & Itinerary Selection */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Client <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.client_id}
                    onChange={(e) => handleClientChange(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47] shadow-sm bg-white"
                  >
                    <option value="">Select Client</option>
                    {clients.map(client => (
                      <option key={client.id} value={client.id}>{client.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Link to Itinerary (Optional)
                  </label>
                  <select
                    value={formData.itinerary_id}
                    onChange={(e) => handleItineraryChange(e.target.value)}
                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47] shadow-sm bg-white"
                  >
                    <option value="">No Itinerary</option>
                    {itineraries.map(it => (
                      <option key={it.id} value={it.id}>
                        {it.itinerary_code} - {it.client_name} (€{it.total_cost})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Currency</label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData(prev => ({ ...prev, currency: e.target.value }))}
                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47] shadow-sm bg-white"
                  >
                    <option value="EUR">EUR (€)</option>
                    <option value="USD">USD ($)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Issue Date</label>
                  <input
                    type="date"
                    value={formData.issue_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, issue_date: e.target.value }))}
                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47] shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Due Date</label>
                  <input
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, due_date: e.target.value }))}
                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47] shadow-sm"
                  />
                </div>
              </div>

              {/* Line Items */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Line Items</label>
                  <button
                    type="button"
                    onClick={addLineItem}
                    className="text-sm text-[#647C47] hover:text-[#4f6238] font-medium flex items-center gap-1"
                  >
                    <Plus className="h-4 w-4" />
                    Add Item
                  </button>
                </div>
                
                <div className="border border-gray-300 rounded-lg overflow-hidden shadow-sm">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left text-xs font-semibold text-gray-600 px-4 py-3">Description</th>
                        <th className="text-center text-xs font-semibold text-gray-600 px-4 py-3 w-20">Qty</th>
                        <th className="text-right text-xs font-semibold text-gray-600 px-4 py-3 w-32">Unit Price</th>
                        <th className="text-right text-xs font-semibold text-gray-600 px-4 py-3 w-28">Amount</th>
                        <th className="w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {formData.line_items.map((item, index) => (
                        <tr key={index} className="bg-white">
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={item.description}
                              onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                              placeholder="Item description"
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47] shadow-sm"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateLineItem(index, 'quantity', parseInt(e.target.value) || 1)}
                              min="1"
                              className="w-full px-3 py-2 text-sm text-center border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47] shadow-sm"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              value={item.unit_price}
                              onChange={(e) => updateLineItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                              step="0.01"
                              min="0"
                              className="w-full px-3 py-2 text-sm text-right border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47] shadow-sm"
                            />
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                            €{item.amount.toFixed(2)}
                          </td>
                          <td className="px-3 py-3">
                            {formData.line_items.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeLineItem(index)}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-72 bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="font-medium text-gray-900">€{formData.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Tax Rate (%)</span>
                    <input
                      type="number"
                      value={formData.tax_rate}
                      onChange={(e) => updateTaxRate(parseFloat(e.target.value) || 0)}
                      step="0.1"
                      min="0"
                      className="w-24 px-3 py-2 text-sm text-right border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] shadow-sm"
                    />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Tax Amount</span>
                    <span className="text-gray-900">€{formData.tax_amount.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Discount</span>
                    <input
                      type="number"
                      value={formData.discount_amount}
                      onChange={(e) => updateDiscount(parseFloat(e.target.value) || 0)}
                      step="0.01"
                      min="0"
                      className="w-24 px-3 py-2 text-sm text-right border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] shadow-sm"
                    />
                  </div>
                  <div className="flex justify-between pt-3 border-t border-gray-200">
                    <span className="font-semibold text-gray-900">Total</span>
                    <span className="font-bold text-xl text-gray-900">€{formData.total_amount.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Notes & Terms */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Payment Terms</label>
                  <input
                    type="text"
                    value={formData.payment_terms}
                    onChange={(e) => setFormData(prev => ({ ...prev, payment_terms: e.target.value }))}
                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47] shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                  <input
                    type="text"
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Additional notes..."
                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47] shadow-sm"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 text-sm font-medium bg-[#647C47] text-white rounded-lg hover:bg-[#4f6238] transition-colors disabled:opacity-50 shadow-sm"
                >
                  {saving ? 'Creating...' : 'Create Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}