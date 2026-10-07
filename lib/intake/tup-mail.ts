// ============================================
// The website's T-UP notification email → a structured order
// ============================================
// When a customer applies on ats-hj.com (the T-UP system behind
// tour.ats-hj.com), the website emails the office a 【T-UP】… notification.
// It is not the form's layout: every answer is a "●label：value" line, a
// value may run onto the next lines (the email address, the address, the
// price notes), and the travellers come last as blocks —
//
//   ●代表者
//   　お名前：SHIBATA AYAKA
//   　生年月日：1993/07/11
//   　性別：女性
//   ●同行者1
//   　お名前：SHIBATA RYO …
//
// An optional tour (オプショナルツアー) says ●オプショナルコード and
// ●希望利用日 where a programme says ●ツアーコード and ●出発日; both carry
// the tour's page on the website (opt_detail.php?id=67), the party with
// infants (幼児), and the subtotal the website showed (小計).
//
// Read once into labelled fields, then mapped — the label set is the form's,
// so a field the website adds later is ignored instead of corrupting its
// neighbour. Pure. Real sample: __tests__/lib/tup-mail.test.ts.
import { normalizeJa, parseGender, parseJaDate, type OrderPerson, type TourUpOrder, type WebsiteBaseFare } from '@/lib/intake/tour-up-order'

interface Field { label: string; value: string }
interface Block { head: string; fields: Field[] }

/** "お名前（漢字）" and "お名前 (漢字)" are the same label. */
const normLabel = (s: string) => normalizeJa(s).replace(/\s+/g, '')

/** The website's notification, not our canonical document or a conversation. */
export function looksLikeTupMail(text: string): boolean {
  const t = normalizeJa(text)
  return /^[ \t]*●/m.test(t)
    && /●\s*(ツアーコード|オプショナルコード)\s*:/.test(t)
    && /(出発日|利用日)/.test(t)
}

// A line that only separates (----, ====, ━━━) closes whatever was open:
// a mailer footer below it must not become the last traveller's 性別.
const RULE = /^[\s\-=_━─*＊~〜]{4,}$/
// The traveller blocks; any other bare "●heading" only groups its lines.
const PERSON_HEAD = /^(代表者|同行者\s*\d+)$/

function readFields(text: string): { top: Field[]; blocks: Block[] } {
  const top: Field[] = []
  const blocks: Block[] = []
  let current: Field | null = null
  let block: Block | null = null
  let grouped = false // under a bare ●heading: its "label:value" lines are fields

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (RULE.test(line)) { current = null; block = null; grouped = false; continue }

    const bullet = line.match(/^●\s*(.*)$/)
    if (bullet) {
      const rest = bullet[1]
      const kv = rest.match(/^([^:]{1,30}?)\s*:\s*(.*)$/)
      block = null
      if (kv) {
        current = { label: normLabel(kv[1]), value: kv[2].trim() }
        top.push(current)
        grouped = false
      } else {
        const head = normLabel(rest)
        current = null
        if (PERSON_HEAD.test(head)) {
          block = { head, fields: [] }
          blocks.push(block)
          grouped = false
        } else {
          grouped = true
        }
      }
      continue
    }

    if (block || grouped) {
      const kv = line.match(/^([^:]{1,20}?)\s*:\s*(.*)$/)
      if (kv && !/^https?$/i.test(kv[1])) {
        current = { label: normLabel(kv[1]), value: kv[2].trim() }
        ;(block ? block.fields : top).push(current)
        continue
      }
    }
    // A continuation of the open value (blank lines kept, trimmed at the end).
    if (current) current.value = current.value ? `${current.value}\n${line}` : line
  }

  const tidy = (f: Field) => { f.value = f.value.replace(/\n{3,}/g, '\n\n').trim() }
  top.forEach(tidy)
  blocks.forEach(b => b.fields.forEach(tidy))
  return { top, blocks }
}

function pick(fields: Field[], labels: readonly string[]): string | undefined {
  for (const l of labels.map(normLabel)) {
    const f = fields.find(x => x.label === l && x.value)
    if (f) return f.value
  }
  return undefined
}

const firstLine = (v: string | undefined) => v?.split('\n')[0].trim() || undefined

/** "姓 鈴木 名 花子", "セイ スズキ メイ ハナコ", "SHIBATA AYAKA", "柴田 彩夏" → [last, first].
 *  Only the leading sub-label counts: 名 inside a name (名取) is the name. */
function splitName(v: string | undefined, lastTag: string, firstTag: string): [string, string] | undefined {
  const s = firstLine(v)
  if (!s) return undefined
  const tagged = s.match(new RegExp(`^${lastTag}\\s*(\\S*)\\s*${firstTag}\\s*(.*)$`))
  if (tagged) return [tagged[1].trim(), tagged[2].trim()]
  const parts = s.split(/\s+/)
  return [parts[0], parts.slice(1).join(' ')]
}

