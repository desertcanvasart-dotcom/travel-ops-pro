// ============================================
// The tour-up.jp order form → a structured order
// ============================================
// A.T.S sells its programmes from a fixed inquiry form on tour-up.jp
// (お問合せフォーム). The customer fills labelled fields — tour code, first and
// second departure date, party, contact, name in kanji / kana / romaji, sex,
// birth date, address — and the office receives the answers by email as a
// label-and-value dump of the same form. That is a document, not a
// conversation: it is read here deterministically, label by label, instead
// of being guessed at by the conversational parser (which knows nothing of
// tour codes and would drop the birth dates and address the 日程表 and
// contract need).
//
// Tolerant of the ways such a dump is laid out — "label：value", "label\n
// value", full- or half-width colons and digits, 年/月/日 dates, repeated
// email confirmation field — and of a companion block per traveller.
// Pure; the route matches the programme and writes.

export interface OrderPerson {
  /** Romanised, as on the passport. */
  lastNameRomaji: string
  firstNameRomaji: string
  lastNameKanji?: string
  firstNameKanji?: string
  lastNameKana?: string
  firstNameKana?: string
  gender?: 'male' | 'female'
  /** YYYY-MM-DD */
  birthDate?: string
}

export interface TourUpOrder {
  inquiryType: string          // 申込み / お問合せ …
  tourCode: string
  tourTitle: string
  departureDate1: string       // YYYY-MM-DD
  departureDate2?: string
  departureAirport?: string    // 成田 / 羽田 / 関空 …
  adults: number
  children: number
  contactMethod?: 'email' | 'phone'
  email: string
  phone?: string
  lead: OrderPerson
  postalCode?: string
  prefecture?: string
  address?: string
  requests?: string
  companions: OrderPerson[]
}

const Z2H: Record<string, string> = {}
for (let i = 0; i < 10; i++) Z2H[String.fromCharCode(0xff10 + i)] = String(i)
'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ'.split('').forEach((c, i) => { Z2H[c] = String.fromCharCode(65 + i) })
'ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ'.split('').forEach((c, i) => { Z2H[c] = String.fromCharCode(97 + i) })
Z2H['：'] = ':'; Z2H['－'] = '-'; Z2H['ー'] = 'ー'; Z2H['＠'] = '@'; Z2H['．'] = '.'; Z2H['　'] = ' '; Z2H['（'] = '('; Z2H['）'] = ')'

/** Half-width digits, letters and punctuation; one space per run of blanks. */
export function normalizeJa(text: string): string {
  return text.replace(/[０-９Ａ-Ｚａ-ｚ：－＠．　（）]/g, c => Z2H[c] ?? c)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
}

/** Does this text look like the tour-up.jp order form? Cheap, for routing. */
export function looksLikeTourUpOrder(text: string): boolean {
  const t = normalizeJa(text)
  return /ツアーコード/.test(t) && /(希望出発日|出発日)/.test(t) && /(参加人数|大人)/.test(t)
}

