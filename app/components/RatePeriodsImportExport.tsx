'use client'

// ============================================
// Rate periods as a spreadsheet
// ============================================
// The wide rate CSV next to this one has fixed columns for three seasons, so a
// six-period contract cannot go through it. This sheet is one row per dated
// period — the shape a supplier's rate table already has — with as many rows
// per hotel or ship as the contract needs.
//
// Importing REPLACES each named rate's periods. That is the honest semantic
// for a contract, and it is also destructive, so the preview says exactly
// which rates change and from how many periods to how many BEFORE anything is
// written. Nobody should discover a replaced rate card afterwards.

import { useRef, useState } from 'react'
import { Download, Upload, X, Loader2, AlertCircle, CheckCircle, CalendarRange } from 'lucide-react'

type Entity = 'accommodation' | 'cruise'
type Change = { key: string; name: string; before: number; after: number }
type RowError = { row: number; key: string; message: string }

type Step = 'idle' | 'previewing' | 'preview' | 'importing' | 'done' | 'error'

export default function RatePeriodsImportExport({ entity }: { entity: Entity }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = useState(false)
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('idle')
  const [csv, setCsv] = useState('')
  const [fileName, setFileName] = useState('')
  const [changes, setChanges] = useState<Change[]>([])
  const [errors, setErrors] = useState<RowError[]>([])
  const [message, setMessage] = useState('')
  const [updated, setUpdated] = useState(0)

  const noun = entity === 'accommodation' ? 'hotel' : 'cruise'

  const doExport = async () => {
    setExporting(true)
    try {
      const res = await fetch(`/api/rates/bulk/periods/export?entity=${entity}`)
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${entity}-rate-periods.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  const reset = () => {
    setStep('idle'); setCsv(''); setFileName(''); setChanges([]); setErrors([]); setMessage(''); setUpdated(0)
    if (fileRef.current) fileRef.current.value = ''
  }

  const send = async (dryRun: boolean, text = csv) => {
    const res = await fetch('/api/rates/bulk/periods/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity, csv: text, dryRun }),
    })
    return { ok: res.ok, json: await res.json().catch(() => ({})) }
  }

  const onFile = async (file: File) => {
    const text = await file.text()
    setCsv(text); setFileName(file.name); setStep('previewing')
    const { json } = await send(true, text)
    setChanges(json.changes ?? [])
    setErrors(json.errors ?? [])
    if (json.error && !json.changes) { setMessage(json.error); setStep('error'); return }
    setStep('preview')
  }

  const confirmImport = async () => {
    setStep('importing')
    const { json } = await send(false)
    setUpdated(json.updated ?? 0)
    setErrors(json.errors ?? [])
    setStep(json.success || (json.updated ?? 0) > 0 ? 'done' : 'error')
    if (!json.success && !json.updated) setMessage(json.error || 'Import failed')
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={doExport}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Export Periods
        </button>
        <button
          type="button"
          onClick={() => { reset(); setOpen(true) }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <Upload className="w-4 h-4" />
          Import Periods
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <CalendarRange className="w-4 h-4 text-[#647C47]" />
                Import rate periods
              </h3>
              <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {step === 'idle' && (
                <>
                  <p className="text-sm text-gray-600">
                    One row per dated period, as many rows per {noun} as the contract has.
                    Export first to get the exact columns and today&apos;s periods.
                  </p>
                  <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-3">
                    Importing <strong>replaces</strong> the periods of every {noun} named in the file.
                    {' '}{noun === 'hotel' ? 'Hotels' : 'Cruises'} not in the file are left alone.
                    You&apos;ll see exactly what changes before anything is written.
                  </p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }}
                    className="block w-full text-sm"
                  />
                </>
              )}

              {(step === 'previewing' || step === 'importing') && (
                <div className="flex items-center gap-2 text-sm text-gray-600 p-4">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {step === 'previewing' ? 'Checking the file…' : 'Applying…'}
                </div>
              )}

              {step === 'preview' && (
                <>
                  <p className="text-sm text-gray-600">{fileName}</p>
                  {changes.length > 0 && (
                    <div className="border rounded-lg divide-y">
                      {changes.map(c => (
                        <div key={c.key} className="flex items-center justify-between px-3 py-2 text-sm">
                          <span className="font-medium">{c.name}</span>
                          <span className="text-gray-600">
                            {c.before} → <strong>{c.after}</strong> period{c.after === 1 ? '' : 's'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {errors.length > 0 && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="text-sm font-medium text-red-700 mb-1">
                        {errors.length} row{errors.length === 1 ? '' : 's'} cannot be imported:
                      </div>
                      {errors.slice(0, 8).map((e, i) => (
                        <div key={i} className="text-xs text-red-600">
                          {e.row > 0 ? `Row ${e.row}: ` : ''}{e.message}
                        </div>
                      ))}
                      {errors.length > 8 && (
                        <div className="text-xs text-red-500 mt-1">…and {errors.length - 8} more</div>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2 justify-end pt-2">
                    <button type="button" onClick={reset} className="px-3 py-1.5 text-sm border rounded-lg">
                      Choose another file
                    </button>
                    <button
                      type="button"
                      onClick={confirmImport}
                      disabled={changes.length === 0}
                      className="px-3 py-1.5 text-sm rounded-lg bg-[#647C47] text-white disabled:opacity-50"
                    >
                      Replace periods on {changes.length} {noun}{changes.length === 1 ? '' : 's'}
                    </button>
                  </div>
                </>
              )}

              {step === 'done' && (
                <>
                  <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span className="text-sm text-green-700">
                      Periods replaced on {updated} {noun}{updated === 1 ? '' : 's'}.
                    </span>
                  </div>
                  {errors.length > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      {errors.slice(0, 5).map((e, i) => (
                        <div key={i} className="text-xs text-amber-700">{e.message}</div>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button type="button" onClick={() => { setOpen(false); window.location.reload() }}
                      className="px-3 py-1.5 text-sm rounded-lg bg-[#647C47] text-white">
                      Done
                    </button>
                  </div>
                </>
              )}

              {step === 'error' && (
                <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                  <span className="text-sm text-red-700">{message || 'Import failed'}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
