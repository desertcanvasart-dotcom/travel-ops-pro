'use client'
// Import CSV / Sample CSV for the supplier roster — the pair every rates
// page has. Sample gives the sheet; Import checks the file first (what would
// be added, what is already on file, what is wrong and on which line) and
// writes only when the operator confirms. An existing supplier is never
// rewritten by an import.
import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Upload, FileText, Loader2, X } from 'lucide-react'

interface Preview {
  totalRows: number
  ready: number
  readyNames: string[]
  alreadyOnFile: { line: number; name: string }[]
  errors: { line: number; name: string; message: string }[]
  exampleRowsSkipped: number
  inserted?: number
  insertErrors?: { name: string; message: string }[]
}

export default function SupplierImportExport({ onImported }: { onImported: () => void }) {
  const t = useTranslations('suppliers.import')
  const fileRef = useRef<HTMLInputElement>(null)
  const [csv, setCsv] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)

  const btn = 'inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50'

  const sample = () => { window.location.href = '/api/suppliers/import?template=1' }

  const check = async (text: string) => {
    setBusy(true); setError(null); setDone(null)
    try {
      const res = await fetch('/api/suppliers/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csvData: text, dryRun: true }) })
      const j = await res.json()
      if (!j.success) throw new Error(j.error || 'Import failed')
      setCsv(text); setPreview(j)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    const r = new FileReader()
    r.onload = () => check(String(r.result ?? ''))
    r.readAsText(f)
  }

  const confirm = async () => {
    if (!csv) return
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/suppliers/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csvData: csv, dryRun: false }) })
      const j = await res.json()
      if (!j.success) throw new Error(j.error || 'Import failed')
      setDone(j); setPreview(null); setCsv(null); onImported()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  const close = () => { setPreview(null); setCsv(null); setDone(null); setError(null) }

  return (
    <>
      <button type="button" onClick={sample} className={btn} title={t('sampleHint')}>
        <FileText className="w-4 h-4" /> {t('sample')}
      </button>
      <button type="button" onClick={() => fileRef.current?.click()} className={btn} disabled={busy}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {t('import')}
      </button>
      <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} data-testid="supplier-csv-input" />

      {(preview || done || error) && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={close}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">{done ? t('doneTitle') : t('previewTitle')}</h3>
              <button type="button" onClick={close} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3 text-sm">
              {error && <p className="text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
              {done && (
                <p className="text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  {t('inserted', { count: done.inserted ?? 0 })}
                </p>
              )}
              {(preview || done) && (() => {
                const p = (preview ?? done)!
                return (
                  <>
                    {!done && <p className="text-gray-700">{t('willAdd', { count: p.ready, total: p.totalRows })}</p>}
                    {!done && p.readyNames.length > 0 && (
                      <p className="text-xs text-gray-500">{p.readyNames.slice(0, 12).join(', ')}{p.readyNames.length > 12 ? '…' : ''}</p>
                    )}
                    {p.alreadyOnFile.length > 0 && (
                      <div className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <p className="font-medium">{t('alreadyOnFile', { count: p.alreadyOnFile.length })}</p>
                        <p className="text-xs mt-1">{p.alreadyOnFile.map(a => a.name).join(', ')}</p>
                      </div>
                    )}
                    {p.errors.length > 0 && (
                      <div className="text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        <p className="font-medium">{t('rowsWithErrors', { count: p.errors.length })}</p>
                        <ul className="text-xs mt-1 space-y-0.5">
                          {p.errors.slice(0, 20).map((e, i) => <li key={i}>{t('line', { line: e.line })}{e.name ? ` ${e.name}` : ''}: {e.message}</li>)}
                        </ul>
                      </div>
                    )}
                    {(p.insertErrors?.length ?? 0) > 0 && (
                      <div className="text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        <p className="font-medium">{t('notInserted', { count: p.insertErrors!.length })}</p>
                        <ul className="text-xs mt-1">{p.insertErrors!.map((e, i) => <li key={i}>{e.name}: {e.message}</li>)}</ul>
                      </div>
                    )}
                    {p.exampleRowsSkipped > 0 && <p className="text-xs text-gray-500">{t('exampleSkipped')}</p>}
                  </>
                )
              })()}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
              <button type="button" onClick={close} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">{done ? t('close') : t('cancel')}</button>
              {preview && preview.ready > 0 && (
                <button type="button" onClick={confirm} disabled={busy} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
                  {busy ? t('importing') : t('confirm', { count: preview.ready })}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
