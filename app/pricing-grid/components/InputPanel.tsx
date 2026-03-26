'use client'

import { useState } from 'react'
import { Plus, FileText, Upload, Loader2, Trash2 } from 'lucide-react'

interface InputPanelProps {
  onParseDays: (text: string) => Promise<void>
  onAddDay: () => void
  onLoadItinerary: (itineraryId: string) => Promise<void>
  onClearAll?: () => void
  isParsing: boolean
  hasDays?: boolean
}

export default function InputPanel({ onParseDays, onAddDay, onLoadItinerary, onClearAll, isParsing, hasDays }: InputPanelProps) {
  const [text, setText] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [itineraryId, setItineraryId] = useState('')

  return (
    <div className="bg-white border rounded-lg shadow-sm p-4 mb-4">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Paste Text */}
        <button
          type="button"
          onClick={() => setShowPaste(!showPaste)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <FileText className="w-4 h-4" />
          Paste Text
        </button>

        {/* Load from Itinerary */}
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={itineraryId}
            onChange={(e) => setItineraryId(e.target.value)}
            placeholder="Itinerary ID..."
            className="px-3 py-2 text-sm border rounded-lg w-48"
          />
          <button
            type="button"
            onClick={() => itineraryId && onLoadItinerary(itineraryId)}
            disabled={!itineraryId}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Load
          </button>
        </div>

        {/* Add Day Manually */}
        <button
          type="button"
          onClick={onAddDay}
          className="flex items-center gap-1 px-4 py-2 text-sm font-medium border-2 border-dashed border-gray-300 text-gray-600 rounded-lg hover:border-gray-400 hover:text-gray-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Day
        </button>

        {/* Clear All / New Quote — only show when there's data */}
        {hasDays && onClearAll && (
          <button
            type="button"
            onClick={() => {
              if (confirm('Clear all days and start a new quote? This cannot be undone.')) {
                onClearAll()
              }
            }}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors ml-auto"
          >
            <Trash2 className="w-4 h-4" />
            New Quote
          </button>
        )}
      </div>

      {/* Paste Area */}
      {showPaste && (
        <div className="mt-3 space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            className="w-full px-3 py-2 text-sm border rounded-lg resize-y focus:ring-2 focus:ring-blue-300"
            placeholder={'Paste WhatsApp conversation, email text, or itinerary description here...\n\nThe AI will parse it into days with services.'}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                if (text.trim()) {
                  await onParseDays(text)
                  setText('')
                  setShowPaste(false)
                }
              }}
              disabled={isParsing || !text.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {isParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              {isParsing ? 'Parsing...' : 'Parse into Days'}
            </button>
            <button
              type="button"
              onClick={() => { setShowPaste(false); setText('') }}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