const LABELS = {
  inquiryType: ['問合せ種別', 'お問合せ種別', '問い合わせ種別'],
  tourCode: ['ツアーコード'],
  tourTitle: ['ツアータイトル', 'ツアー名'],
  dep1: ['出発日(第1希望)', '出発日（第1希望）', '第1希望', '希望出発日'],
  dep2: ['出発日(第2希望)', '出発日（第2希望）', '第2希望'],
  airport: ['出発地'],
  contact: ['希望連絡方法'],
  email: ['メールアドレス'],
  phone: ['電話番号'],
  nameKanji: ['お名前(漢字)', 'お名前（漢字）'],
  nameKana: ['お名前(カナ)', 'お名前（カナ）'],
  gender: ['性別'],
  birth: ['生年月日'],
  requests: ['ご要望・質問など', 'ご要望', 'ご質問'],
  nameRomaji: ['お名前(ローマ字)', 'お名前（ローマ字）', 'お名前'],
  address: ['ご住所'],
} as const

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The text after `label` up to the end of that line (or the next label). */
function after(text: string, labels: readonly string[], opts: { multiline?: boolean } = {}): string | undefined {
  for (const label of labels) {
    const re = new RegExp(`(?:^|\\n)[ \\t■●・\\-]*${esc(label)}[ \\t]*(?:必須)?[ \\t]*[:：]?[ \\t]*([^\\n]*)`)
    const m = text.match(re)
    if (!m) continue
    let value = m[1].trim()
    if (opts.multiline) {
      // Free text runs until the next "label:" line or a blank line.
      const rest = text.slice(m.index! + m[0].length)
      const more = rest.match(/^((?:\n(?![^\n]*[:：]\s*\S)[^\n]*)*)/)
      if (more) value = (value + more[1]).trim()
    }
    if (!value) {
      // "label" on one line, the value on the next.
      const rest = text.slice(m.index! + m[0].length)
      const next = rest.match(/^\n[ \t]*([^\n]+)/)
      if (next && !/[:：]\s*\S/.test(next[1])) value = next[1].trim()
    }
    return value || undefined
  }
  return undefined
}

