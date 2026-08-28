'use client'

// ============================================
// Options and upgrades, on the traveller's side
// ============================================
// Two things happen here and nothing else: the traveller answers an offer the
// office has priced, or asks for something the office has not thought of.
//
// NEITHER MOVES MONEY. Accepting stops at "accepted" — the office still has to
// secure it before anything is owed — and a request arrives with no price at
// all, because the price is the office's to set. So this page can say what is
// happening without ever having to be careful about what it costs.

import { useCallback, useEffect, useState } from 'react'

type Extra = {
  id: string
  kind: 'addon' | 'upgrade'
  title: string
  description: string | null
  quantity: number
  status: 'requested' | 'offered' | 'accepted' | 'confirmed'
  currency: string | null
  amount: number | null
}

const SYMBOL: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', JPY: '¥', EGP: 'E£' }

const money = (amount: number | null, currency: string | null) => {
  if (amount == null) return null
  const code = (currency || 'EUR').toUpperCase()
  const digits = code === 'JPY' ? 0 : 2
  return `${SYMBOL[code] ?? code + ' '}${amount.toLocaleString('ja-JP', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
}

const STATUS_TEXT: Record<Extra['status'], string> = {
  requested: '担当者が料金を確認しています',
  offered: 'ご検討ください',
  accepted: '手配中です',
  confirmed: 'お手配済みです',
}

export default function ExtrasSection({ token }: { token: string }) {
  const [extras, setExtras] = useState<Extra[]>([])
  const [canRequest, setCanRequest] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [sent, setSent] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/${token}/extras`)
      if (res.ok) {
        const data = await res.json()
        setExtras(data.extras || [])
        setCanRequest(Boolean(data.canRequest))
      }
    } finally {
      setLoaded(true)
    }
  }, [token])
  useEffect(() => { load() }, [load])

  const answer = async (extra: Extra, action: 'accept' | 'decline') => {
    setBusy(extra.id); setError(null)
    try {
      const res = await fetch(`/api/portal/${token}/extras/${extra.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        setError((await res.json().catch(() => ({})))?.error || '送信できませんでした。')
        return
      }
      await load()
    } catch {
      setError('通信エラーが発生しました。')
    } finally {
      setBusy(null)
    }
  }

  // Nothing offered and nothing askable: the section would be an empty heading.
  if (!loaded || (extras.length === 0 && !canRequest)) return null

  return (
    <section className="extras">
      <h2>オプション・アップグレード</h2>

      {extras.length > 0 && (
        <ul className="exlist">
          {extras.map(e => (
            <li key={e.id}>
              <div className="exmain">
                <p className="extitle">
                  {e.title}
                  {e.quantity > 1 && <span className="exqty">× {e.quantity}</span>}
                </p>
                {e.description && <p className="exnote">{e.description}</p>}
                <p className="exstatus">{STATUS_TEXT[e.status]}</p>
              </div>

              <div className="exside">
                {money(e.amount, e.currency) && (
                  <p className="exprice">
                    {money(e.amount, e.currency)}
                    {e.kind === 'upgrade' && <span className="exdiff">差額</span>}
                  </p>
                )}
                {e.status === 'offered' && (
                  <div className="exactions">
                    <button type="button" disabled={busy === e.id} onClick={() => answer(e, 'accept')}>
                      {busy === e.id ? '送信中…' : 'お申し込み'}
                    </button>
                    <button type="button" className="exdecline" disabled={busy === e.id}
                      onClick={() => answer(e, 'decline')}>
                      今回は見送る
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="gateerr">{error}</p>}

      {canRequest && (
        sent ? (
          <p className="crdone">ご依頼を承りました。担当者より料金を含めてご連絡いたします。</p>
        ) : !open ? (
          <button type="button" className="crtoggle" onClick={() => setOpen(true)}>
            ほかにご希望のオプションがある方はこちら
          </button>
        ) : (
          <RequestForm token={token} onSent={async () => { setSent(true); await load() }} onError={setError} />
        )
      )}
    </section>
  )
}

function RequestForm({
  token, onSent, onError,
}: { token: string; onSent: () => void; onError: (m: string | null) => void }) {
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || !title.trim()) return
    setBusy(true); onError(null)
    try {
      const res = await fetch(`/api/portal/${token}/extras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, note }),
      })
      if (!res.ok) {
        onError((await res.json().catch(() => ({})))?.error || '送信できませんでした。')
        return
      }
      onSent()
    } catch {
      onError('通信エラーが発生しました。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="crform" onSubmit={submit}>
      <p className="crlead">
        ご希望の内容をお書きください。料金は担当者が確認のうえご連絡します。
      </p>
      <label htmlFor="ex-title">ご希望のオプション</label>
      <input id="ex-title" value={title} maxLength={200} required
        placeholder="例：ルクソール気球ツアー"
        onChange={e => setTitle(e.target.value)} />
      <label htmlFor="ex-note">ご連絡事項（任意）</label>
      <textarea id="ex-note" value={note} maxLength={1000} rows={2}
        onChange={e => setNote(e.target.value)} />
      <button type="submit" disabled={busy || !title.trim()}>
        {busy ? '送信中…' : '依頼する'}
      </button>
    </form>
  )
}
