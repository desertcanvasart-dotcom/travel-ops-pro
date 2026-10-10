'use client'

// The confirmation gate's form — Japanese-only like the rest of the portal. A
// per-traveller link asks for family name + DOB and, when the traveller has an
// email, the one-time code sent there. Success reloads the page; the server then sees the cookie and
// renders the booking.

import { useState } from 'react'

export default function VerifyGate({ token, requireDob = false, requireCode = false }: { token: string; requireDob?: boolean; requireCode?: boolean }) {
  const [answer, setAnswer] = useState('')
  const [dob, setDob] = useState('')
  const [code, setCode] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  // The code is emailed only to the traveller; it never comes back here.
  const resendCode = async () => {
    if (sending) return
    setSending(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/portal/${token}/verify-code`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) setNotice(data.message || '確認コードをお送りしました。')
      else setError(data.error || '確認コードを送信できませんでした。')
    } catch {
      setError('通信エラーが発生しました。時間をおいてもう一度お試しください。')
    } finally {
      setSending(false)
    }
  }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!answer.trim() || busy || (requireDob && !dob) || (requireCode && !code.trim())) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/portal/${token}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requireDob ? { answer, dob, ...(requireCode ? { code } : {}) } : { answer }),
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
      {requireCode && (
        <>
          <label htmlFor="gate-code">確認コード（メールでお送りした6桁の数字）</label>
          <input
            id="gate-code"
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="例：123456"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={12}
          />
          <button type="button" className="gatelink" onClick={resendCode} disabled={sending}>
            {sending ? '送信中…' : '確認コードを再送する'}
          </button>
        </>
      )}
      {notice && <p className="gatenote">{notice}</p>}
      {error && <p className="gateerr">{error}</p>}
      <button type="submit" disabled={busy || !answer.trim() || (requireCode && !code.trim())}>
        {busy ? '確認中…' : '確認する'}
      </button>
    </form>
  )
}
