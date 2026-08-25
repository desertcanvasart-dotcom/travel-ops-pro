'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  Plus,
  Search,
  FileText,
  Filter,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  Clock,
  CircleDollarSign,
  XCircle,
  Loader2,
  ArrowLeft,
  Upload,
  Sparkles,
  FileImage,
  Trash2,
} from 'lucide-react'

interface SupplierInvoice {
  id: string
  supplier_invoice_number: string
  internal_reference: string
  supplier_name: string
  invoice_date: string
  due_date?: string
  amount: number
  currency: string
  status: string
  match_status: string
  matched_amount: number
  discrepancy_amount: number
  description?: string
  document_url?: string
}

interface Summary {
  total: number
  total_amount: number
  received: number
  unmatched: number
  matched_pending: number
  approved: number
  paid: number
  disputed: number
}

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
  received: { bg: 'bg-gray-100', text: 'text-gray-700', icon: Clock },
  matched: { bg: 'bg-blue-100', text: 'text-blue-700', icon: CheckCircle },
  approved: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: CheckCircle },
  paid: { bg: 'bg-green-100', text: 'text-green-700', icon: CircleDollarSign },
  disputed: { bg: 'bg-red-100', text: 'text-red-700', icon: AlertTriangle },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-400', icon: XCircle },
}

const MATCH_STYLES: Record<string, { bg: string; text: string }> = {
  unmatched: { bg: 'bg-gray-100', text: 'text-gray-600' },
  partial: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  matched: { bg: 'bg-green-100', text: 'text-green-700' },
  discrepancy: { bg: 'bg-red-100', text: 'text-red-700' },
}

const CURRENCIES: Record<string, string> = { EUR: '\u20AC', USD: '$', GBP: '\u00A3', EGP: 'E\u00A3', JPY: '\u00A5' }

const SERVICE_CATEGORIES = [
  { value: 'guide', label: 'Tour Guide' },
  { value: 'driver', label: 'Driver' },
  { value: 'hotel', label: 'Hotel/Accommodation' },
  { value: 'transportation', label: 'Transportation' },
  { value: 'entrance', label: 'Entrance Fees' },
  { value: 'meal', label: 'Meals' },
  { value: 'airport_staff', label: 'Airport Assistant' },
  { value: 'hotel_staff', label: 'Hotel Assistant' },
  { value: 'ground_handler', label: 'Ground Handler' },
  { value: 'tipping', label: 'Tipping' },
  { value: 'permits', label: 'Permits' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'other', label: 'Other' },
]

interface LineItem {
  service_type: string
  description: string
  quantity: number
  unit_price: number
  amount: number
}

interface Supplier {
  id: string
  name: string
  type: string
}

const emptyLineItem = (): LineItem => ({
  service_type: '',
  description: '',
  quantity: 1,
  unit_price: 0,
  amount: 0,
})

