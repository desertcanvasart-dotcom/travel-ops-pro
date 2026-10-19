'use client'

// ============================================
// Guest surveys — staff results view
// ============================================
// Lists the org's guest surveys, a page at a time, and lets staff read every
// guest's answers, labelled from the shared questionnaire definition.

import { useEffect, useState } from 'react'
import { ClipboardList, Loader2, ChevronDown, ChevronRight, Mail, MessageCircle, Trash2 } from 'lucide-react'
import { useConfirm } from '@/components/ConfirmDialog'
import {
  SURVEY_SECTIONS,
  OPTIONAL_TOURS,
  FREE_TEXT,
  RATING_SCALE,
  type RatingValue,
} from '@/lib/surveys/guest-survey'
import { overallSummary } from '@/lib/surveys/survey-responses'

interface Answers {
  ratings?: Record<string, RatingValue>
  comments?: Record<string, string>
  extras?: Record<string, string>
  optional_tours?: string
  optional_tours_detail?: string
  additional_comments?: string
  guest_name?: string
}

// One guest's submission. The party shares one link, and each guest's answers
// are their own row (guest_survey_responses) — a second submit used to erase
// the first.
interface SurveyResponse {
  id: string
  respondent_name: string | null
  answers: Answers
  submitted_at: string
}

interface Survey {
  id: string
  /** Null when the trip was deleted: the invite is never sent then. */
  itinerary_id: string | null
  token: string
  status: 'pending' | 'sent' | 'submitted'
  trip_snapshot: { trip_name?: string; tour_code?: string; start_date?: string; end_date?: string; client_name?: string }
  responses: SurveyResponse[]
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

/** One guest's answers, labelled from the shared questionnaire definition. */
function AnswerSheet({ answers }: { answers: Answers }) {
  return (
    <>
      {SURVEY_SECTIONS.map(section => (
        <div key={section.id} className="mt-3">
          <h3 className="text-[#647C47] font-semibold text-xs uppercase tracking-wide mb-1">{section.en}</h3>
          {section.items.map(item => {
            const r = answers.ratings?.[item.id]
            const c = answers.comments?.[item.id]
            const ex = item.extra ? answers.extras?.[item.extra.id] : undefined
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
          {answers.optional_tours === 'yes' ? `はい${answers.optional_tours_detail ? ` — ${answers.optional_tours_detail}` : ''}` : answers.optional_tours === 'no' ? 'いいえ' : '—'}
        </span>
      </div>
      {answers.additional_comments && (
        <div className="mt-3">
          <span className="text-gray-600">{FREE_TEXT.ja}: </span>
          <span className="text-gray-900">{answers.additional_comments}</span>
        </div>
      )}
    </>
  )
}

export default function SurveysPage() {
  const [loading, setLoading] = useState(true)
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  // A page at a time (the list used to stop silently at 300).
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  // false: this company has no guest questionnaire, so surveys are never made.
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const confirm = useConfirm()
  const [reload, setReload] = useState(0)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Only an unanswered survey can be deleted (the API refuses one with answers).
  const remove = async (s: Survey) => {
    const ok = await confirm(
      `Delete the survey for "${s.trip_snapshot?.trip_name || 'this trip'}"? Its link stops working. Nobody has answered it.`,
      { title: 'Delete this survey?', confirmText: 'Delete', variant: 'danger' }
    )
    if (!ok) return
    setDeleting(s.id); setError(null)
    try {
      const res = await fetch(`/api/surveys/${s.id}`, { method: 'DELETE' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.success) { setError(j.error || 'Could not delete the survey'); return }
      setOpen(null)
      setReload(n => n + 1)
    } finally { setDeleting(null) }
  }

  useEffect(() => {
    setLoading(true)
    fetch(`/api/surveys?page=${page}`)
      .then(r => r.json())
      .then(j => {
        if (!j.success) throw new Error(j.error || 'Failed to load')
        setSurveys(j.data)
        setTotal(j.total ?? j.data.length)
        setPageSize(j.pageSize ?? 50)
        setEnabled(j.enabled ?? null)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [page, reload])

  const pages = Math.max(1, Math.ceil(total / pageSize))
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(total, page * pageSize)

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
          <div className="flex flex-col items-center justify-center min-h-48 py-8 text-gray-500 px-6 text-center">
            <ClipboardList className="w-10 h-10 mb-2 text-gray-300" />
            {enabled === false ? (
              <>
                <p className="text-sm font-medium text-gray-700">Guest surveys are not turned on for your company.</p>
                <p className="text-sm mt-1 max-w-lg">
                  No survey is created or sent, so this list stays empty. Surveys are available only to a company
                  that has the guest questionnaire template, which the platform sets up for the company — it is not a Settings option.
                </p>
              </>
            ) : (
              <p className="text-sm">No surveys yet — one is created for each confirmed or completed trip on the day it ends.</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {surveys.map(s => {
              const st = STATUS[s.status]
              const expanded = open === s.id
              const answers = s.responses ?? []
              const overall = overallSummary(answers)
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
                        {!s.itinerary_id && <span className="text-amber-700">trip deleted — will not be sent</span>}
                        {s.sent_email && <span className="inline-flex items-center gap-0.5"><Mail className="w-3 h-3" />email</span>}
                        {s.sent_whatsapp && <span className="inline-flex items-center gap-0.5"><MessageCircle className="w-3 h-3" />WhatsApp</span>}
                        {s.submitted_at && <span className="text-green-600">first answer {new Date(s.submitted_at).toLocaleDateString()}</span>}
                        {answers.length > 0 && <span>{answers.length === 1 ? '1 answer' : `${answers.length} answers`}</span>}
                      </div>
                    </div>
                    {overall && (
                      <span
                        className="text-sm font-semibold text-gray-900"
                        title={overall.count > 1 ? `Average of ${overall.count} guests' overall ratings` : undefined}
                      >
                        総合 {overall.mean}/5{overall.count > 1 ? ` (${overall.count})` : ''}
                      </span>
                    )}
                  </button>

                  {expanded && (
                    <div className="px-6 pb-5 pt-1 bg-gray-50/50 text-sm">
                      {answers.length === 0 ? (
                        <div className="flex items-center justify-between gap-4 py-2">
                          <p className="text-gray-500">
                            Not yet answered. Link: <code className="text-xs">/survey/{s.token}</code>
                          </p>
                          <button
                            type="button"
                            onClick={() => void remove(s)}
                            disabled={deleting === s.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
                          >
                            {deleting === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            Delete survey
                          </button>
                        </div>
                      ) : (
                        answers.map((r, i) => (
                          <div key={r.id} className={i > 0 ? 'mt-5 pt-4 border-t border-gray-200' : 'mt-2'}>
                            <p className="text-xs font-semibold text-gray-700">
                              Guest {i + 1}{r.respondent_name ? ` — ${r.respondent_name}` : ' — no name given'}
                              <span className="font-normal text-gray-500"> · {new Date(r.submitted_at).toLocaleString()}</span>
                            </p>
                            <AnswerSheet answers={r.answers ?? {}} />
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {total > pageSize && (
        <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
          <span>Showing {first}–{last} of {total}</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => { setOpen(null); setPage(p => Math.max(1, p - 1)) }}
              className="px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Newer
            </button>
            <button
              type="button"
              disabled={page >= pages || loading}
              onClick={() => { setOpen(null); setPage(p => Math.min(pages, p + 1)) }}
              className="px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Older
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
