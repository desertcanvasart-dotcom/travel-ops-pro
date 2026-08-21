'use client'

// The lead asking to add travellers. Adding people re-prices the trip, so this
// files a request the operator approves — it never changes the party itself.
import { useState } from 'react'

export default function ChangeRequestForm({ token }: { token: string }) {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(1)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/portal/${token}/change-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count, note }),
      })
      if (res.ok) setDone(true)
      else setError((await res.json().catch(() => ({})))?.error || '送信できませんでした。')
    } catch {
      setError('通信エラーが発生しました。')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <section className="changereq">
        <p className="crdone">ご依頼を承りました。担当者より料金を含めてご連絡いたします。</p>
      </section>
    )
  }

  return (
    <section className="changereq">
      {!open ? (
        <button type="button" className="crtoggle" onClick={() => setOpen(true)}>
          参加者を追加したい方はこちら
        </button>
      ) : (
        <form className="crform" onSubmit={submit}>
          <p className="crlead">ご一緒に参加される方を追加できます。料金は担当者が確認のうえご連絡します。</p>
          <label htmlFor="cr-count">追加人数</label>
          <input id="cr-count" type="number" min={1} max={20} value={count}
            onChange={e => setCount(Math.max(1, Number(e.target.value) || 1))} />
          <label htmlFor="cr-note">ご連絡事項（任意）</label>
          <textarea id="cr-note" value={note} maxLength={500} rows={2}
            onChange={e => setNote(e.target.value)} />
          {error && <p className="gateerr">{error}</p>}
          <button type="submit" disabled={busy}>{busy ? '送信中…' : '追加を依頼する'}</button>
        </form>
      )}
    </section>
  )
}
