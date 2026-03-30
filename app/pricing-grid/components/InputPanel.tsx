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
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-4 overflow-hidden">
      {/* New Quote banner — shown when existing itinerary is loaded */}
      {hasDays && onClearAll && (
        <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
          <span className="text-sm text-amber-700">An existing itinerary is loaded. Start fresh?</span>
          <button
            type="button"
            onClick={() => {
              if (confirm('Clear all days and start a new quote?')) {
                onClearAll()
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1 text-sm font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Quote
          </button>
        </div>
      )}

      {/* Action Bar — three distinct modes */}
      <div className="flex items-stretch divide-x divide-gray-200">

        {/* Mode 1: Import */}
        <div className="flex-1 px-4 py-2.5">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Import</div>
          <button
            type="button"
            onClick={() => setShowPaste(!showPaste)}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors w-full justify-center ${
              showPaste
                ? 'bg-blue-100 text-blue-700 border border-blue-300'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            <FileText className="w-4 h-4" />
            Paste Text
          </button>
        </div>

        {/* Mode 2: Load Saved */}
        <div className="flex-1 px-4 py-2.5">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Load Saved</div>
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={itineraryId}
              onChange={(e) => setItineraryId(e.target.value)}
              placeholder="Itinerary ID..."
              className="flex-1 min-w-0 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-purple-200 transition-all"
            />
            <button
              type="button"
              onClick={() => itineraryId && onLoadItinerary(itineraryId)}
              disabled={!itineraryId}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              Load
            </button>
          </div>
        </div>

        {/* Mode 3: Build Manually */}
        <div className="flex-1 px-4 py-2.5">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Build Manually</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onAddDay}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium border-2 border-dashed border-gray-300 text-gray-600 rounded-lg hover:border-gray-400 hover:text-gray-700 transition-colors flex-1 justify-center"
            >
              <Plus className="w-4 h-4" />
              Add Day
            </button>

            {/* Clear All / New Quote */}
            {hasDays && onClearAll && (
              <button
                type="button"
                onClick={() => {
                  if (confirm('Clear all days and start a new quote? This cannot be undone.')) {
                    onClearAll()
                  }
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                title="Clear all days and start fresh"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Paste Area — expands below the bar */}
      {showPaste && (
        <div className="border-t border-gray-200 px-4 py-3 bg-blue-50/30">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            className="w-full px-3 py-2 text-sm border border-blue-200 rounded-lg resize-y focus:ring-2 focus:ring-blue-300 bg-white"
            placeholder={'Paste WhatsApp conversation, email text, or itinerary description here...\n\nThe AI will parse it into days with services.'}
            autoFocus
          />
          <div className="flex items-center gap-2 mt-2">
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
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {isParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              {isParsing ? 'Parsing...' : 'Parse & Generate Quote'}
            </button>
            <button
              type="button"
              onClick={() => { setShowPaste(false); setText('') }}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
