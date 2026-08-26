'use client'

// ============================================
// Traveller documents on the booking page
// ============================================
// What each traveller has attached from the portal. The list is metadata only:
// opening a document is a deliberate click that fetches a short-lived signed
// URL, because the bucket is private and a passport scan should not be sitting
// in a page's markup or a proxy log.
//
// The retention date is shown on every row. The operator should be able to see
// that a scan disappears next Tuesday BEFORE it does — a purge that surprises
// someone reads as data loss, and this is the one feature where "where did it
// go?" must always have an answer.

import { useCallback, useEffect, useState } from 'react'
import { Loader2, FileText, Trash2, ShieldCheck, Clock } from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'

type Doc = {
  id: string
  kind: 'passport' | 'other'
  label: string | null
  filename: string | null
  sizeBytes: number
  uploadedAt: string
  uploadedVia: string
  purgeAfter: string | null
  purgedAt: string | null
}

type Traveller = { id: string; name: string | null; isLead: boolean; documents: Doc[] }

const prettySize = (b: number) =>
  b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`

const day = (iso: string | null) => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString()
}

export default function TravellerDocumentsPanel({ bookingId }: { bookingId: string }) {
  const [travellers, setTravellers] = useState<Traveller[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const { confirmDelete } = useConfirmDialog()

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/bookings/${bookingId}/passenger-documents`)
      if (res.status === 403) { setForbidden(true); return }
      if (!res.ok) return
      const json = await res.json()
      setTravellers(json.travellers ?? [])
    } finally {
      setLoading(false)
    }
  }, [bookingId])

  useEffect(() => { load() }, [load])

  const remove = async (doc: Doc, who: string) => {
    // Say what is actually destroyed. "Are you sure?" tells nobody anything.
    const what = doc.kind === 'passport' ? 'passport scan' : (doc.label || 'document')
    const ok = await confirmDelete(
      what,
      `The ${what} for ${who} will be permanently deleted. The traveller's typed passport details are not affected.`
    )
    if (!ok) return
    setBusy(doc.id)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/passenger-documents/${doc.id}`, { method: 'DELETE' })
      if (res.ok) await load()
    } finally {
      setBusy(null)
    }
  }

  // Nothing uploaded and nothing to say: stay out of the way. An empty panel on
  // every booking is noise on the bookings that never collect documents.
  if (forbidden) return null
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-4 mb-6 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading traveller documents…
      </div>
    )
  }
  const anyDocs = (travellers ?? []).some(t => t.documents.length > 0)
  if (!anyDocs) return null

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
      <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-1">
        <ShieldCheck className="w-4 h-4 text-[#647C47]" />
        Traveller documents
      </h3>
      <p className="text-xs text-gray-500 mb-3">
        Uploaded by travellers through their portal link. Stored privately and deleted
        automatically after the trip ends.
      </p>

      <div className="space-y-3">
        {(travellers ?? []).filter(t => t.documents.length > 0).map(t => (
          <div key={t.id}>
            <p className="text-xs font-medium text-gray-700 mb-1">
              {t.name || 'Traveller'}{t.isLead ? ' (lead)' : ''}
            </p>
            <div className="space-y-1">
              {t.documents.map(doc => {
                const purged = Boolean(doc.purgedAt)
                return (
                  <div
                    key={doc.id}
                    className={`flex flex-wrap items-center gap-2 px-3 py-2 rounded border text-sm ${
                      purged ? 'bg-gray-50 border-gray-200 text-gray-500' : 'bg-white border-gray-200'
                    }`}
                  >
                    <FileText className="w-4 h-4 shrink-0 text-gray-400" />
                    <span className="font-medium">
                      {doc.kind === 'passport' ? 'Passport' : (doc.label || doc.filename || 'Document')}
                    </span>
                    <span className="text-xs text-gray-500">{prettySize(doc.sizeBytes)}</span>

                    {purged ? (
                      <span className="text-xs italic">
                        deleted {day(doc.purgedAt)} under the retention policy
                      </span>
                    ) : (
                      <>
                        {doc.purgeAfter && (
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            deletes {day(doc.purgeAfter)}
                          </span>
                        )}
                        <a
                          href={`/api/bookings/${bookingId}/passenger-documents/${doc.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-auto text-xs font-medium text-[#647C47] hover:underline"
                        >
                          Open
                        </a>
                        <button
                          type="button"
                          onClick={() => remove(doc, t.name || 'this traveller')}
                          disabled={busy === doc.id}
                          className="text-gray-400 hover:text-red-600 disabled:opacity-50"
                          aria-label="Delete document"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
