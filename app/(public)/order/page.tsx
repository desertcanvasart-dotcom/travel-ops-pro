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
//
// Opened from the agency website's own buttons (2026-11-15), it is told
// which tour by the link — the same values the website's buttons always
// carried:
//   /order?id=<page id>&dt=<unix, JST midnight>   a programme on its date
//   /order?opt=<page id>                           an optional tour → the cart
// The tour's code, title and fares come from the website page
// (/api/public/website-page); the customer types none of it. Optional tours
// collect in a cart kept in this browser (the website's own cart was on
// T-UP), each line its own date and party; the customer goes back to the
// website's list to add another. The submit reads the page again on the
// server — nothing priced here is trusted.
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
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

const MAX_CART = 10
const CART_KEY = 'order-optional-cart'

interface Companion { lastNameRomaji: string; firstNameRomaji: string; gender: string; birthDate: string }

/** What the website page says (GET /api/public/website-page). */
interface PageInfo {
  found: boolean
  pageId?: string
  code?: string
  title?: string | null
  withdrawn?: boolean
  fares?: Record<string, number>
  adultJpy?: number
  childJpy?: number
  childPercent?: number
  infantJpy?: number
  listUrl?: string | null
}

/** One optional tour in the cart. */
interface CartLine {
  pageId: string
  code: string
  title: string
  adultJpy?: number
  childJpy?: number
  date: string
  adults: number
  children: number
  infants: number
}

