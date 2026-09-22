'use client'

// ============================================
// Guest satisfaction survey — the customer's mobile page
// ============================================
// Japanese, thumb-friendly: tap a rating (5→1 / 該当なし) per item, add comments,
// submit. No login — reached by the token in the URL (the invite link and the
// printed sheet's QR both point here). See lib/surveys/guest-survey.ts.

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  RATING_SCALE,
  SURVEY_SECTIONS,
  OPTIONAL_TOURS,
  FREE_TEXT,
  type RatingValue,
} from '@/lib/surveys/guest-survey'

interface TripSnapshot {
  trip_name?: string
  tour_code?: string
  start_date?: string
  end_date?: string
  cities?: string
  client_name?: string
}

export default function GuestSurveyPage() {
  const params = useParams()
  const token = String(params.token)

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [trip, setTrip] = useState<TripSnapshot>({})

  const [ratings, setRatings] = useState<Record<string, RatingValue>>({})
  const [comments, setComments] = useState<Record<string, string>>({})
  const [extras, setExtras] = useState<Record<string, string>>({})
  const [optionalTours, setOptionalTours] = useState<'yes' | 'no' | ''>('')
  const [optionalDetail, setOptionalDetail] = useState('')
  const [additional, setAdditional] = useState('')
  const [guestName, setGuestName] = useState('')

  useEffect(() => {
    let active = true
    fetch(`/api/public/survey/${token}`)
      .then(async r => ({ ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) }))
      .then(({ status, json }) => {
        if (!active) return
        if (status === 404 || !json?.success) {
          setNotFound(true)
          return
        }
        setTrip(json.data.trip ?? {})
        if (json.data.submitted) setSubmitted(true)
      })
      .catch(() => active && setNotFound(true))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [token])

  const submit = useCallback(async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/public/survey/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ratings,
          comments,
          extras,
          optional_tours: optionalTours || undefined,
          optional_tours_detail: optionalDetail || undefined,
          additional_comments: additional || undefined,
          guest_name: guestName || undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!json?.success) throw new Error(json?.error || '送信に失敗しました')
      setSubmitted(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setError(e instanceof Error ? e.message : '送信に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }, [token, ratings, comments, extras, optionalTours, optionalDetail, additional, guestName])

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">読み込み中…</div>
  }
  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center text-gray-600">
        <div>
          <p className="text-lg font-semibold text-gray-900 mb-1">アンケートが見つかりません</p>
          <p className="text-sm">リンクの有効期限が切れているか、URL が正しくない可能性があります。</p>
        </div>
      </div>
    )
  }
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="max-w-md">
          <div className="w-14 h-14 rounded-full bg-[#647C47]/10 text-[#647C47] flex items-center justify-center mx-auto mb-4 text-3xl">✓</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">ご協力誠にありがとうございました。</h1>
          <p className="text-sm text-gray-600">いただいたご意見は、今後のサービス向上に役立ててまいります。</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f6f7f4] pb-28">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="text-center mb-6">
          <p className="text-sm font-semibold text-[#1f3a5f]">All Travel Solutions (ATS)</p>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">アンケートのお願い</h1>
          <p className="text-sm text-[#c05621] font-medium">Guest Questionnaire</p>
        </div>

        <p className="text-sm text-gray-700 leading-relaxed mb-4">
          この度はご旅行にご参加いただき、誠にありがとうございました。今後のサービス向上のため、
          以下のアンケートにご協力くださいますようお願い申し上げます。
        </p>

        {/* Trip info */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 text-sm">
          <h2 className="text-[#1f3a5f] font-bold mb-3">ご旅行情報</h2>
          {trip.trip_name && <Row label="ツアー名／コース名" value={trip.trip_name} />}
          {trip.cities && <Row label="訪問都市" value={trip.cities} />}
          {trip.start_date && <Row label="旅行期間" value={`${trip.start_date}${trip.end_date ? ` 〜 ${trip.end_date}` : ''}`} />}
          <label className="block mt-3">
            <span className="text-gray-500 text-xs">お名前（任意）</span>
            <input
              value={guestName || trip.client_name || ''}
              onChange={e => setGuestName(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-base"
            />
          </label>
        </div>

        {/* Scale legend */}
        <div className="flex flex-wrap gap-1.5 justify-center text-[11px] text-gray-500 mb-6">
          {RATING_SCALE.map(s => (
            <span key={String(s.value)} className="px-2 py-1 bg-white border border-gray-200 rounded">
              <b className="text-gray-800">{s.value === 'na' ? '−' : s.value}</b> {s.ja}
            </span>
          ))}
        </div>

        {/* Sections */}
        {SURVEY_SECTIONS.map(section => (
          <div key={section.id} className="mb-6">
            <h2 className="text-[#c05621] font-bold border-b-2 border-[#c05621]/30 pb-1 mb-3">{section.ja}</h2>
            {section.items.map(item => (
              <div key={item.id} className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
                <p className="font-semibold text-gray-900">{item.ja}</p>
                <p className="text-sm text-gray-600 mt-0.5 mb-3">{item.question_ja}</p>
                {item.extra && (
                  <input
                    placeholder={item.extra.ja}
                    value={extras[item.extra.id] || ''}
                    onChange={e => setExtras(p => ({ ...p, [item.extra!.id]: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-base mb-3"
                  />
                )}
                <div className="grid grid-cols-6 gap-1.5">
                  {RATING_SCALE.map(s => {
                    const on = ratings[item.id] === s.value
                    return (
                      <button
                        key={String(s.value)}
                        type="button"
                        onClick={() => setRatings(p => ({ ...p, [item.id]: s.value }))}
                        aria-pressed={on}
                        className={`py-3 rounded-lg text-base font-bold border transition-colors ${
                          on ? 'bg-[#647C47] text-white border-[#647C47]' : 'bg-white text-gray-700 border-gray-200 active:bg-gray-100'
                        }`}
                      >
                        {s.value === 'na' ? '−' : s.value}
                      </button>
                    )
                  })}
                </div>
                <input
                  placeholder="ご意見・コメント"
                  value={comments[item.id] || ''}
                  onChange={e => setComments(p => ({ ...p, [item.id]: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-base mt-3"
                />
              </div>
            ))}
          </div>
        ))}

        {/* Optional tours */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          <p className="font-semibold text-gray-900">{OPTIONAL_TOURS.ja}</p>
          <p className="text-sm text-gray-600 mt-0.5 mb-3">{OPTIONAL_TOURS.question_ja}</p>
          <div className="flex gap-2">
            {(['yes', 'no'] as const).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setOptionalTours(v)}
                className={`flex-1 py-3 rounded-lg font-bold border ${
                  optionalTours === v ? 'bg-[#647C47] text-white border-[#647C47]' : 'bg-white text-gray-700 border-gray-200'
                }`}
              >
                {v === 'yes' ? 'はい' : 'いいえ'}
              </button>
            ))}
          </div>
          {optionalTours === 'yes' && (
            <input
              placeholder={OPTIONAL_TOURS.detail_ja}
              value={optionalDetail}
              onChange={e => setOptionalDetail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-base mt-3"
            />
          )}
        </div>

        {/* Free text */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          <h2 className="text-[#c05621] font-bold mb-1">{FREE_TEXT.ja}</h2>
          <p className="text-sm text-gray-600 mb-3">{FREE_TEXT.question_ja}</p>
          <textarea
            rows={4}
            value={additional}
            onChange={e => setAdditional(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-base"
          />
        </div>

        {error && <p className="text-red-600 text-sm text-center mb-3">{error}</p>}
      </div>

      {/* Sticky submit */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 p-3">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={submit}
            disabled={submitting}
            className="w-full py-3.5 rounded-xl bg-[#647C47] text-white font-bold text-base disabled:opacity-50 active:bg-[#4f6238]"
          >
            {submitting ? '送信中…' : '送信する'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-1 border-b border-gray-100 last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium text-right">{value}</span>
    </div>
  )
}