/** "2026年9月18日", "2026/9/18", "2026-09-18" → "2026-09-18". */
export function parseJaDate(s: string | undefined): string | undefined {
  if (!s) return undefined
  const m = normalizeJa(s).match(/(\d{4})\s*[年/\-.]\s*(\d{1,2})\s*[月/\-.]\s*(\d{1,2})/)
  if (!m) return undefined
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return undefined
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function twoNames(value: string | undefined, a: RegExp, b: RegExp): [string, string] | undefined {
  if (!value) return undefined
  const v = value.replace(/[:：]/g, ' ')
  const last = v.match(a)?.[1]?.trim()
  const first = v.match(b)?.[1]?.trim()
  if (last || first) return [last ?? '', first ?? '']
  // No sub-labels: "山田 太郎" / "YAMADA TARO"
  const parts = v.trim().split(/\s+/)
  if (parts.length >= 2) return [parts[0], parts.slice(1).join(' ')]
  return [v.trim(), '']
}

function parseGender(v: string | undefined): 'male' | 'female' | undefined {
  if (!v) return undefined
  if (/女|female|F\b/i.test(v)) return 'female'
  if (/男|male|M\b/i.test(v)) return 'male'
  return undefined
}

/** Parse the order email. Null when the text is not this form. */
export function parseTourUpOrder(raw: string): TourUpOrder | null {
  const text = normalizeJa(raw)
  if (!looksLikeTourUpOrder(text)) return null

  const tourCode = (after(text, LABELS.tourCode) ?? '').replace(/\s+/g, '').toUpperCase()
  const dep1 = parseJaDate(after(text, LABELS.dep1))
  const dep2Raw = after(text, LABELS.dep2)
  const dep2 = dep2Raw && !/^[-—–\s]*$/.test(dep2Raw) ? parseJaDate(dep2Raw) : undefined
  if (!tourCode || !dep1) return null

  // 参加人数: 大人 1人 子供 0人 子供 0人 — on one line or several.
  const partyBlock = (() => {
    const i = text.indexOf('参加人数')
    return i >= 0 ? text.slice(i, i + 120) : text
  })()
  const adults = Number(partyBlock.match(/大人\s*[:：]?\s*(\d+)/)?.[1] ?? 0)
  const children = [...partyBlock.matchAll(/子供\s*[:：]?\s*(\d+)/g)].reduce((s, m) => s + Number(m[1]), 0)

  const contactRaw = after(text, LABELS.contact)
  const contactMethod = contactRaw ? (/電話/.test(contactRaw) && !/メール/.test(contactRaw) ? 'phone' : 'email') : undefined
  const email = (text.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/)?.[0] ?? '').toLowerCase()
  const phone = after(text, LABELS.phone)?.replace(/[^\d+\-()]/g, '') || undefined

  const kanji = twoNames(after(text, LABELS.nameKanji), /姓\s*([^\s名]+)/, /名\s*(\S+)/)
  const kana = twoNames(after(text, LABELS.nameKana), /セイ\s*([^\sメ]+)/, /メイ\s*(\S+)/)
  // The romaji block sits in the passenger section, after the kanji one.
  const romajiSection = text.slice(Math.max(text.indexOf('ローマ字'), text.lastIndexOf('お名前')))
  const romaji = twoNames(after(romajiSection, LABELS.nameRomaji) ?? after(romajiSection, ['姓']), /姓\s*([A-Za-z\-']+)/, /名\s*([A-Za-z\-' ]+)/)

  const addrRaw = after(text, LABELS.address, { multiline: true }) ?? ''
  const postal = addrRaw.match(/〒?\s*(\d{3}-?\d{4})/)?.[1]
  const prefecture = addrRaw.match(/(北海道|東京都|京都府|大阪府|[^\s\d〒()（）]{2,3}県)/)?.[1]
  const address = addrRaw.replace(/〒?\s*\d{3}-?\d{4}/, '').replace(/\(例[^)]*\)/, '').replace(prefecture ?? '', '').replace(/--都道府県--/, '').trim() || undefined

  const lead: OrderPerson = {
    lastNameRomaji: romaji?.[0] ?? '',
    firstNameRomaji: romaji?.[1] ?? '',
    lastNameKanji: kanji?.[0] || undefined,
    firstNameKanji: kanji?.[1] || undefined,
    lastNameKana: kana?.[0] || undefined,
    firstNameKana: kana?.[1] || undefined,
    gender: parseGender(after(text, LABELS.gender)),
    birthDate: parseJaDate(after(text, LABELS.birth)),
  }

  // Companions: "同行者1" … blocks, each with a romaji name, birth date, sex.
  const companions: OrderPerson[] = []
  for (const m of text.matchAll(/同行者\s*(\d+)[\s\S]*?(?=同行者\s*\d+|$)/g)) {
    const block = m[0]
    const names = twoNames(after(block, ['お名前', '氏名', 'お名前(ローマ字)']), /姓\s*([A-Za-z\-']+)/, /名\s*([A-Za-z\-' ]+)/)
    if (!names || (!names[0] && !names[1])) continue
    companions.push({
      lastNameRomaji: names[0], firstNameRomaji: names[1],
      gender: parseGender(after(block, LABELS.gender)),
      birthDate: parseJaDate(after(block, LABELS.birth)),
    })
  }

  return {
    inquiryType: after(text, LABELS.inquiryType) ?? '',
    tourCode,
    tourTitle: after(text, LABELS.tourTitle) ?? '',
    departureDate1: dep1,
    departureDate2: dep2,
    departureAirport: after(text, LABELS.airport) || undefined,
    adults: adults || (companions.length + 1),
    children,
    contactMethod,
    email,
    phone,
    lead,
    postalCode: postal,
    prefecture,
    address,
    requests: after(text, LABELS.requests, { multiline: true }) || undefined,
    companions,
  }
}

// ---------- programme matching ----------
// The form's code and the loaded programme's code are the same product
// written by two hands: NEK803-ABCR on the website, NEK803-CR-ABS in the
// catalogue. The stem before the first dash (NEK803) is the product; the
// suffixes are the same letters in a different order. Exact first; then the
// stem when it names exactly one programme; else nothing — never a guess.
export function matchTemplateCode<T extends { template_code: string }>(code: string, templates: T[]): T | null {
  const norm = (s: string) => s.replace(/[\s_]/g, '').toUpperCase()
  const wanted = norm(code)
  const exact = templates.find(t => norm(t.template_code) === wanted)
  if (exact) return exact
  const stem = wanted.split('-')[0]
  if (!stem) return null
  const byStem = templates.filter(t => norm(t.template_code).split('-')[0] === stem)
  return byStem.length === 1 ? byStem[0] : null
}