const LABELS = {
  inquiryType: ['問合せ種別', 'お問合せ種別', '問い合わせ種別', '問合せ内容', 'お問合せ内容'],
  code: ['ツアーコード', 'オプショナルコード'],
  title: ['ツアータイトル', 'ツアー名', 'オプショナルタイトル', 'タイトル'],
  category: ['区分'],
  // The real package-tour notification says 希望出発日(第1希望) (2026-08-30
  // sample); the form's own field names are kept for the canonical document.
  date1: ['希望出発日(第1希望)', '出発日(第1希望)', '希望出発日', '出発日', '希望利用日', '利用日(第1希望)', '利用日'],
  date2: ['希望出発日(第2希望)', '出発日(第2希望)', '利用日(第2希望)', '第2希望'],
  baseFare1: ['第1希望日基本旅行代金'],
  baseFare2: ['第2希望日基本旅行代金'],
  airport: ['出発地'],
  party: ['参加人数'],
  subtotal: ['小計'],
  priceNotes: ['料金備考'],
  email: ['メールアドレス'],
  phone: ['電話番号'],
  contact: ['希望の連絡方法', '希望連絡方法'],
  kanji: ['お名前(漢字)'],
  kana: ['お名前(カナ)'],
  romaji: ['お名前(ローマ字)', 'お名前', '氏名'],
  gender: ['性別'],
  birth: ['生年月日'],
  address: ['ご住所', '住所'],
  requests: ['ご要望・質問など', 'ご要望', 'ご質問'],
} as const

