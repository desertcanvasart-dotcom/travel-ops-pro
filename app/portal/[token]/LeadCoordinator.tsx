'use client'

// The lead's coordinator panel, inside the portal. Friends mode only, and only
// on the lead's own link. The lead seeds each traveller's name + DOB + contact,
// sends them their private link, and watches who has finished — WITHOUT seeing
// anyone's passport or medical data (the API returns none).

import { useCallback, useEffect, useState } from 'react'

type Traveller = {
  id: string
  firstName: string | null
  lastName: string | null
  dateOfBirth: string | null
  email: string | null
  phone: string | null
  isLead: boolean
  submitted: boolean
  link: { url: string; sentAt: string | null } | null
}

export default function LeadCoordinator({ token }: { token: string }) {
  const [travellers, setTravellers] = useState<Traveller[]>([])
  const [submittedCount, setSubmittedCount] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/portal/${token}/coordinator`)
    if (res.ok) {
      const d = await res.json()
      setTravellers(d.travellers || [])
      setSubmittedCount(d.submittedCount || 0)
    }
    setLoaded(true)
  }, [token])
  useEffect(() => { load() }, [load])

  const act = async (id: string, action: 'send' | 'revoke', fields?: Record<string, string>) => {
    setBusy(id)
    try {
      await fetch(`/api/portal/${token}/coordinator`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, passenger_id: id, ...(fields ? { fields } : {}) }),
      })
      await load()
    } finally { setBusy(null) }
  }

  const seed = async (id: string, field: string, value: string) => {
    await fetch(`/api/portal/${token}/coordinator`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'seed', passenger_id: id, fields: { [field]: value } }),
    })
  }

  const copy = async (url: string, id: string) => {
    try { await navigator.clipboard.writeText(url) } catch {}
    setCopied(id); setTimeout(() => setCopied(c => (c === id ? null : c)), 1500)
  }

  if (!loaded) return null

  return (
    <section className="leadcoord">
      <div className="lchd">
        <h2>ご一行の管理</h2>
        <span className="lccount">{submittedCount} / {travellers.length} 名 登録済み</span>
      </div>
      <p className="lclead">
        ご一緒に参加される方に、お一人ずつの登録リンクをお送りください。お名前と生年月日は本人確認に使用します。
        ご登録内容（パスポート等）はご本人のみが入力でき、ここには表示されません。
      </p>
      <div className="lclist">
        {travellers.map(t => (
          <div key={t.id} className="lcrow">
            <div className="lctop">
              <span className="lcname">
                {[t.lastName, t.firstName].filter(Boolean).join(' ') || '（未入力）'}
                {t.isLead && <em className="lctag">ご本人</em>}
              </span>
              <span className={`lcstatus ${t.submitted ? 'ok' : ''}`}>{t.submitted ? '登録済み' : '未登録'}</span>
            </div>
            {!t.isLead && (
              <>
                <div className="lcfields">
                  <Field label="姓" defaultValue={t.lastName ?? ''} onSave={v => seed(t.id, 'last_name', v)} />
                  <Field label="名" defaultValue={t.firstName ?? ''} onSave={v => seed(t.id, 'first_name', v)} />
                  <Field label="生年月日" type="date" defaultValue={t.dateOfBirth ?? ''} onSave={v => seed(t.id, 'date_of_birth', v)} />
                  <Field label="メール" type="email" defaultValue={t.email ?? ''} onSave={v => seed(t.id, 'email', v)} />
                </div>
                <div className="lcactions">
                  {t.link ? (
                    <>
                      <button type="button" onClick={() => copy(t.link!.url, t.id)}>{copied === t.id ? 'コピーしました' : 'リンクをコピー'}</button>
                      <button type="button" onClick={() => act(t.id, 'send')} disabled={busy === t.id}>{busy === t.id ? '送信中…' : '再送する'}</button>
                      <button type="button" className="lcdanger" onClick={() => act(t.id, 'revoke')} disabled={busy === t.id}>取り消す</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => act(t.id, 'send')} disabled={busy === t.id}>{busy === t.id ? '送信中…' : 'リンクを送る'}</button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function Field({ label, defaultValue, type = 'text', onSave }: { label: string; defaultValue: string; type?: string; onSave: (v: string) => void }) {
  const [value, setValue] = useState(defaultValue)
  return (
    <label className="lcfield">
      <span>{label}</span>
      <input type={type} value={value} onChange={e => setValue(e.target.value)} onBlur={() => { if (value !== defaultValue) onSave(value) }} />
    </label>
  )
}
