'use client'

// ============================================
// Guest surveys — staff results view
// ============================================
// Lists the org's guest surveys and lets staff read each submitted response,
// labelled from the shared questionnaire definition.

import { useEffect, useState } from 'react'
import { ClipboardList, Loader2, ChevronDown, ChevronRight, Mail, MessageCircle } from 'lucide-react'
import {
  SURVEY_SECTIONS,
  OPTIONAL_TOURS,
  FREE_TEXT,
  RATING_SCALE,
  type RatingValue,
} from '@/lib/surveys/guest-survey'

interface Survey {
  id: string
  token: string
  status: 'pending' | 'sent' | 'submitted'
  trip_snapshot: { trip_name?: string; tour_code?: string; start_date?: string; end_date?: string; client_name?: string }
  responses: {
    ratings?: Record<string, RatingValue>
    comments?: Record<string, string>
    extras?: Record<string, string>
    optional_tours?: string
    optional_tours_detail?: string
    additional_comments?: string
    guest_name?: string
  }
  sent_email: boolean
  sent_whatsapp: boolean
  sent_at: string | null
  submitted_at: string | null
}

const ratingWord = (v: RatingValue | undefined) =>
  v === undefined ? '—' : (RATING_SCALE.find(s => s.value === v)?.ja ?? String(v))

const STATUS = {
  pending: { label: 'Pending', cls: 'bg-gray-100 text-gray-600' },
  sent: { label: 'Sent', cls: 'bg-blue-100 text-blue-700' },
  submitted: { label: 'Submitted', cls: 'bg-green-100 text-green-700' },
}

export default function SurveysPage() {
  const [loading, setLoading] = useState(true)
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/surveys')
      .then(r => r.json())
      .then(j => {
        if (!j.success) throw new Error(j.error || 'Failed to load')
        setSurveys(j.data)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-[#647C47]/10 rounded-lg flex items-center justify-center">
          <ClipboardList className="w-5 h-5 text-[#647C47]" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Guest Surveys</h1>
          <p className="text-sm text-gray-500">Satisfaction questionnaires sent when a trip ends</p>
        </div>
      </div>

      {error && <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48"><Loader2 className="w-7 h-7 text-[#647C47] animate-spin" /></div>
        ) : surveys.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-500">
            <ClipboardList className="w-10 h-10 mb-2 text-gray-300" />
            <p className="text-sm">No surveys yet — they’re created automatically the day a trip ends.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {surveys.map(s => {
              const st = STATUS[s.status]
              const expanded = open === s.id
              const overall = s.responses?.ratings?.overall_satisfaction
              return (
                <div key={s.id}>
                  <button
                    onClick={() => setOpen(expanded ? null : s.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left"
                  >
                    {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 truncate">{s.trip_snapshot?.trip_name || 'Trip'}</span>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${st.cls}`}>{st.label}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-2">
                        {s.trip_snapshot?.client_name && <span>{s.trip_snapshot.client_name}</span>}
                        {s.trip_snapshot?.end_date && <span>ends {s.trip_snapshot.end_date}</span>}
                        {s.sent_email && <span className="inline-flex items-center gap-0.5"><Mail className="w-3 h-3" />email</span>}
                        {s.sent_whatsapp && <span className="inline-flex items-center gap-0.5"><MessageCircle className="w-3 h-3" />WhatsApp</span>}
                        {s.submitted_at && <span className="text-green-600">submitted {new Date(s.submitted_at).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    {s.status === 'submitted' && overall !== undefined && (
                      <span className="text-sm font-semibold text-gray-900">総合 {overall === 'na' ? '—' : `${overall}/5`}</span>
                    )}
                  </button>

                  {expanded && (
                    <div className="px-6 pb-5 pt-1 bg-gray-50/50 text-sm">
                      {s.status !== 'submitted' ? (
                        <p className="text-gray-500 py-2">
                          Not yet submitted. Link: <code className="text-xs">/survey/{s.token}</code>
                        </p>
                      ) : (
                        <>
                          {SURVEY_SECTIONS.map(section => (
                            <div key={section.id} className="mt-3">
                              <h3 className="text-[#647C47] font-semibold text-xs uppercase tracking-wide mb-1">{section.en}</h3>
                              {section.items.map(item => {
                                const r = s.responses?.ratings?.[item.id]
                                const c = s.responses?.comments?.[item.id]
                                const ex = item.extra ? s.responses?.extras?.[item.extra.id] : undefined
                                return (
                                  <div key={item.id} className="flex justify-between gap-4 py-1 border-b border-gray-100 last:border-0">
                                    <span className="text-gray-600">
                                      {item.ja}
                                      {ex && <span className="text-gray-400"> · {ex}</span>}
                                      {c && <span className="block text-xs text-gray-400 italic">“{c}”</span>}
                                    </span>
                                    <span className="text-gray-900 font-medium whitespace-nowrap">
                                      {r === undefined ? '—' : r === 'na' ? '該当なし' : `${r} ${ratingWord(r)}`}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          ))}
                          <div className="mt-3">
                            <span className="text-gray-600">{OPTIONAL_TOURS.ja}: </span>
                            <span className="text-gray-900">
                              {s.responses?.optional_tours === 'yes' ? `はい${s.responses?.optional_tours_detail ? ` — ${s.responses.optional_tours_detail}` : ''}` : s.responses?.optional_tours === 'no' ? 'いいえ' : '—'}
                            </span>
                          </div>
                          {s.responses?.additional_comments && (
                            <div className="mt-3">
                              <span className="text-gray-600">{FREE_TEXT.ja}: </span>
                              <span className="text-gray-900">{s.responses.additional_comments}</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