const EMAIL = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/
const URL_RE = /https?:\/\/[^\s"'<>）)]+/g

function person(fields: Field[], fallback: Field[] = []): OrderPerson | null {
  const name = splitName(pick(fields, LABELS.romaji) ?? pick(fallback, LABELS.romaji), '姓', '名')
  if (!name || (!name[0] && !name[1])) return null
  return {
    lastNameRomaji: name[0],
    firstNameRomaji: name[1],
    gender: parseGender(firstLine(pick(fields, LABELS.gender) ?? pick(fallback, LABELS.gender))),
    birthDate: parseJaDate(pick(fields, LABELS.birth) ?? pick(fallback, LABELS.birth)),
  }
}

/** "大人 348,000円" / "大人 348,000円、子供 300,000円" → yen per band. */
function baseFare(v: string | undefined): WebsiteBaseFare | undefined {
  if (!v) return undefined
  const yen = (band: string) => {
    const m = v.match(new RegExp(`${band}\\s*:?\\s*([\\d,]+)\\s*円`))
    const n = m ? Number(m[1].replace(/,/g, '')) : NaN
    return Number.isFinite(n) && n > 0 ? n : undefined
  }
  const fare = { adultJpy: yen('大人'), childJpy: yen('子供') }
  return fare.adultJpy || fare.childJpy ? fare : undefined
}

const CJK = /[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef★☆！？]/

/** A value the mailer wrapped mid-phrase ("★2大\n都市カイロ") joins without a
 *  space between Japanese characters, and with one between words. */
function joinWrapped(v: string): string {
  return v.split('\n').map(l => l.trim()).filter(Boolean).reduce((out, line) =>
    !out ? line : CJK.test(out.slice(-1)) && CJK.test(line[0]) ? out + line : `${out} ${line}`, '')
}

/** Read the notification. Null when the tour code or the date is missing. */
export function parseTupMail(raw: string): TourUpOrder | null {
  const text = normalizeJa(raw)
  if (!looksLikeTupMail(text)) return null
  const { top, blocks } = readFields(text)

  const codeField = top.find(f => (LABELS.code as readonly string[]).includes(f.label) && f.value)
  const tourCode = (firstLine(codeField?.value) ?? '').replace(/\s+/g, '').toUpperCase()
  const departureDate1 = parseJaDate(pick(top, LABELS.date1))
  if (!tourCode || !departureDate1) return null
  const dep2Raw = pick(top, LABELS.date2)
  const departureDate2 = dep2Raw && !/^[-—–\s/年月日]*$/.test(dep2Raw) ? parseJaDate(dep2Raw) : undefined

  const urls = [...text.matchAll(URL_RE)].map(m => m[0])
  // The tour page: a detail page, else any page naming an id — never the
  // mailer footer's home page link.
  const websiteUrl = urls.find(u => /detail/i.test(u)) ?? urls.find(u => /[?&]id=/.test(u))
  const category = firstLine(pick(top, LABELS.category)?.replace(URL_RE, ''))
  const productKind: 'tour' | 'optional' =
    codeField?.label === 'オプショナルコード' || /オプショナル/.test(category ?? '') || /opt_/i.test(websiteUrl ?? '')
      ? 'optional' : 'tour'

  // 参加人数：大人 2人、子供 0人、幼児 0人 — or the form's two 子供 bands.
  const party = pick(top, LABELS.party) ?? ''
  const adults = Number(party.match(/大人\s*(\d+)/)?.[1] ?? 0)
  const children = [...party.matchAll(/子供\s*(\d+)/g)].reduce((s, m) => s + Number(m[1]), 0)
  const infants = Number(party.match(/幼児\s*(\d+)/)?.[1] ?? 0)

  const subtotalRaw = pick(top, LABELS.subtotal)
  const subtotal = subtotalRaw ? Number(subtotalRaw.replace(/[^\d]/g, '')) : NaN

  const contactRaw = pick(top, LABELS.contact)
  const email = (pick(top, LABELS.email)?.match(EMAIL)?.[0] ?? '').toLowerCase()
  const phone = pick(top, LABELS.phone)?.split('\n')[0].replace(/[^\d+\-()]/g, '') || undefined

  const addrRaw = (pick(top, LABELS.address) ?? '').replace(/\n/g, ' ')
  const postalCode = addrRaw.match(/〒?\s*(\d{3}-?\d{4})/)?.[1]
  const prefecture = addrRaw.match(/(北海道|東京都|京都府|大阪府|[^\s\d〒()]{2,3}県)/)?.[1]
  const address = addrRaw.replace(/〒?\s*\d{3}-?\d{4}/, '').replace(prefecture ?? '\u0000', '')
    .replace(/--都道府県--/, '').replace(/\s+/g, ' ').trim() || undefined

  // The lead: the ●代表者 block, else the form's top-level romaji/sex/birth.
  const leadBlock = blocks.find(b => b.head === '代表者')
  const leadPerson = person(leadBlock?.fields ?? [], top)
  const kanji = splitName(pick(top, LABELS.kanji), '姓', '名')
  const kana = splitName(pick(top, LABELS.kana), 'セイ', 'メイ')
  const lead: OrderPerson = {
    lastNameRomaji: leadPerson?.lastNameRomaji ?? '',
    firstNameRomaji: leadPerson?.firstNameRomaji ?? '',
    lastNameKanji: kanji?.[0] || undefined,
    firstNameKanji: kanji?.[1] || undefined,
    lastNameKana: kana?.[0] || undefined,
    firstNameKana: kana?.[1] || undefined,
    gender: leadPerson?.gender,
    birthDate: leadPerson?.birthDate,
  }

  const companions = blocks
    .filter(b => b.head.startsWith('同行者'))
    .map(b => person(b.fields))
    .filter((p): p is OrderPerson => p !== null)

  return {
    inquiryType: firstLine(pick(top, LABELS.inquiryType)) ?? '',
    tourCode,
    tourTitle: joinWrapped(pick(top, LABELS.title) ?? ''),
    departureDate1,
    departureDate2,
    departureAirport: firstLine(pick(top, LABELS.airport)),
    adults: adults || companions.length + 1,
    children,
    contactMethod: contactRaw ? (/電話/.test(contactRaw) && !/メール/.test(contactRaw) ? 'phone' : 'email') : undefined,
    email,
    phone,
    lead,
    postalCode,
    prefecture,
    address,
    requests: pick(top, LABELS.requests) || undefined,
    companions,
    productKind,
    websiteUrl,
    infants: infants || undefined,
    websiteSubtotalJpy: Number.isFinite(subtotal) && subtotal > 0 ? subtotal : undefined,
    priceNotes: pick(top, LABELS.priceNotes) || undefined,
    websiteBaseFare1: baseFare(pick(top, LABELS.baseFare1)),
    websiteBaseFare2: baseFare(pick(top, LABELS.baseFare2)),
  }
}

/** The key two spellings of one website page share: path + id, no host or
 *  scheme. https://tour.ats-hj.com/opt_detail.php?id=67 and
 *  http://www.tour.ats-hj.com/opt_detail.php?id=67&ref=x → "opt_detail.php?id=67". */
export function websitePageKey(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url.trim())
    const page = u.pathname.split('/').filter(Boolean).pop() ?? ''
    const id = u.searchParams.get('id')
    if (!page) return null
    return (id ? `${page}?id=${id}` : page).toLowerCase()
  } catch {
    return null
  }
}

/** Plain text of a stored email, line breaks kept — the order is read line by
 *  line, so an HTML-only body must not collapse into one line. */
export function emailOrderText(bodyText: string | null | undefined, bodyHtml: string | null | undefined): string {
  if (bodyText && bodyText.trim()) return bodyText
  return (bodyHtml ?? '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
}