export default function SupplierInvoicesPage() {
  const router = useRouter()
  const t = useTranslations('common')
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [matchFilter, setMatchFilter] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)

  // Supplier list for dropdown
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplierSearch, setSupplierSearch] = useState('')
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false)
  const [supplierRates, setSupplierRates] = useState<Record<string, unknown>[]>([])

  // Itinerary and invoice lists for dropdowns
  const [itineraries, setItineraries] = useState<Array<{ id: string; code: string; client_name: string }>>([])
  const [clientInvoices, setClientInvoices] = useState<Array<{ id: string; invoice_number: string; client_name: string; total_amount: number }>>([])

  // Create form state
  const [formData, setFormData] = useState({
    supplier_invoice_number: '',
    supplier_name: '',
    supplier_id: '',
    itinerary_id: '',
    client_invoice_id: '',
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: '',
    currency: 'EUR',
    tax_amount: '',
    description: '',
    line_items: [emptyLineItem()] as LineItem[],
  })
  const [creating, setCreating] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [parsedConfidence, setParsedConfidence] = useState<Record<string, string> | null>(null)

  // Fetch suppliers, itineraries, and invoices when modal opens
  useEffect(() => {
    if (showCreateModal) {
      if (suppliers.length === 0) {
        fetch('/api/suppliers?status=active')
          .then(r => r.json())
          .then(res => {
            const arr = Array.isArray(res) ? res : (res.data || [])
            setSuppliers(arr.map((s: Record<string, unknown>) => ({ id: s.id as string, name: s.name as string, type: s.type as string })))
          })
          .catch(() => {})
      }
      if (itineraries.length === 0) {
        // Dropdown picker: request the API's max page (1000; default is 100)
        fetch('/api/itineraries?limit=1000')
          .then(r => r.json())
          .then(res => {
            const arr = Array.isArray(res) ? res : (res.data || [])
            setItineraries(arr.map((it: Record<string, unknown>) => ({
              id: it.id as string,
              code: (it.itinerary_code || it.trip_name || '') as string,
              client_name: (it.client_name || '') as string,
            })))
          })
          .catch(() => {})
      }
      if (clientInvoices.length === 0) {
        // Dropdown picker: request the API's max page (1000; default is 100)
        fetch('/api/invoices?limit=1000')
          .then(r => r.json())
          .then(res => {
            const arr = Array.isArray(res) ? res : (res.data || [])
            setClientInvoices(arr.map((inv: Record<string, unknown>) => ({
              id: inv.id as string,
              invoice_number: (inv.invoice_number || '') as string,
              client_name: (inv.client_name || '') as string,
              total_amount: Number(inv.total_amount || 0),
            })))
          })
          .catch(() => {})
      }
    }
  }, [showCreateModal])

  // Fetch supplier rates when supplier changes
  useEffect(() => {
    if (formData.supplier_id) {
      fetch(`/api/supplier-rates?supplier_id=${formData.supplier_id}`)
        .then(r => r.json())
        .then(data => setSupplierRates(data.data || []))
        .catch(() => setSupplierRates([]))
    } else {
      setSupplierRates([])
    }
  }, [formData.supplier_id])

  const computedTotal = formData.line_items.reduce((sum, li) => sum + (li.amount || 0), 0)
  const computedGrandTotal = computedTotal + (parseFloat(formData.tax_amount) || 0)

  const handleSelectSupplier = (supplier: Supplier) => {
    setFormData(prev => ({ ...prev, supplier_name: supplier.name, supplier_id: supplier.id }))
    setSupplierSearch(supplier.name)
    setShowSupplierDropdown(false)
  }

  const handleSupplierInputChange = (value: string) => {
    setSupplierSearch(value)
    setFormData(prev => ({ ...prev, supplier_name: value, supplier_id: '' }))
    setShowSupplierDropdown(true)
  }

  // Map service categories to supplier types for filtering
  const serviceToSupplierType: Record<string, string[]> = {
    guide: ['guide'],
    driver: ['driver', 'transport', 'local_operator'],
    hotel: ['hotel'],
    transportation: ['transport', 'local_operator', 'driver'],
    entrance: ['attraction', 'government'],
    meal: ['restaurant'],
    airport_staff: ['airport_assistant', 'ground_handler'],
    hotel_staff: ['hotel_assistant', 'hotel'],
    ground_handler: ['ground_handler'],
  }

  // Get supplier types from selected service types in line items
  const selectedServiceTypes = formData.line_items
    .map(li => li.service_type)
    .filter(Boolean)
  const relevantSupplierTypes = selectedServiceTypes.length > 0
    ? [...new Set(selectedServiceTypes.flatMap(st => serviceToSupplierType[st] || []))]
    : []

  const filteredSuppliers = suppliers.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(supplierSearch.toLowerCase())
    const matchesType = relevantSupplierTypes.length === 0 || relevantSupplierTypes.includes(s.type)
    return matchesSearch && matchesType
  })

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    setFormData(prev => {
      const items = [...prev.line_items]
      const item = { ...items[index], [field]: value }
      // Recalculate amount
      if (field === 'quantity' || field === 'unit_price') {
        item.amount = Number(item.quantity) * Number(item.unit_price)
      }
      items[index] = item
      return { ...prev, line_items: items }
    })
  }

  const addLineItem = () => {
    setFormData(prev => ({ ...prev, line_items: [...prev.line_items, emptyLineItem()] }))
  }

  const removeLineItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      line_items: prev.line_items.length > 1 ? prev.line_items.filter((_, i) => i !== index) : prev.line_items,
    }))
  }

  const handleServiceTypeChange = (index: number, serviceType: string) => {
    updateLineItem(index, 'service_type', serviceType)
    // Auto-fill description from category label
    const cat = SERVICE_CATEGORIES.find(c => c.value === serviceType)
    if (cat) updateLineItem(index, 'description', cat.label)

    // Try to find a matching rate
    if (supplierRates.length > 0 && serviceType) {
      const matchingRate = supplierRates.find((r: Record<string, unknown>) => {
        const rateType = String(r._rate_type || '')
        if (serviceType === 'hotel' && rateType.includes('accommodation')) return true
        if (serviceType === 'transportation' && rateType.includes('transport')) return true
        if (serviceType === 'guide' && rateType.includes('guide')) return true
        if (serviceType === 'meal' && rateType.includes('meal')) return true
        if (serviceType === 'entrance' && rateType.includes('entrance')) return true
        return false
      })
      if (matchingRate) {
        const price = Number(matchingRate.base_rate_eur || matchingRate.rate_eur || matchingRate.base_rate || 0)
        if (price > 0) {
          updateLineItem(index, 'unit_price', price)
        }
      }
    }
  }

  const resetForm = () => {
    setFormData({
      supplier_invoice_number: '',
      supplier_name: '',
      supplier_id: '',
      itinerary_id: '',
      client_invoice_id: '',
      invoice_date: new Date().toISOString().split('T')[0],
      due_date: '',
      currency: 'EUR',
      tax_amount: '',
      description: '',
      line_items: [emptyLineItem()],
    })
    setSupplierSearch('')
    setParsedConfidence(null)
    setParseError(null)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setParsing(true)
    setParseError(null)
    setParsedConfidence(null)

    try {
      const fd = new FormData()
      fd.append('file', file)

      const res = await fetch('/api/ai/parse-supplier-invoice', {
        method: 'POST',
        body: fd,
      })

      const result = await res.json()

      if (!result.success) {
        setParseError(result.error || 'Failed to parse document')
        return
      }

      const d = result.data

      // Map parsed line items
      const parsedLineItems: LineItem[] = (d.line_items || []).map((li: Record<string, unknown>) => ({
        service_type: '',
        description: String(li.description || ''),
        quantity: Number(li.quantity || 1),
        unit_price: Number(li.unit_price || li.amount || 0),
        amount: Number(li.amount || 0),
      }))

      // Try to match parsed supplier name to existing supplier
      const matchedSupplier = d.supplier_name
        ? suppliers.find(s => s.name.toLowerCase().includes(String(d.supplier_name).toLowerCase()))
        : undefined

      setFormData(prev => ({
        ...prev,
        supplier_invoice_number: String(d.supplier_invoice_number || ''),
        supplier_name: String(matchedSupplier?.name || d.supplier_name || ''),
        supplier_id: matchedSupplier?.id || '',
        invoice_date: String(d.invoice_date || new Date().toISOString().split('T')[0]),
        due_date: String(d.due_date || ''),
        currency: String(d.currency || 'EUR'),
        tax_amount: d.tax_amount ? String(d.tax_amount) : '',
        description: String(d.description || ''),
        line_items: parsedLineItems.length > 0 ? parsedLineItems : [emptyLineItem()],
      }))
      setSupplierSearch(matchedSupplier?.name || d.supplier_name || '')
      setParsedConfidence(d.confidence || null)
    } catch (err) {
      console.error('Parse error:', err)
      setParseError('Failed to process document. Please try again.')
    } finally {
      setParsing(false)
      e.target.value = ''
    }
  }

  useEffect(() => {
    fetchInvoices()
  }, [statusFilter, matchFilter])

  const fetchInvoices = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (matchFilter) params.set('matchStatus', matchFilter)

      const res = await fetch(`/api/supplier-invoices?${params}`)
      const data = await res.json()
      setInvoices(data.data || [])
      setSummary(data.summary || null)
    } catch (error) {
      console.error('Error fetching supplier invoices:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!formData.supplier_invoice_number || !formData.supplier_name || computedTotal <= 0) return
    setCreating(true)
    try {
      const res = await fetch('/api/supplier-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_invoice_number: formData.supplier_invoice_number,
          supplier_name: formData.supplier_name,
          supplier_id: formData.supplier_id || null,
          itinerary_id: formData.itinerary_id || null,
          client_invoice_id: formData.client_invoice_id || null,
          invoice_date: formData.invoice_date,
          due_date: formData.due_date || null,
          currency: formData.currency,
          amount: computedGrandTotal,
          tax_amount: parseFloat(formData.tax_amount) || 0,
          description: formData.description,
          line_items: formData.line_items.filter(li => li.amount > 0),
        }),
      })
      if (res.ok) {
        setShowCreateModal(false)
        resetForm()
        fetchInvoices()
      }
    } catch (error) {
      console.error('Error creating supplier invoice:', error)
    } finally {
      setCreating(false)
    }
  }

  const filtered = invoices.filter(inv =>
    !searchTerm ||
    inv.supplier_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.supplier_invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.internal_reference?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bills</h1>
          <p className="text-sm text-gray-500 mt-1">Invoices received from suppliers — matched to expenses, then approved and paid</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Supplier Invoice
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{summary.total}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Unmatched</p>
            <p className="text-2xl font-bold text-yellow-600 mt-1">{summary.unmatched}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Awaiting Approval</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{summary.matched_pending}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Paid</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{summary.paid}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by supplier or invoice number..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
        >
          <option value="">All Statuses</option>
          <option value="received">Received</option>
          <option value="matched">Matched</option>
          <option value="approved">Approved</option>
          <option value="paid">Paid</option>
          <option value="disputed">Disputed</option>
        </select>
        <select
          value={matchFilter}
          onChange={e => setMatchFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
        >
          <option value="">All Match Statuses</option>
          <option value="unmatched">Unmatched</option>
          <option value="partial">Partial</option>
          <option value="matched">Matched</option>
          <option value="discrepancy">Discrepancy</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-[#647C47] animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm">No supplier invoices found</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Match</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(inv => {
                const statusStyle = STATUS_STYLES[inv.status] || STATUS_STYLES.received
                const matchStyle = MATCH_STYLES[inv.match_status] || MATCH_STYLES.unmatched
                const StatusIcon = statusStyle.icon

                return (
                  <tr
                    key={inv.id}
                    onClick={() => router.push(`/supplier-invoices/${inv.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-gray-900">{inv.internal_reference}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700">{inv.supplier_name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-500">{inv.supplier_invoice_number}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-500">
                        {new Date(inv.invoice_date).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-medium text-gray-900">
                        {CURRENCIES[inv.currency] || inv.currency}{Number(inv.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${statusStyle.bg} ${statusStyle.text}`}>
                        <StatusIcon className="w-3 h-3" />
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${matchStyle.bg} ${matchStyle.text}`}>
                        {inv.match_status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setShowCreateModal(false); setParseError(null); setParsedConfidence(null) }} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">New Supplier Invoice</h3>

            {/* Upload & Parse Zone */}
            <div className="mb-5">
              <label className={`flex flex-col items-center gap-2 p-4 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                parsing
                  ? 'border-[#647C47] bg-[#647C47]/5'
                  : 'border-gray-200 hover:border-[#647C47] hover:bg-gray-50'
              }`}>
                {parsing ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-5 h-5 text-[#647C47] animate-spin" />
                      <Sparkles className="w-5 h-5 text-[#647C47]" />
                    </div>
                    <span className="text-sm font-medium text-[#647C47]">Reading invoice with AI...</span>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-gray-400">
                      <Upload className="w-5 h-5" />
                      <FileImage className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-medium text-gray-600">Upload PDF or photo to auto-fill</span>
                    <span className="text-xs text-gray-400">AI reads the invoice and fills the form below</span>
                  </>
                )}
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.gif"
                  onChange={handleFileUpload}
                  disabled={parsing}
                  className="hidden"
                />
              </label>

              {parseError && (
                <div className="mt-2 flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <span className="text-xs text-red-600">{parseError}</span>
                </div>
              )}

              {parsedConfidence && (
                <div className="mt-2 flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                  <Sparkles className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <span className="text-xs text-green-700">
                    AI extracted data (confidence: {parsedConfidence.overall || 'medium'}). Review and edit below before saving.
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {/* Row 1: Invoice # + Supplier dropdown */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Supplier Invoice #</label>
                  <input
                    type="text"
                    value={formData.supplier_invoice_number}
                    onChange={e => setFormData(prev => ({ ...prev, supplier_invoice_number: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                    placeholder="e.g. INV-001"
                  />
                </div>
                <div className="relative">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Supplier</label>
                  <input
                    type="text"
                    value={supplierSearch}
                    onChange={e => handleSupplierInputChange(e.target.value)}
                    onFocus={() => setShowSupplierDropdown(true)}
                    onBlur={() => setTimeout(() => setShowSupplierDropdown(false), 200)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                    placeholder="Search or type supplier..."
                  />
                  {showSupplierDropdown && filteredSuppliers.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {filteredSuppliers.slice(0, 15).map(s => (
                        <button
                          key={s.id}
                          onMouseDown={() => handleSelectSupplier(s)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
                        >
                          <span className="font-medium text-gray-900">{s.name}</span>
                          <span className="text-xs text-gray-400">{s.type}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {formData.supplier_id ? (
                    <p className="text-xs text-green-600 mt-0.5">Linked to supplier record</p>
                  ) : relevantSupplierTypes.length > 0 ? (
                    <p className="text-xs text-gray-400 mt-0.5">Showing {relevantSupplierTypes.join(', ')} suppliers</p>
                  ) : null}
                </div>
              </div>

              {/* Row 2: Dates + Currency */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Invoice Date</label>
                  <input
                    type="date"
                    value={formData.invoice_date}
                    onChange={e => setFormData(prev => ({ ...prev, invoice_date: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={formData.due_date}
                    onChange={e => setFormData(prev => ({ ...prev, due_date: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Currency</label>
                  <select
                    value={formData.currency}
                    onChange={e => setFormData(prev => ({ ...prev, currency: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  >
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="GBP">GBP</option>
                    <option value="EGP">EGP</option>
                    <option value="JPY">JPY</option>
                  </select>
                </div>
              </div>

              {/* Itinerary and Client Invoice links */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Related Itinerary</label>
                  <select
                    value={formData.itinerary_id}
                    onChange={e => setFormData(prev => ({ ...prev, itinerary_id: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  >
                    <option value="">None</option>
                    {itineraries.map(it => (
                      <option key={it.id} value={it.id}>
                        {it.code}{it.client_name ? ` — ${it.client_name}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Customer Invoice</label>
                  <select
                    value={formData.client_invoice_id}
                    onChange={e => setFormData(prev => ({ ...prev, client_invoice_id: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  >
                    <option value="">None</option>
                    {clientInvoices.map(inv => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoice_number} — {inv.client_name} ({CURRENCIES[formData.currency]}{inv.total_amount.toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-700">Line Items</label>
                  <button
                    type="button"
                    onClick={addLineItem}
                    className="text-xs font-medium text-[#647C47] hover:text-[#4f6238]"
                  >
                    + Add Line
                  </button>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Header */}
                  <div className="grid grid-cols-12 gap-1 px-2 py-1.5 bg-gray-50 text-[10px] font-medium text-gray-500 uppercase">
                    <div className="col-span-3">Service</div>
                    <div className="col-span-4">Description</div>
                    <div className="col-span-1 text-center">Qty</div>
                    <div className="col-span-2 text-right">Price</div>
                    <div className="col-span-1 text-right">Total</div>
                    <div className="col-span-1"></div>
                  </div>

                  {/* Rows */}
                  {formData.line_items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-1 px-2 py-1.5 border-t border-gray-100 items-center">
                      <div className="col-span-3">
                        <select
                          value={item.service_type}
                          onChange={e => handleServiceTypeChange(idx, e.target.value)}
                          className="w-full px-1.5 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#647C47]"
                        >
                          <option value="">Select...</option>
                          {SERVICE_CATEGORIES.map(c => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-4">
                        <input
                          type="text"
                          value={item.description}
                          onChange={e => updateLineItem(idx, 'description', e.target.value)}
                          className="w-full px-1.5 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#647C47]"
                          placeholder="Description"
                        />
                      </div>
                      <div className="col-span-1">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={e => updateLineItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                          className="w-full px-1 py-1 text-xs text-center border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#647C47]"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          step="0.01"
                          value={item.unit_price || ''}
                          onChange={e => updateLineItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                          className="w-full px-1.5 py-1 text-xs text-right border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#647C47]"
                          placeholder="0.00"
                        />
                      </div>
                      <div className="col-span-1 text-right">
                        <span className="text-xs font-medium text-gray-700">
                          {item.amount > 0 ? item.amount.toFixed(2) : '-'}
                        </span>
                      </div>
                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => removeLineItem(idx)}
                          className="p-0.5 text-gray-300 hover:text-red-500"
                          disabled={formData.line_items.length === 1}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Totals */}
                  <div className="border-t border-gray-200 bg-gray-50 px-2 py-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Subtotal</span>
                      <span className="font-medium">{CURRENCIES[formData.currency]}{computedTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs mt-1">
                      <span className="text-gray-500">Tax</span>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.tax_amount}
                        onChange={e => setFormData(prev => ({ ...prev, tax_amount: e.target.value }))}
                        className="w-20 px-1.5 py-0.5 text-xs text-right border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#647C47]"
                        placeholder="0.00"
                      />
                    </div>
                    <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-gray-200">
                      <span>Total</span>
                      <span className="text-[#647C47]">{CURRENCIES[formData.currency]}{computedGrandTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  placeholder="Optional description"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowCreateModal(false); resetForm() }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !formData.supplier_invoice_number || !formData.supplier_name || computedTotal <= 0}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors disabled:opacity-50"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
