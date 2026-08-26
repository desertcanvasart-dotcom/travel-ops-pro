'use client'

// ============================================
// The traveller attaching their passport page and any other documents asked for
// ============================================
// Details about the passport were always typed; the page itself arrived by
// email or LINE and lived in somebody's inbox. This puts it on the booking.
//
// Two slots, deliberately different. パスポート is ONE document that replaces
// itself — a traveller has one passport, and a list of five files called
// "passport" helps nobody. その他の書類 is a list, capped, each with a label the
// traveller writes, because what gets asked for varies per trip.
//
// The upload is refused client-side for size and type before a byte leaves the
// device, purely so the traveller learns immediately. The server checks the
// same things again, and sniffs the real bytes, because this check can be
// skipped and that one cannot.

import { useEffect, useRef, useState } from 'react'
import {
  ALLOWED_TYPES,
  MAX_DOCUMENT_BYTES,
  MAX_OTHER_DOCUMENTS,
} from '@/lib/portal/traveller-documents'

interface DocumentRow {
  id: string
  kind: 'passport' | 'other'
  label: string | null
  filename: string | null
  sizeBytes: number
  uploadedAt: string
}

interface Props {
  token: string
  passengerId: string
  locked: boolean
}

const ACCEPT = ALLOWED_TYPES.join(',')

const prettySize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`

const prettyDate = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

export default function TravellerDocuments({ token, passengerId, locked }: Props) {
  const [docs, setDocs] = useState<DocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [otherLabel, setOtherLabel] = useState('')
  const passportInput = useRef<HTMLInputElement>(null)
  const otherInput = useRef<HTMLInputElement>(null)

  const base = `/api/portal/${token}/travellers/${passengerId}/documents`

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(base)
        const json = await res.json().catch(() => ({}))
        if (!cancelled && res.ok) setDocs(json.documents ?? [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [base])

  const passport = docs.find(d => d.kind === 'passport') ?? null
  const others = docs.filter(d => d.kind === 'other')

  const upload = async (file: File, kind: 'passport' | 'other') => {
    setError(null)

    // Checked again on the server; this is only so the traveller is told now
    // rather than after uploading several megabytes over mobile data.
    if (file.size > MAX_DOCUMENT_BYTES) {
      setError('ファイルサイズが大きすぎます（上限10MB）。')
      return
    }
    if (file.type && !ALLOWED_TYPES.includes(file.type)) {
      setError('この形式には対応していません。PDF・JPEG・PNG・WEBP・HEICをご利用ください。')
      return
    }

    setBusy(kind)
    try {
      const body = new FormData()
      body.append('file', file)
      body.append('kind', kind)
      if (kind === 'other' && otherLabel.trim()) body.append('label', otherLabel.trim())

      const res = await fetch(base, { method: 'POST', body })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error || 'アップロードに失敗しました。')
        return
      }
      setDocs(prev => {
        // A new passport replaces the old row rather than joining it.
        const kept = kind === 'passport' ? prev.filter(d => d.kind !== 'passport') : prev
        return [...kept, json.document as DocumentRow]
      })
      if (kind === 'other') setOtherLabel('')
    } catch {
      setError('アップロードに失敗しました。通信状況をご確認ください。')
    } finally {
      setBusy(null)
      if (passportInput.current) passportInput.current.value = ''
      if (otherInput.current) otherInput.current.value = ''
    }
  }

  const remove = async (doc: DocumentRow) => {
    setError(null)
    setBusy(doc.id)
    try {
      const res = await fetch(`${base}/${doc.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(json.error || '削除に失敗しました。')
        return
      }
      setDocs(prev => prev.filter(d => d.id !== doc.id))
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <p className="hint">書類を読み込んでいます…</p>

  return (
    <div className="docs">
      <p className="hint">
        パスポートの顔写真ページを撮影またはスキャンしてご添付ください。
        ご旅行終了後に削除いたします。（PDF・JPEG・PNG・WEBP・HEIC／1ファイル10MBまで）
      </p>

      {error && <p className="docs-error" role="alert">{error}</p>}

      <h5>パスポート（顔写真ページ）</h5>
      {passport ? (
        <div className="doc-row">
          <span className="doc-name">{passport.filename || 'パスポート'}</span>
          <span className="doc-meta">
            {prettySize(passport.sizeBytes)}・{prettyDate(passport.uploadedAt)} 添付
          </span>
          {!locked && (
            <button type="button" onClick={() => remove(passport)} disabled={busy === passport.id}>
              削除
            </button>
          )}
        </div>
      ) : (
        <p className="hint">まだ添付されていません。</p>
      )}
      {!locked && (
        <input
          ref={passportInput}
          type="file"
          accept={ACCEPT}
          disabled={busy !== null}
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f, 'passport') }}
        />
      )}
      {passport && !locked && <p className="hint">新しく添付すると、現在のファイルと差し替わります。</p>}

      <h5>その他の書類</h5>
      {others.length === 0 && <p className="hint">まだ添付されていません。</p>}
      {others.map(doc => (
        <div className="doc-row" key={doc.id}>
          <span className="doc-name">{doc.label || doc.filename || '書類'}</span>
          <span className="doc-meta">
            {prettySize(doc.sizeBytes)}・{prettyDate(doc.uploadedAt)} 添付
          </span>
          {!locked && (
            <button type="button" onClick={() => remove(doc)} disabled={busy === doc.id}>
              削除
            </button>
          )}
        </div>
      ))}
      {!locked && others.length < MAX_OTHER_DOCUMENTS && (
        <div className="doc-add">
          <label className="f">
            <span>書類の名称（任意）</span>
            <input
              type="text"
              value={otherLabel}
              maxLength={120}
              placeholder="例：査証申請書"
              onChange={e => setOtherLabel(e.target.value)}
            />
          </label>
          <input
            ref={otherInput}
            type="file"
            accept={ACCEPT}
            disabled={busy !== null}
            onChange={e => { const f = e.target.files?.[0]; if (f) upload(f, 'other') }}
          />
        </div>
      )}
      {!locked && others.length >= MAX_OTHER_DOCUMENTS && (
        <p className="hint">添付できる書類は{MAX_OTHER_DOCUMENTS}件までです。</p>
      )}

      {busy && <p className="hint">送信中です…</p>}
    </div>
  )
}
