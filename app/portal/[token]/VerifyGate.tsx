'use client'

// The confirmation gate's form — one field, Japanese-only like the rest of
// the portal. Success reloads the page; the server then sees the cookie and
// renders the booking.

import { useState } from 'react'

export default function VerifyGate({ token, requireDob = false }: { token: string; requireDob?: boolean }) {
  const [answer, setAnswer] = useState('')
  const [dob, setDob] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!answer.trim() || busy || (requireDob && !dob)) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/portal/${token}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requireDob ? { answer, dob } : { answer }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        window.location.reload()
        return
      }
      setError(data.error || '入力内容が予約情報と一致しません。')
    } catch {
      setError('通信エラーが発生しました。時間をおいてもう一度お試しください。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="gateform" onSubmit={submit}>
      <label htmlFor="gate-answer">{requireDob ? 'ご本人の姓' : '予約番号 または 代表者の姓'}</label>
      <input
        id="gate-answer"
        value={answer}
        onChange={e => setAnswer(e.target.value)}
        placeholder={requireDob ? '例：山田' : '例：BKG-2026-0001 ／ 山田'}
        autoComplete="off"
        autoFocus
      />
      {requireDob && (
        <>
          <label htmlFor="gate-dob">生年月日</label>
          <input
            id="gate-dob"
            type="date"
            value={dob}
            onChange={e => setDob(e.target.value)}
            autoComplete="off"
          />
        </>
      )}
      {error && <p className="gateerr">{error}</p>}
      <button type="submit" disabled={busy || !answer.trim()}>
        {busy ? '確認中…' : '確認する'}
      </button>
    </form>
  )
}
