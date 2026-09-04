'use client'
// ============================================
// /order — the hosted order form, the customer's door into the intake
// ============================================
// The tour-up.jp inquiry form (お問合せフォーム), served by us: same fields,
// same meaning, but the answers arrive as structured data instead of an
// email, and /api/public/order-form runs the same pipeline the operator's
// paste page runs — client, programme, ONE draft quote. Japanese and
// operator-neutral by design: the visitor is the agency's traveller, not an
// Autoura prospect, and the operator's name lives in org settings, not here.
import { useState } from 'react'
import { Loader2, CheckCircle2, Plus, Trash2 } from 'lucide-react'

const AIRPORTS = ['成田空港', '羽田空港', '関西空港', '中部国際空港', '福岡空港', 'その他・未定']
const PREFECTURES = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
  '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
  '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
  '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
]
const MAX_COMPANIONS = 15

interface Companion { lastNameRomaji: string; firstNameRomaji: string; gender: string; birthDate: string }
const emptyCompanion = (): Companion => ({ lastNameRomaji: '', firstNameRomaji: '', gender: '', birthDate: '' })

const field = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47] outline-none bg-white'
const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
const Req = () => <span className="ml-1 text-xs font-semibold text-red-600">必須</span>

export default function PublicOrderPage() {
  const [f, setF] = useState({
    inquiryType: '申込み', tourCode: '', tourTitle: '',
    departureDate1: '', departureDate2: '', departureAirport: '',
    adults: '2', children7to11: '0', children0to6: '0',
    contactMethod: 'email', email: '', emailConfirm: '', phone: '',
    lastNameKanji: '', firstNameKanji: '', lastNameKana: '', firstNameKana: '',
    gender: '', birthDate: '',
    lastNameRomaji: '', firstNameRomaji: '',
    postalCode: '', prefecture: '', address: '',
    requests: '', website: '',
  })
  const [companions, setCompanions] = useState<Companion[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ reference: string | null } | null>(null)

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF(prev => ({ ...prev, [k]: e.target.value }))
  const setCompanion = (i: number, k: keyof Companion, v: string) =>
    setCompanions(prev => prev.map((c, j) => (j === i ? { ...c, [k]: v } : c)))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (f.email.trim().toLowerCase() !== f.emailConfirm.trim().toLowerCase()) {
      setError('メールアドレスが確認用と一致しません。')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/public/order-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inquiryType: f.inquiryType,
          tourCode: f.tourCode,
          tourTitle: f.tourTitle,
          departureDate1: f.departureDate1,
          departureDate2: f.departureDate2 || undefined,
          departureAirport: f.departureAirport || undefined,
          adults: Number(f.adults),
          children: Number(f.children7to11) + Number(f.children0to6),
          contactMethod: f.contactMethod,
          email: f.email,
          phone: f.phone || undefined,
          lastNameKanji: f.lastNameKanji || undefined,
          firstNameKanji: f.firstNameKanji || undefined,
          lastNameKana: f.lastNameKana || undefined,
          firstNameKana: f.firstNameKana || undefined,
          gender: f.gender || undefined,
          birthDate: f.birthDate || undefined,
          lastNameRomaji: f.lastNameRomaji,
          firstNameRomaji: f.firstNameRomaji,
          postalCode: f.postalCode || undefined,
          prefecture: f.prefecture || undefined,
          address: f.address || undefined,
          requests: f.requests || undefined,
          companions: companions
            .filter(c => c.lastNameRomaji.trim() || c.firstNameRomaji.trim())
            .map(c => ({ ...c, gender: c.gender || undefined, birthDate: c.birthDate || undefined })),
          website: f.website,
        }),
      })
      const j = await res.json()
      if (res.ok && j.success) setDone({ reference: j.reference ?? null })
      else {
        setError(j.error ?? '送信中にエラーが発生しました。時間をおいてお試しください。')
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } catch {
      setError('送信中にエラーが発生しました。通信環境をご確認のうえ、時間をおいてお試しください。')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white rounded-xl border border-gray-200 p-8 text-center space-y-4">
          <CheckCircle2 className="w-12 h-12 text-[#647C47] mx-auto" />
          <h1 className="text-xl font-bold text-gray-900">ご注文を承りました</h1>
          {done.reference && (
            <p className="text-sm text-gray-600">
              受付番号: <span className="font-mono font-semibold text-gray-900">{done.reference}</span>
            </p>
          )}
          <p className="text-sm text-gray-600">
            内容を確認のうえ、担当者よりご連絡いたします。
            <br />
            確認のご連絡が届かない場合は、恐れ入りますがお電話またはメールにてお問合せください。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <form onSubmit={submit} className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">ツアーお申込み・お問合せフォーム</h1>
          <p className="text-sm text-gray-500 mt-2">
            ご希望のツアーコードと内容をご入力ください。<span className="text-red-600 text-xs font-semibold">必須</span> は必ずご入力ください。
          </p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 text-sm">{error}</div>}

        {/* Honeypot — off-screen, never filled by a person. */}
        <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
          <label>
            ウェブサイト
            <input type="text" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} />
          </label>
        </div>

        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 border-b border-gray-100 pb-2">ツアー内容</h2>
          <div>
            <span className={labelCls}>問合せ種別<Req /></span>
            <div className="flex gap-6">
              {['申込み', 'お問合せ'].map(v => (
                <label key={v} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="inquiryType" value={v} checked={f.inquiryType === v} onChange={set('inquiryType')} className="accent-[#647C47]" />
                  {v}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>ツアーコード<Req /></label>
              <input type="text" required value={f.tourCode} onChange={set('tourCode')} placeholder="例: NEK803-ABCR" className={`${field} font-mono`} maxLength={40} />
            </div>
            <div>
              <label className={labelCls}>ツアータイトル</label>
              <input type="text" value={f.tourTitle} onChange={set('tourTitle')} placeholder="例: ナイル川クルーズの旅 8日間" className={field} maxLength={200} />
            </div>
            <div>
              <label className={labelCls}>出発日（第1希望）<Req /></label>
              <input type="date" required value={f.departureDate1} onChange={set('departureDate1')} className={field} />
            </div>
            <div>
              <label className={labelCls}>出発日（第2希望）</label>
              <input type="date" value={f.departureDate2} onChange={set('departureDate2')} className={field} />
            </div>
            <div>
              <label className={labelCls}>出発地</label>
              <select value={f.departureAirport} onChange={set('departureAirport')} className={field}>
                <option value="">選択してください</option>
                {AIRPORTS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div>
            <span className={labelCls}>参加人数<Req /></span>
            <div className="grid grid-cols-3 gap-4">
              {([
                ['adults', '大人（12歳以上）', 1],
                ['children7to11', '子供（7〜11歳）', 0],
                ['children0to6', '子供（0〜6歳）', 0],
              ] as const).map(([key, label, min]) => (
                <div key={key}>
                  <label className="block text-xs text-gray-500 mb-1">{label}</label>
                  <select value={f[key]} onChange={set(key)} className={field}>
                    {Array.from({ length: 16 - min }, (_, i) => i + min).map(n => <option key={n} value={n}>{n}人</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 border-b border-gray-100 pb-2">代表者さまのお名前</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>お名前（漢字）</label>
              <div className="flex gap-2">
                <input type="text" value={f.lastNameKanji} onChange={set('lastNameKanji')} placeholder="姓（例: 山田）" className={field} maxLength={60} />
                <input type="text" value={f.firstNameKanji} onChange={set('firstNameKanji')} placeholder="名（例: 太郎）" className={field} maxLength={60} />
              </div>
            </div>
            <div>
              <label className={labelCls}>お名前（カナ）</label>
              <div className="flex gap-2">
                <input type="text" value={f.lastNameKana} onChange={set('lastNameKana')} placeholder="セイ（例: ヤマダ）" className={field} maxLength={60} />
                <input type="text" value={f.firstNameKana} onChange={set('firstNameKana')} placeholder="メイ（例: タロウ）" className={field} maxLength={60} />
              </div>
            </div>
            <div>
              <label className={labelCls}>お名前（ローマ字・パスポート表記）<Req /></label>
              <div className="flex gap-2">
                <input type="text" required value={f.lastNameRomaji} onChange={e => setF(p => ({ ...p, lastNameRomaji: e.target.value.toUpperCase() }))} placeholder="姓（例: YAMADA）" className={field} maxLength={60} />
                <input type="text" required value={f.firstNameRomaji} onChange={e => setF(p => ({ ...p, firstNameRomaji: e.target.value.toUpperCase() }))} placeholder="名（例: TARO）" className={field} maxLength={60} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>性別</label>
                <select value={f.gender} onChange={set('gender')} className={field}>
                  <option value="">選択しない</option>
                  <option value="male">男</option>
                  <option value="female">女</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>生年月日</label>
                <input type="date" value={f.birthDate} onChange={set('birthDate')} className={field} />
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 border-b border-gray-100 pb-2">ご連絡先</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>メールアドレス<Req /></label>
              <input type="email" required value={f.email} onChange={set('email')} placeholder="例: taro@example.jp" className={field} maxLength={120} />
            </div>
            <div>
              <label className={labelCls}>メールアドレス（確認）<Req /></label>
              <input type="email" required value={f.emailConfirm} onChange={set('emailConfirm')} placeholder="もう一度ご入力ください" className={field} maxLength={120} />
            </div>
            <div>
              <label className={labelCls}>電話番号</label>
              <input type="tel" value={f.phone} onChange={set('phone')} placeholder="例: 090-1234-5678" className={field} maxLength={40} />
            </div>
            <div>
              <span className={labelCls}>希望連絡方法</span>
              <div className="flex gap-6 pt-2">
                {([['email', 'メール'], ['phone', '電話']] as const).map(([v, label]) => (
                  <label key={v} className="flex items-center gap-2 text-sm">
                    <input type="radio" name="contactMethod" value={v} checked={f.contactMethod === v} onChange={set('contactMethod')} className="accent-[#647C47]" />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>郵便番号</label>
              <input type="text" value={f.postalCode} onChange={set('postalCode')} placeholder="例: 150-0001" className={field} maxLength={10} />
            </div>
            <div>
              <label className={labelCls}>都道府県</label>
              <select value={f.prefecture} onChange={set('prefecture')} className={field}>
                <option value="">選択してください</option>
                {PREFECTURES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>市区町村・番地</label>
              <input type="text" value={f.address} onChange={set('address')} placeholder="例: 渋谷区1-2-3" className={field} maxLength={300} />
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-2">
            <h2 className="font-semibold text-gray-900">同行者さま</h2>
            {companions.length < MAX_COMPANIONS && (
              <button type="button" onClick={() => setCompanions(prev => [...prev, emptyCompanion()])} className="flex items-center gap-1 text-sm text-[#647C47] font-medium hover:text-[#4a5c35]">
                <Plus className="w-4 h-4" />追加
              </button>
            )}
          </div>
          {companions.length === 0 && <p className="text-sm text-gray-400">同行者さまがいらっしゃる場合は「追加」を押してご入力ください（最大{MAX_COMPANIONS}名）。</p>}
          {companions.map((c, i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">同行者{i + 1}</p>
                <button type="button" onClick={() => setCompanions(prev => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600" aria-label={`同行者${i + 1}を削除`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex gap-2">
                  <input type="text" required value={c.lastNameRomaji} onChange={e => setCompanion(i, 'lastNameRomaji', e.target.value.toUpperCase())} placeholder="姓（ローマ字）" className={field} maxLength={60} />
                  <input type="text" required value={c.firstNameRomaji} onChange={e => setCompanion(i, 'firstNameRomaji', e.target.value.toUpperCase())} placeholder="名（ローマ字）" className={field} maxLength={60} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select value={c.gender} onChange={e => setCompanion(i, 'gender', e.target.value)} className={field}>
                    <option value="">性別</option>
                    <option value="male">男</option>
                    <option value="female">女</option>
                  </select>
                  <input type="date" value={c.birthDate} onChange={e => setCompanion(i, 'birthDate', e.target.value)} className={field} aria-label={`同行者${i + 1}の生年月日`} />
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-2">
          <h2 className="font-semibold text-gray-900 border-b border-gray-100 pb-2">ご要望・ご質問など</h2>
          <textarea value={f.requests} onChange={set('requests')} rows={5} maxLength={4000} placeholder="部屋のご希望、食事制限、延泊のご相談など、ご自由にご記入ください。" className={field} />
        </section>

        <div className="text-center space-y-3 pb-10">
          <button type="submit" disabled={busy} className="px-10 py-3 bg-[#647C47] text-white rounded-lg font-semibold hover:bg-[#4a5c35] disabled:opacity-50 inline-flex items-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            送信する
          </button>
          <p className="text-xs text-gray-400">送信いただいた内容は、ご旅行の手配とご連絡のためにのみ使用いたします。</p>
        </div>
      </form>
    </div>
  )
}
