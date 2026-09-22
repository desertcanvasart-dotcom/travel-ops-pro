// ============================================
// Guest satisfaction survey — the questionnaire definition
// ============================================
// The single source of truth for the ATS guest survey (アンケートのお願い): the
// hosted page renders it, the staff results view reads it, and the printed PDF's
// QR points at the same /survey/<token>. Customer-facing text is Japanese; the
// English gloss is for the staff view. Kept pure so it can be unit-tested and
// shared without pulling in the database or React.

export type RatingValue = 5 | 4 | 3 | 2 | 1 | 'na'

/** The 5→1 + 該当なし scale, in the order the PDF shows it. */
export const RATING_SCALE: { value: RatingValue; ja: string; en: string }[] = [
  { value: 5, ja: 'とても良い', en: 'Excellent' },
  { value: 4, ja: '良い', en: 'Good' },
  { value: 3, ja: '普通', en: 'Average' },
  { value: 2, ja: '悪い', en: 'Poor' },
  { value: 1, ja: 'とても悪い', en: 'Very poor' },
  { value: 'na', ja: '該当なし', en: 'N/A' },
]

export const isRatingValue = (v: unknown): v is RatingValue =>
  v === 'na' || (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5)

/** A scored service item: a rating plus an optional free comment, and sometimes
 *  a short extra field (the guide's name, the hotel's name). */
export interface RatingItem {
  id: string
  ja: string
  en: string
  /** The question shown under the heading. */
  question_ja: string
  /** A one-line extra input above the scale (e.g. guide name), when present. */
  extra?: { id: string; ja: string }
}

export interface SurveySection {
  id: string
  ja: string
  en: string
  items: RatingItem[]
}

/** The rated sections (About Our Service, Overall). */
export const SURVEY_SECTIONS: SurveySection[] = [
  {
    id: 'service',
    ja: 'サービスについてお聞かせください',
    en: 'About Our Service',
    items: [
      { id: 'pre_departure', ja: '出発前のご案内', en: 'Pre-departure information', question_ja: 'ご出発前にお送りした案内（日程表・持ち物・注意事項など）は、分かりやすく十分な内容でしたか？' },
      { id: 'airport_arrival', ja: '空港到着・入国審査', en: 'Airport arrival & immigration', question_ja: 'エジプト到着時のお出迎え・入国審査のサポートはスムーズでしたか？' },
      { id: 'vehicle', ja: '専用車の状態', en: 'Vehicle condition', question_ja: 'ご利用いただいた車両は、清掃・整備が行き届き、快適な状態でしたか？' },
      { id: 'driver', ja: 'ドライバーの運転・対応', en: "Driver's driving & manner", question_ja: 'ドライバーの運転は安全で、対応は礼儀正しいものでしたか？' },
      { id: 'guide', ja: 'ツアーガイド', en: 'Tour guide', question_ja: 'ガイドの説明内容・言葉遣い・時間管理は満足のいくものでしたか？', extra: { id: 'guide_name', ja: 'ご担当ガイド名（複数の場合は都市名も）' } },
      { id: 'hotel_room', ja: '宿泊（客室・清潔感）', en: 'Accommodation – room & cleanliness', question_ja: 'お部屋の快適さ・清潔感はご満足いただけるものでしたか？', extra: { id: 'hotel_name', ja: '主なご宿泊ホテル名' } },
      { id: 'hotel_staff', ja: '宿泊（スタッフ対応）', en: 'Accommodation – staff service', question_ja: 'ホテルスタッフの対応・サービスはいかがでしたか？' },
      { id: 'dining', ja: 'お食事', en: 'Dining', question_ja: 'レストランでのサービス・食事の質や内容にご満足いただけましたか？' },
      { id: 'assistant', ja: '同行アシスタント', en: 'Group assistant', question_ja: '同行したアシスタントの言葉遣い・経験・態度についてお聞かせください。' },
      { id: 'shopping', ja: 'お土産店・ショッピングのご案内', en: 'Shopping / souvenir stops', question_ja: 'お土産店への立ち寄りの頻度や時間配分は適切でしたか？（強引な勧誘等がございましたらお聞かせください）' },
    ],
  },
  {
    id: 'overall',
    ja: '総合評価',
    en: 'Overall',
    items: [
      { id: 'overall_satisfaction', ja: '総合満足度', en: 'Overall satisfaction', question_ja: '今回のご旅行全体を通して、当社サービスにご満足いただけましたか？' },
      { id: 'recommend', ja: 'ご紹介の意向', en: 'Likelihood to recommend', question_ja: 'ご友人やご家族に、当社のツアーをおすすめしたいと思いますか？' },
      { id: 'repeat_intent', ja: '再利用の意向', en: 'Repeat travel intent', question_ja: '今後機会があれば、再度当社をご利用したいと思いますか？' },
    ],
  },
]

/** Every rating item id, flat — for validating a submission. */
export const RATING_ITEM_IDS: string[] = SURVEY_SECTIONS.flatMap(s => s.items.map(i => i.id))

/** The optional-tours yes/no item (not scored) and the free-text box. */
export const OPTIONAL_TOURS = {
  id: 'optional_tours',
  ja: 'オプショナルツアー',
  en: 'Optional excursions',
  question_ja: 'オプショナルツアーにはご参加いただきましたか？',
  detail_ja: '「はい」の場合、都市名とツアー名',
}

export const FREE_TEXT = {
  id: 'additional_comments',
  ja: '自由記述',
  en: 'Additional comments',
  question_ja: 'その他、お気づきの点やご要望があれば、ご自由にお書きください。',
}

/** Trip-info fields at the top; the office pre-fills name/tour/dates from the
 *  booking, so on the hosted survey these are shown read-only when known. */
export interface SurveyResponses {
  ratings: Record<string, RatingValue | undefined>
  comments: Record<string, string>
  extras: Record<string, string>
  optional_tours?: 'yes' | 'no'
  optional_tours_detail?: string
  additional_comments?: string
  guest_name?: string
}

/** Keep only known ids and valid values — never trust a public POST body. */
export function sanitizeResponses(raw: unknown): SurveyResponses {
  const body = (raw ?? {}) as Record<string, unknown>
  const ratingsIn = (body.ratings ?? {}) as Record<string, unknown>
  const commentsIn = (body.comments ?? {}) as Record<string, unknown>
  const extrasIn = (body.extras ?? {}) as Record<string, unknown>
  const ratings: Record<string, RatingValue> = {}
  for (const id of RATING_ITEM_IDS) if (isRatingValue(ratingsIn[id])) ratings[id] = ratingsIn[id] as RatingValue
  const comments: Record<string, string> = {}
  for (const id of RATING_ITEM_IDS) {
    const c = commentsIn[id]
    if (typeof c === 'string' && c.trim()) comments[id] = c.trim().slice(0, 2000)
  }
  const extras: Record<string, string> = {}
  for (const s of SURVEY_SECTIONS) for (const i of s.items) {
    if (!i.extra) continue
    const v = extrasIn[i.extra.id]
    if (typeof v === 'string' && v.trim()) extras[i.extra.id] = v.trim().slice(0, 200)
  }
  const opt = body.optional_tours
  const str = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined)
  return {
    ratings,
    comments,
    extras,
    optional_tours: opt === 'yes' || opt === 'no' ? opt : undefined,
    optional_tours_detail: str(body.optional_tours_detail, 500),
    additional_comments: str(body.additional_comments, 4000),
    guest_name: str(body.guest_name, 200),
  }
}
