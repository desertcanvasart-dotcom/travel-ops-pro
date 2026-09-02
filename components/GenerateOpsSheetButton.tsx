'use client'
// ============================================
// Operations sheet for one trip — with the office-held facts asked for
// ============================================
// The ENG. ITIN. worksheet the ground company runs the trip from. Its day
// grid and hotel block come from the itinerary; its header carries things
// the itinerary does not hold — file number, group reference, the two guides
// with their mobiles, the flights in and out, rooms, remarks. The route
// accepts every one of those as a query parameter and prints a ruled blank
// for any it is not given.
//
// The button used to be a bare link that passed none of them, so every sheet
// left the office with the same blanks, and the only way to fill one was to
// hand-edit the URL. This asks once, in a small form, and opens the document
// with whatever was typed. Nothing is saved back to the trip: these are
// per-departure operational facts, and the sheet is the place they live.
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { FileText } from 'lucide-react'

interface Props {
  itineraryId: string
  /** Prefills the group reference — the code the ground company files under. */
  itineraryCode?: string | null
}

/** Today on the operator's own calendar, not UTC's. */
function todayLocalISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const EMPTY = {
  file_no: '',
  group_ref: '',
  confirmed_date: '',
  final_date: '',
  rooms: '',
  cairo_guide: '',
  cairo_mobile: '',
  upper_guide: '',
  upper_mobile: '',
  arrival_flight: '',
  departure_flight: '',
  remarks: '',
}

export default function GenerateOpsSheetButton({ itineraryId, itineraryCode }: Props) {
  const t = useTranslations('itineraries.opsSheet')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY, group_ref: itineraryCode ?? '', final_date: todayLocalISO() })

  function generate(format: 'pdf' | 'html') {
    const qs = new URLSearchParams({ itinerary_id: itineraryId, format })
    // Only what was typed travels: the route prints a blank for a missing
    // parameter, and an empty string would print as nothing either way.
    for (const [k, v] of Object.entries(form)) if (v.trim()) qs.set(k, v.trim())
    window.open(`/api/documents/operations-sheet?${qs.toString()}`, '_blank', 'noopener')
    setOpen(false)
  }

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))
  const field = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm'
  const label = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={t('tooltip')}
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
            className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">{t('title')}</h3>
              <p className="text-xs text-gray-500 mt-1">{t('hint')}</p>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>{t('fileNo')}</label>
                  <input value={form.file_no} onChange={set('file_no')} className={field} />
                </div>
                <div>
                  <label className={label}>{t('groupRef')}</label>
                  <input value={form.group_ref} onChange={set('group_ref')} className={field} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={label}>{t('confirmedDate')}</label>
                  <input type="date" value={form.confirmed_date} onChange={set('confirmed_date')} className={field} />
                </div>
                <div>
                  <label className={label}>{t('finalDate')}</label>
                  <input type="date" value={form.final_date} onChange={set('final_date')} className={field} />
                </div>
                <div>
                  <label className={label}>{t('rooms')}</label>
                  <input type="number" min="0" value={form.rooms} onChange={set('rooms')} className={field} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>{t('cairoGuide')}</label>
                  <input value={form.cairo_guide} onChange={set('cairo_guide')} className={field} />
                </div>
                <div>
                  <label className={label}>{t('mobile')}</label>
                  <input value={form.cairo_mobile} onChange={set('cairo_mobile')} className={field} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>{t('upperGuide')}</label>
                  <input value={form.upper_guide} onChange={set('upper_guide')} className={field} />
                </div>
                <div>
                  <label className={label}>{t('mobile')}</label>
                  <input value={form.upper_mobile} onChange={set('upper_mobile')} className={field} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>{t('flightIn')}</label>
                  <input value={form.arrival_flight} onChange={set('arrival_flight')} className={field} placeholder="MS 965 03NOV" />
                </div>
                <div>
                  <label className={label}>{t('flightOut')}</label>
                  <input value={form.departure_flight} onChange={set('departure_flight')} className={field} placeholder="MS 964 11NOV" />
                </div>
              </div>
              <div>
                <label className={label}>{t('remarks')}</label>
                <textarea value={form.remarks} onChange={set('remarks')} className={field} rows={2} />
              </div>
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-gray-200">
              <button
                onClick={() => generate('pdf')}
                className="flex-1 px-4 py-2 bg-[#647C47] text-white rounded-lg text-sm font-medium hover:bg-[#4a5c35]"
              >
                {t('pdf')}
              </button>
              <button
                onClick={() => generate('html')}
                className="flex-1 px-4 py-2 border border-[#647C47] text-[#647C47] rounded-lg text-sm font-medium hover:bg-[#647C47]/10"
              >
                {t('preview')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