const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`

/** The calendar's dt (unix seconds, midnight in Japan) as YYYY-MM-DD. */
function jstDate(dt: string | null): string {
  if (!dt || !/^\d{9,11}$/.test(dt)) return ''
  return new Date((Number(dt) + 9 * 3600) * 1000).toISOString().slice(0, 10)
}

const pageIdOf = (v: string | null) => (v && /^\d{1,10}$/.test(v) ? v : null)

async function lookUp(kind: 'tour' | 'optional', id: string): Promise<PageInfo> {
  try {
    const r = await fetch(`/api/public/website-page?kind=${kind}&id=${id}`)
    return r.ok ? ((await r.json()) as PageInfo) : { found: false }
  } catch {
    return { found: false }
  }
}

// Browser storage can be missing or refuse (private window): the cart then
// lives only as long as the page.
function readCart(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(CART_KEY)
    const v = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(v) ? (v as CartLine[]).filter(l => l && typeof l.pageId === 'string').slice(0, MAX_CART) : []
  } catch {
    return []
  }
}
function writeCart(lines: CartLine[]) {
  try {
    if (lines.length) window.localStorage.setItem(CART_KEY, JSON.stringify(lines))
    else window.localStorage.removeItem(CART_KEY)
  } catch { /* storage unavailable: the cart is this page's only */ }
}
const emptyCompanion = (): Companion => ({ lastNameRomaji: '', firstNameRomaji: '', gender: '', birthDate: '' })

const field = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47] outline-none bg-white'
const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
const Req = () => <span className="ml-1 text-xs font-semibold text-red-600">必須</span>

export default function PublicOrderPage() {
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense fallback={null}>
      <OrderForm />
    </Suspense>
  )
}

function OrderForm() {
  const params = useSearchParams()
  const optPageId = pageIdOf(params.get('opt'))
  const tourPageId = pageIdOf(params.get('id'))
  const mode: 'tour' | 'optional' = optPageId || params.get('kind') === 'optional' ? 'optional' : 'tour'

  const [page, setPage] = useState<PageInfo | null>(null)
  const [loadingPage, setLoadingPage] = useState(Boolean(tourPageId || optPageId))
  const [cart, setCart] = useState<CartLine[]>([])
  const [listUrl, setListUrl] = useState<string | null>(null)

  const [f, setF] = useState({
    inquiryType: '申込み', tourCode: params.get('code')?.slice(0, 40) ?? '', tourTitle: '',
    departureDate1: jstDate(params.get('dt')) || (/^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? params.get('date')! : ''),
    departureDate2: '', departureAirport: '',
    adults: '2', children: '0', infants: '0',
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

  // A programme: which tour the button was on.
  useEffect(() => {
    if (mode !== 'tour' || !tourPageId) return
    let live = true
    lookUp('tour', tourPageId).then(info => {
      if (!live) return
      setPage(info)
      if (info.found) setF(prev => ({ ...prev, tourCode: info.code ?? prev.tourCode, tourTitle: info.title ?? prev.tourTitle }))
      setLoadingPage(false)
    })
    return () => { live = false }
  }, [mode, tourPageId])

  // Optional tours: the cart, plus the one this button was on.
  useEffect(() => {
    if (mode !== 'optional') return
    let live = true
    const stored = readCart()
    setCart(stored)
    if (!optPageId) { setLoadingPage(false); return }
    lookUp('optional', optPageId).then(info => {
      if (!live) return
      if (info.listUrl) setListUrl(info.listUrl)
      setLoadingPage(false)
      if (!info.found || !info.code || info.withdrawn) { setPage(info); return }
      setCart(prev => {
        if (prev.some(l => l.pageId === optPageId) || prev.length >= MAX_CART) return prev
        const next = [...prev, {
          pageId: optPageId, code: info.code!, title: info.title ?? info.code!, adultJpy: info.adultJpy, childJpy: info.childJpy,
          date: '', adults: 2, children: 0, infants: 0,
        }]
        writeCart(next)
        return next
      })
    })
    return () => { live = false }
  }, [mode, optPageId])

  const setLine = (i: number, patch: Partial<CartLine>) => setCart(prev => {
    const next = prev.map((l, j) => (j === i ? { ...l, ...patch } : l))
    writeCart(next)
    return next
  })
  const removeLine = (i: number) => setCart(prev => {
    const next = prev.filter((_, j) => j !== i)
    writeCart(next)
    return next
  })

  const fareOn = (date: string) => (date && page?.fares ? page.fares[date] : undefined)
  const tourFromPage = mode === 'tour' && Boolean(page?.found)

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
    if (mode === 'optional' && cart.length === 0) {
      setError('オプショナルツアーが選択されていません。')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setBusy(true)
    try {
      const what = mode === 'optional'
        ? {
          kind: 'optional',
          items: cart.map(l => ({ pageId: l.pageId, tourCode: l.code, tourTitle: l.title, date: l.date, adults: l.adults, children: l.children, infants: l.infants })),
        }
        : {
          kind: 'tour',
          pageId: tourFromPage ? tourPageId : undefined,
          tourCode: f.tourCode,
          tourTitle: f.tourTitle,
          departureDate1: f.departureDate1,
          departureDate2: f.departureDate2 || undefined,
          departureAirport: f.departureAirport || undefined,
          adults: Number(f.adults),
          children: Number(f.children),
          infants: Number(f.infants),
        }
      const res = await fetch('/api/public/order-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...what,
          inquiryType: f.inquiryType,
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
      if (res.ok && j.success) {
        if (mode === 'optional') writeCart([])
        setDone({ reference: j.reference ?? null })
      }
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
          <h1 className="text-2xl font-bold text-gray-900">{mode === 'optional' ? 'オプショナルツアーお申込みフォーム' : 'ツアーお申込み・お問合せフォーム'}</h1>
          <p className="text-sm text-gray-500 mt-2">
            {mode === 'optional' ? 'ご利用日と参加人数をご入力ください。' : tourFromPage ? 'ご希望の出発日と内容をご入力ください。' : 'ご希望のツアーコードと内容をご入力ください。'}
            <span className="text-red-600 text-xs font-semibold">必須</span> は必ずご入力ください。
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

        {mode === 'optional' && (
          <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900 border-b border-gray-100 pb-2">お申込みのオプショナルツアー</h2>
            {loadingPage && (
              <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />ツアー情報を読み込んでいます…</p>
            )}
            {page && !page.found && (
              <p className="text-sm text-red-700">ツアー情報を読み込めませんでした。恐れ入りますが、ツアーのページからもう一度お進みください。</p>
            )}
            {page?.withdrawn && <p className="text-sm text-red-700">このツアーの掲載は終了しております。</p>}
            {!loadingPage && cart.length === 0 && <p className="text-sm text-gray-400">選択されたオプショナルツアーはありません。</p>}
            {cart.map((l, i) => {
              const subtotal = (l.adults > 0 && !l.adultJpy) || (l.children > 0 && !l.childJpy)
                ? null : l.adults * (l.adultJpy ?? 0) + l.children * (l.childJpy ?? 0)
              return (
                <div key={l.pageId} className="border border-gray-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{l.title}</p>
                      <p className="text-xs text-gray-500 font-mono mt-0.5">ツアーコード：{l.code}</p>
                      {(l.adultJpy || l.childJpy) && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {l.adultJpy ? `大人 ${yen(l.adultJpy)}` : ''}{l.childJpy ? `　子ども ${yen(l.childJpy)}` : ''}（お一人様）
                        </p>
                      )}
                    </div>
                    <button type="button" onClick={() => removeLine(i)} className="text-gray-400 hover:text-red-600 shrink-0" aria-label={`${l.title}を削除`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="col-span-2 sm:col-span-1">
                      <label className="block text-xs text-gray-500 mb-1">利用日<Req /></label>
                      <input type="date" required value={l.date} onChange={e => setLine(i, { date: e.target.value })} className={field} />
                    </div>
                    {([
                      ['adults', '大人（12歳以上）'],
                      ['children', '子ども（2〜11歳）'],
                      ['infants', '幼児（2歳未満）'],
                    ] as const).map(([key, label]) => (
                      <div key={key}>
                        <label className="block text-xs text-gray-500 mb-1">{label}</label>
                        <select value={l[key]} onChange={e => setLine(i, { [key]: Number(e.target.value) })} className={field}>
                          {Array.from({ length: 16 }, (_, n) => n).map(n => <option key={n} value={n}>{n}人</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                  {subtotal !== null && subtotal > 0 && (
                    <p className="text-sm text-gray-700 text-right">小計（目安）：<span className="font-semibold">{yen(subtotal)}</span></p>
                  )}
                </div>
              )
            })}
            {listUrl && cart.length < MAX_CART && (
              <a href={listUrl} className="inline-flex items-center gap-1 text-sm text-[#647C47] font-medium hover:text-[#4a5c35]">
                <Plus className="w-4 h-4" />他のオプショナルツアーを追加する
              </a>
            )}
            <p className="text-xs text-gray-400">料金は目安です。ピーク期の追加料金などは、担当者よりご案内いたします。</p>
          </section>
        )}

        {mode === 'tour' && (
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
          {loadingPage && (
            <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />ツアー情報を読み込んでいます…</p>
          )}
          {tourFromPage && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
              <p className="text-xs text-gray-500">お申込みのツアー</p>
              <p className="font-medium text-gray-900 mt-1">{f.tourTitle}</p>
              <p className="text-xs text-gray-500 mt-1 font-mono">ツアーコード：{f.tourCode}</p>
              {page?.withdrawn && <p className="text-sm text-red-700 mt-2">このツアーの掲載は終了しております。お申込みはお問合せとして承ります。</p>}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!tourFromPage && (<>
            <div>
              <label className={labelCls}>ツアーコード<Req /></label>
              <input type="text" required value={f.tourCode} onChange={set('tourCode')} placeholder="例: NEK803-ABCR" className={`${field} font-mono`} maxLength={40} />
            </div>
            <div>
              <label className={labelCls}>ツアータイトル</label>
              <input type="text" value={f.tourTitle} onChange={set('tourTitle')} placeholder="例: ナイル川クルーズの旅 8日間" className={field} maxLength={200} />
            </div>
            </>)}
            <div>
              <label className={labelCls}>出発日（第1希望）<Req /></label>
              <input type="date" required value={f.departureDate1} onChange={set('departureDate1')} className={field} />
              <FareHint fare={fareOn(f.departureDate1)} date={f.departureDate1} hasFares={Boolean(page?.fares && Object.keys(page.fares).length)} childPercent={page?.childPercent} infantJpy={page?.infantJpy} />
            </div>
            <div>
              <label className={labelCls}>出発日（第2希望）</label>
              <input type="date" value={f.departureDate2} onChange={set('departureDate2')} className={field} />
              {f.departureDate2 && <FareHint fare={fareOn(f.departureDate2)} date={f.departureDate2} hasFares={Boolean(page?.fares && Object.keys(page.fares).length)} childPercent={page?.childPercent} infantJpy={page?.infantJpy} />}
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
                ['children', '子供（2〜11歳）', 0],
                ['infants', '幼児（2歳未満）', 0],
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
        )}

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

/** The website's fare for the chosen date, or a note that it has none. */
function FareHint({ fare, date, hasFares, childPercent, infantJpy }: { fare?: number; date: string; hasFares: boolean; childPercent?: number; infantJpy?: number }) {
  if (!date || !hasFares) return null
  if (fare) {
    return (
      <p className="text-xs text-gray-600 mt-1">
        旅行代金：大人 {yen(fare)}（2名1室利用時お一人様）
        {childPercent ? `、子供 ${yen(Math.round((fare * childPercent) / 100))}` : ''}
        {typeof infantJpy === 'number' ? `、幼児 ${yen(infantJpy)}` : ''}
      </p>
    )
  }
  return <p className="text-xs text-amber-700 mt-1">この日は出発設定がありません。ご希望の場合はご要望欄にご記入ください。</p>
}
