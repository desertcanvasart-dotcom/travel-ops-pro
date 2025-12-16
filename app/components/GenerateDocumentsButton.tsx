'use client'

import { useState } from 'react'
import { FileText, ChevronDown, Hotel, Car, Ship, MapPin, Users, Check, Loader2 } from 'lucide-react'
import Link from 'next/link'

interface GenerateDocumentsButtonProps {
  itineraryId: string
  itineraryCode: string
}

const DOCUMENT_TYPES = [
  { value: 'hotel_voucher', label: 'Hotel Vouchers', icon: Hotel },
  { value: 'transport_voucher', label: 'Transport Vouchers', icon: Car },
  { value: 'cruise_voucher', label: 'Cruise Vouchers', icon: Ship },
  { value: 'activity_voucher', label: 'Activity Vouchers', icon: MapPin },
  { value: 'guide_assignment', label: 'Guide Assignments', icon: Users },
  { value: 'service_order', label: 'Service Orders', icon: FileText }
]

export default function GenerateDocumentsButton({ itineraryId, itineraryCode }: GenerateDocumentsButtonProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string; count?: number } | null>(null)
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])

  const handleGenerateAll = async () => {
    setGenerating(true)
    setResult(null)
    
    try {
      const response = await fetch(`/api/itineraries/${itineraryId}/generate-documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      
      const data = await response.json()
      
      if (data.success) {
        setResult({
          success: true,
          message: data.message,
          count: data.count
        })
      } else {
        setResult({
          success: false,
          message: data.error || 'Failed to generate documents'
        })
      }
    } catch (error) {
      setResult({
        success: false,
        message: 'Error generating documents'
      })
    } finally {
      setGenerating(false)
      setShowDropdown(false)
    }
  }

  const handleGenerateSelected = async () => {
    if (selectedTypes.length === 0) {
      setResult({ success: false, message: 'Please select at least one document type' })
      return
    }
    
    setGenerating(true)
    setResult(null)
    
    try {
      const response = await fetch(`/api/itineraries/${itineraryId}/generate-documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_types: selectedTypes })
      })
      
      const data = await response.json()
      
      if (data.success) {
        setResult({
          success: true,
          message: data.message,
          count: data.count
        })
        setSelectedTypes([])
      } else {
        setResult({
          success: false,
          message: data.error || 'Failed to generate documents'
        })
      }
    } catch (error) {
      setResult({
        success: false,
        message: 'Error generating documents'
      })
    } finally {
      setGenerating(false)
      setShowDropdown(false)
    }
  }

  const toggleType = (type: string) => {
    setSelectedTypes(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={generating}
        className="px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
      >
        {generating ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <FileText className="w-4 h-4" />
        )}
        <span>Documents</span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {/* Dropdown */}
      {showDropdown && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowDropdown(false)}
          />
          <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-lg border border-gray-200 shadow-lg z-50">
            <div className="p-3 border-b border-gray-200">
              <h4 className="text-sm font-semibold text-gray-900">Generate Supplier Documents</h4>
              <p className="text-xs text-gray-500 mt-1">Select document types to generate</p>
            </div>
            
            <div className="p-2 space-y-1 max-h-64 overflow-y-auto">
              {DOCUMENT_TYPES.map(type => {
                const Icon = type.icon
                const isSelected = selectedTypes.includes(type.value)
                return (
                  <button
                    key={type.value}
                    onClick={() => toggleType(type.value)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                      isSelected 
                        ? 'bg-indigo-50 text-indigo-700' 
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="flex-1 text-left">{type.label}</span>
                    {isSelected && <Check className="w-4 h-4" />}
                  </button>
                )
              })}
            </div>
            
            <div className="p-3 border-t border-gray-200 space-y-2">
              <button
                onClick={handleGenerateSelected}
                disabled={selectedTypes.length === 0 || generating}
                className="w-full px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Generate Selected ({selectedTypes.length})
              </button>
              <button
                onClick={handleGenerateAll}
                disabled={generating}
                className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium"
              >
                Generate All Available
              </button>
              <Link
                href={`/documents/supplier?itineraryId=${itineraryId}`}
                className="w-full px-3 py-2 text-indigo-600 hover:text-indigo-700 text-sm font-medium text-center block"
              >
                View Existing Documents →
              </Link>
            </div>
          </div>
        </>
      )}

      {/* Result Toast */}
      {result && (
        <div className={`fixed bottom-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm ${
          result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}>
          <div className="flex items-start gap-3">
            {result.success ? (
              <Check className="w-5 h-5 text-green-600 mt-0.5" />
            ) : (
              <FileText className="w-5 h-5 text-red-600 mt-0.5" />
            )}
            <div>
              <p className={`text-sm font-medium ${result.success ? 'text-green-800' : 'text-red-800'}`}>
                {result.message}
              </p>
              {result.success && result.count && result.count > 0 && (
                <Link
                  href={`/documents/supplier?itineraryId=${itineraryId}`}
                  className="text-xs text-green-600 hover:text-green-700 mt-1 inline-block"
                >
                  View documents →
                </Link>
              )}
            </div>
            <button
              onClick={() => setResult(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  )
}