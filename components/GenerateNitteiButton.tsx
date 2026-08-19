'use client'

// ============================================
// 日程表 for one customer's trip
// ============================================
// The office's Japanese daily itinerary, generated from the trip rather than
// retyped into a dialog. The programme supplies the day-by-day text; the trip
// supplies who is travelling and when they leave.
//
// A trip has to be told which programme it follows once — itineraries are also
// built from scratch, so the link cannot be inferred. That choice is saved back
// to the trip, so it is asked for once and not on every generation.
//
// Everything else is prefilled from the record and stays editable: what is in
// the boxes is what prints, so a correction never needs the trip edited first.

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { FileText, Loader2 } from 'lucide-react'

interface Programme {
  id: string
  template_code: string
  template_name: string
}

interface Props {
  itineraryId: string
  clientName: string
  startDate: string
  /** The programme already linked to this trip, if any. */
  templateId?: string | null
  /** Called after the link is saved so the parent can refresh its copy. */
  onLinked?: (templateId: string) => void
}

/** Most template_names already open with the code ("NEK502-LND — 5 days: …"),
 *  so prefixing it again reads as a stutter. Prefix only when it is missing. */
function programmeLabel(p: Programme): string {
  const name = (p.template_name ?? '').trim()
  const code = (p.template_code ?? '').trim()
  if (!name) return code
  return name.startsWith(code) ? name : `${code} — ${name}`
}

/** Today on the operator's own calendar. Built from local parts — toISOString()
 *  returns UTC, which names yesterday for part of every evening east of it. */
function todayLocalISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function GenerateNitteiButton({
  itineraryId,
  clientName,
  startDate,
  templateId,
  onLinked,
}: Props) {
  const t = useTranslations('itineraries.nittei')
  const [open, setOpen] = useState(false)
  const [programmes, setProgrammes] = useState<Programme[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    template_id: templateId ?? '',
    customer_name: clientName ?? '',
    departure_date: (startDate ?? '').slice(0, 10),
    cairo_guide: '',
    south_guide: '',
    author: '',
    created_date: todayLocalISO(),
  })

  // The programme list is only needed once the dialog is open — a trip page
  // should not pay for it on every view.
  useEffect(() => {
    if (!open || programmes.length) return
    let cancelled = false
    setLoading(true)
    fetch('/api/tours/templates?is_active=true')
      .then(r => r.json())
      .then(j => {
        if (cancelled) return
        // The route answers { success, data, count } — NOT { templates }.
        const list = Array.isArray(j?.data) ? j.data : []
        setProgrammes(list)
        if (!list.length) setError(t('loadFailed'))
      })
      .catch(() => !cancelled && setError(t('loadFailed')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [open, programmes.length, t])

  // Persist the programme choice before opening the document, so the next
  // generation does not ask again. A failure to save is not a reason to
  // withhold the document — it is reported and generation continues.
  async function generate(format: 'pdf' | 'print') {
    if (!form.template_id) {
      setError(t('pickProgramme'))
      return
    }
    setError(null)
    if (form.template_id !== templateId) {
      setSaving(true)
      try {
        const res = await fetch(`/api/itineraries/${itineraryId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ template_id: form.template_id }),
        })
        if (!res.ok) setError(t('linkNotSaved'))
        else onLinked?.(form.template_id)
      } catch {
        setError(t('linkNotSaved'))
      } finally {
        setSaving(false)
      }
    }

    const qs = new URLSearchParams({ itinerary_id: itineraryId })
    if (form.customer_name) qs.set('customer_name', form.customer_name)
    if (form.departure_date) qs.set('departure_date', form.departure_date)
    if (form.cairo_guide) qs.set('cairo_guide', form.cairo_guide)
    if (form.south_guide) qs.set('south_guide', form.south_guide)
    if (form.author) qs.set('author', form.author)
    if (form.created_date) qs.set('created_date', form.created_date)
    qs.set('format', format === 'pdf' ? 'pdf' : 'html')
    if (format === 'print') qs.set('print', '1')
    window.open(`/api/documents/program-itinerary?${qs.toString()}`, '_blank', 'noopener')
  }

  const field = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm'
  const label = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="h-10 px-4 bg-[#647C47] text-white rounded-md hover:bg-[#4a5c35] text-sm font-medium flex items-center gap-2"
      >
        <FileText className="w-4 h-4" />
        {t('button')}
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">{t('title')}</h3>
              <p className="text-xs text-gray-500 mt-1">{t('hint')}</p>
            </div>

            <div className="p-5 space-y-3">
              <div>
                <label className={label}>{t('programme')}</label>
                {loading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('loading')}
                  </div>
                ) : (
                  <select
                    value={form.template_id}
                    onChange={e => setForm(p => ({ ...p, template_id: e.target.value }))}
                    className={field}
                  >
                    <option value="">{t('pickProgramme')}</option>
                    {programmes.map(p => (
                      <option key={p.id} value={p.id}>
                        {programmeLabel(p)}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className={label}>{t('customerName')}</label>
                <input
                  value={form.customer_name}
                  onChange={e => setForm(p => ({ ...p, customer_name: e.target.value }))}
                  className={field}
                />
              </div>

              <div>
                <label className={label}>{t('departureDate')}</label>
                <input
                  type="date"
                  value={form.departure_date}
                  onChange={e => setForm(p => ({ ...p, departure_date: e.target.value }))}
                  className={field}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>{t('cairoGuide')}</label>
                  <input
                    value={form.cairo_guide}
                    onChange={e => setForm(p => ({ ...p, cairo_guide: e.target.value }))}
                    className={field}
                  />
                </div>
                <div>
                  <label className={label}>{t('southGuide')}</label>
                  <input
                    value={form.south_guide}
                    onChange={e => setForm(p => ({ ...p, south_guide: e.target.value }))}
                    className={field}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>{t('author')}</label>
                  <input
                    value={form.author}
                    onChange={e => setForm(p => ({ ...p, author: e.target.value }))}
                    className={field}
                  />
                </div>
                <div>
                  <label className={label}>{t('created')}</label>
                  <input
                    type="date"
                    value={form.created_date}
                    onChange={e => setForm(p => ({ ...p, created_date: e.target.value }))}
                    className={field}
                  />
                </div>
              </div>

              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>

            <div className="flex gap-2 px-5 py-4 border-t border-gray-200">
              <button
                onClick={() => generate('pdf')}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-[#647C47] text-white rounded-lg text-sm font-medium hover:bg-[#4a5c35] disabled:opacity-50"
              >
                {saving ? t('saving') : t('pdf')}
              </button>
              <button
                onClick={() => generate('print')}
                disabled={saving}
                className="flex-1 px-4 py-2 border border-[#647C47] text-[#647C47] rounded-lg text-sm font-medium hover:bg-[#647C47]/10 disabled:opacity-50"
              >
                {t('print')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
