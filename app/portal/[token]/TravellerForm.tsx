'use client'

// ============================================
// One traveller's 海外旅行参加申込書
// ============================================
// The form A.T.S post today. Two things it does that the paper cannot:
//
//   * It refuses a passport that expires inside six months of arrival, which is
//     what Egypt requires and what nobody discovers from a fax until it is too
//     late to fix.
//   * It refuses Japanese typed into the ローマ字 boxes — the common slip
//     behind their own warning that one wrong character stops you boarding.
//
// Validation runs in the browser as the traveller types (lib/passenger-
// validation.ts, shared with the server so the two cannot disagree) and again
// on the server, which is the one that counts.
//
// Saving and submitting are separate. A half-finished form saves; only a clean
// one submits. Otherwise the operator's chase list clears while a passport is
// still unusable.

import { useMemo, useState } from 'react'
import {
  quoteAllPlans,
  ageOn,
  formatJpy,
  type PremiumBand,
} from '@/lib/insurance'
import {
  validatePassenger,
  type PassengerInput,
  type ValidationIssue,
} from '@/lib/passenger-validation'
import type { PortalTraveller } from '@/lib/booking-portal'
import TravellerDocuments from './TravellerDocuments'

interface Props {
  token: string
  traveller: PortalTraveller
  index: number
  departureDate: string | null
  locked: boolean
  /** The published 掛金表, for pricing the plan chooser. Empty until the
   *  operator loads a rate table — the chooser then works without prices,
   *  which is what the paper form does. */
  insuranceBands: PremiumBand[]
  /** Trip length, departure and return inclusive — the insurer's own count. */
  tripDays: number | null
}

/** Form state uses the DB column names, so what is typed is what is sent. */
type FormState = Record<string, string | boolean | null>

const toForm = (t: PortalTraveller): FormState => ({
  last_name: t.lastName ?? '',
  first_name: t.firstName ?? '',
  family_name_kanji: t.familyNameKanji ?? '',
  given_name_kanji: t.givenNameKanji ?? '',
  family_name_kana: t.familyNameKana ?? '',
  given_name_kana: t.givenNameKana ?? '',
  date_of_birth: t.dateOfBirth ?? '',
  gender: t.gender ?? '',
  nationality: t.nationality ?? '日本',
  passport_status: t.passportStatus ?? 'held',
  passport_number: t.passportNumber ?? '',
  passport_issued_date: t.passportIssuedDate ?? '',
  passport_expiry: t.passportExpiry ?? '',
  passport_expected_date: t.passportExpectedDate ?? '',
  postal_code: t.postalCode ?? '',
  address: t.address ?? '',
  address_kana: t.addressKana ?? '',
  documents_postal_code: t.documentsPostalCode ?? '',
  documents_address: t.documentsAddress ?? '',
  phone: t.phone ?? '',
  home_phone: t.homePhone ?? '',
  email: t.email ?? '',
  employer_name: t.employerName ?? '',
  employer_phone: t.employerPhone ?? '',
  emergency_contact_name: t.emergencyContactName ?? '',
  emergency_contact_kana: t.emergencyContactKana ?? '',
  emergency_contact_phone: t.emergencyContactPhone ?? '',
  emergency_contact_relationship: t.emergencyContactRelationship ?? '',
  documents_address_kana: t.documentsAddressKana ?? '',
  fax: t.fax ?? '',
  insurance_requested: t.insuranceRequested,
  insurance_plan_code: t.insurancePlanCode ?? '',
  insurance_application_date: t.insuranceApplicationDate ?? '',
  insurance_purpose: t.insurancePurpose ?? '',
  insurance_purpose_other: t.insurancePurposeOther ?? '',
  insurance_hazardous: t.insuranceHazardous,
  insurance_hazardous_detail: t.insuranceHazardousDetail ?? '',
  insurance_under_treatment: t.insuranceUnderTreatment,
  insurance_treatment_detail: t.insuranceTreatmentDetail ?? '',
  insurance_disability: t.insuranceDisability,
  insurance_disability_detail: t.insuranceDisabilityDetail ?? '',
  insurance_other_policy: t.insuranceOtherPolicy,
  insurance_other_policy_insurer: t.insuranceOtherPolicyInsurer ?? '',
  insurance_other_policy_death_benefit:
    t.insuranceOtherPolicyDeathBenefit == null ? '' : String(t.insuranceOtherPolicyDeathBenefit),
  special_requests: t.specialRequests ?? '',
})

export default function TravellerForm({
  token, traveller, index, departureDate, locked, insuranceBands, tripDays,
}: Props) {
  const [form, setForm] = useState<FormState>(() => toForm(traveller))
  const [open, setOpen] = useState(index === 0 && !traveller.submittedAt)
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(Boolean(traveller.submittedAt))
  const [serverIssues, setServerIssues] = useState<ValidationIssue[] | null>(null)
  const [touched, setTouched] = useState(false)
  // A list, so it lives outside the flat FormState rather than being encoded
  // into a string and decoded on the server.
  const [otherKinds, setOtherKinds] = useState<string[]>(traveller.insuranceOtherPolicyKinds)

  // The same rules the server applies — imported, not reimplemented, so the two
  // can never drift into disagreeing about whether a passport is acceptable.
  const issues = useMemo(
    () =>
      validatePassenger(
        {
          ...(form as unknown as PassengerInput),
          is_lead_passenger: traveller.isLead,
          passenger_type: traveller.passengerType,
        },
        { departure_date: departureDate }
      ).issues,
    [form, departureDate, traveller.isLead, traveller.passengerType]
  )

  const shown = serverIssues ?? (touched ? issues : [])
  const errorFor = (field: string) => shown.find(i => i.field === field)
  const hasErrors = issues.some(i => i.severity === 'error')

  const set = (field: string) => (value: string | boolean | null) => {
    setTouched(true)
    setServerIssues(null)
    setForm(f => ({ ...f, [field]: value }))
  }

  async function save(submit: boolean) {
    setSaving(true)
    try {
      const res = await fetch(`/api/portal/${token}/travellers/${traveller.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          // A declaration answered いいえ must not keep the detail from a
          // previous はい. The traveller sees the box disappear and reasonably
          // believes the answer went with it — and a stale 傷病名 sitting under
          // "no current treatment" is a false declaration to the insurer.
          ...clearedDetails(form),
          insurance_other_policy_kinds: form.insurance_other_policy === true ? otherKinds : [],
          // The insurer wants a number, and an empty box is "not answered".
          insurance_other_policy_death_benefit:
            typeof form.insurance_other_policy_death_benefit === 'string' &&
            form.insurance_other_policy_death_benefit.trim() !== ''
              ? Number(String(form.insurance_other_policy_death_benefit).replace(/[^\d]/g, ''))
              : null,
          submit,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setServerIssues([
          {
            field: '_',
            severity: 'error',
            code: 'save_failed',
            message: data?.message ?? '保存できませんでした。時間をおいて再度お試しください。',
          },
        ])
        return
      }
      setSubmitted(Boolean(data.submitted))
      setServerIssues(data.issues ?? [])
      if (data.submitted) setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const name =
    [form.family_name_kanji, form.given_name_kanji].filter(Boolean).join(' ') ||
    [form.last_name, form.first_name].filter(Boolean).join(' ') ||
    `${index + 1}人目`

  const applying = form.passport_status === 'applying'
  const wantsInsurance = form.insurance_requested === true

  // Age at DEPARTURE, not today — it is what the band ceilings are checked
  // against, and it moves as the traveller types their birth date.
  const age = ageOn(
    typeof form.date_of_birth === 'string' ? form.date_of_birth : null,
    departureDate
  )
  const plans = useMemo(
    () =>
      insuranceBands.length && tripDays
        ? quoteAllPlans({ bands: insuranceBands, days: tripDays, age })
        : [],
    [insuranceBands, tripDays, age]
  )
  const chosen = plans.find(p => p.planCode === form.insurance_plan_code)
  const chosenPremium = chosen && chosen.available ? chosen.quote : null

  return (
    <div className={`pax ${submitted ? 'done' : ''}`}>
      <button type="button" className="paxhd" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="who">
          <b>{name}</b>
          {traveller.isLead && <em className="lead">代表者</em>}
        </span>
        <span className={`state ${submitted ? 'ok' : ''}`}>
          {submitted ? '登録済み' : '未登録'}
        </span>
      </button>

      {open && (
        <div className="paxbody">
          <fieldset disabled={locked || saving}>
            {/* Field order follows the paper 海外旅行参加申込書 exactly: フリガナ
                first, then 漢字, then ローマ字. A customer filling this beside
                the form they were posted should never have to hunt. */}
            <h4>お名前</h4>
            <p className="hint">パスポートと同じローマ字でご記入ください。</p>
            <div className="g2">
              <Field label="フリガナ（姓）" value={form.family_name_kana} onChange={set('family_name_kana')} issue={errorFor('family_name_kana')} placeholder="ヤマダ" />
              <Field label="フリガナ（名）" value={form.given_name_kana} onChange={set('given_name_kana')} issue={errorFor('given_name_kana')} placeholder="タロウ" />
              <Field label="漢字（姓）" value={form.family_name_kanji} onChange={set('family_name_kanji')} issue={errorFor('family_name_kanji')} placeholder="山田" />
              <Field label="漢字（名）" value={form.given_name_kanji} onChange={set('given_name_kanji')} placeholder="太郎" />
              <Field label="ローマ字（姓）" value={form.last_name} onChange={set('last_name')} issue={errorFor('last_name')} placeholder="YAMADA" />
              <Field label="ローマ字（名）" value={form.first_name} onChange={set('first_name')} issue={errorFor('first_name')} placeholder="TARO" />
            </div>

            <h4>パスポート情報</h4>
            <p className="hint">
              ＊必ずパスポートをご確認の上、同じスペルをご記入ください。
              エジプトは入国査証申請時6ヶ月以上の残存有効期間が必要です。
            </p>
            <div className="radios">
              <label>
                <input type="radio" checked={!applying} onChange={() => set('passport_status')('held')} />
                取得済み
              </label>
              <label>
                <input type="radio" checked={applying} onChange={() => set('passport_status')('applying')} />
                現在申請中
              </label>
            </div>
            {applying ? (
              <div className="g2">
                <Field label="取得予定日" type="date" value={form.passport_expected_date} onChange={set('passport_expected_date')} issue={errorFor('passport_expected_date')} />
              </div>
            ) : (
              <div className="g2">
                <Field label="パスポート番号" value={form.passport_number} onChange={set('passport_number')} issue={errorFor('passport_number')} />
                <Field label="発行年月日" type="date" value={form.passport_issued_date} onChange={set('passport_issued_date')} />
                <Field label="有効期間満了日" type="date" value={form.passport_expiry} onChange={set('passport_expiry')} issue={errorFor('passport_expiry')} />
              </div>
            )}

            <h4>パスポート・書類の添付</h4>
            <TravellerDocuments token={token} passengerId={traveller.id} locked={locked} />

            <h4>ご本人様情報</h4>
            <div className="g2">
              <Field label="生年月日" type="date" value={form.date_of_birth} onChange={set('date_of_birth')} issue={errorFor('date_of_birth')} />
              {/* 年齢 is on the paper form as a box to fill; here it follows from
                  the birth date, so it is shown rather than asked for. */}
              <label className="f">
                <span>年齢（ご出発日時点）</span>
                <input type="text" value={age == null ? '' : `${age} 才`} readOnly />
              </label>
              <Select label="性別" value={form.gender} onChange={set('gender')} issue={errorFor('gender')}
                options={[['', '選択してください'], ['male', '男性'], ['female', '女性'], ['other', 'その他']]} />
              <Field label="国籍" value={form.nationality} onChange={set('nationality')} issue={errorFor('nationality')} />
            </div>

            <h4>現住所</h4>
            <div className="g2">
              <Field label="郵便番号" value={form.postal_code} onChange={set('postal_code')} issue={errorFor('postal_code')} placeholder="106-0031" />
            </div>
            <Field label="ご住所" value={form.address} onChange={set('address')} issue={errorFor('address')} wide />
            <Field label="フリガナ" value={form.address_kana} onChange={set('address_kana')} wide />

            <h4>書類送付先ご住所</h4>
            <p className="hint">
              ＊最終日程表は基本的に代表者の現住所へお送りします。別送をご希望の場合のみご記入ください。
            </p>
            <div className="g2">
              <Field label="郵便番号" value={form.documents_postal_code} onChange={set('documents_postal_code')} placeholder="106-0031" />
            </div>
            <Field label="ご住所" value={form.documents_address} onChange={set('documents_address')} wide />
            <Field label="フリガナ" value={form.documents_address_kana} onChange={set('documents_address_kana')} wide />

            <h4>ご連絡先</h4>
            <div className="g2">
              <Field label="自宅電話番号" value={form.home_phone} onChange={set('home_phone')} />
              <Field label="FAX" value={form.fax} onChange={set('fax')} />
              <Field label="携帯電話番号" value={form.phone} onChange={set('phone')} />
              <Field label="メールアドレス" type="email" value={form.email} onChange={set('email')} />
              <Field label="勤務先名称" value={form.employer_name} onChange={set('employer_name')} />
              <Field label="勤務先電話番号" value={form.employer_phone} onChange={set('employer_phone')} />
            </div>

            <h4>渡航中の国内緊急連絡先</h4>
            <p className="hint">ご旅行中に日本国内でご連絡できる方をご記入ください。</p>
            <div className="g2">
              <Field label="お名前" value={form.emergency_contact_name} onChange={set('emergency_contact_name')} issue={errorFor('emergency_contact_name')} />
              <Field label="フリガナ" value={form.emergency_contact_kana} onChange={set('emergency_contact_kana')} />
              <Field label="電話番号" value={form.emergency_contact_phone} onChange={set('emergency_contact_phone')} issue={errorFor('emergency_contact_phone')} />
              <Field label="続柄" value={form.emergency_contact_relationship} onChange={set('emergency_contact_relationship')} issue={errorFor('emergency_contact_relationship')} placeholder="妻・父 など" />
            </div>

            <h4>海外旅行傷害保障</h4>
            <div className="radios">
              <label>
                <input type="radio" checked={form.insurance_requested === true} onChange={() => set('insurance_requested')(true)} />
                希望します
              </label>
              <label>
                <input type="radio" checked={form.insurance_requested === false} onChange={() => set('insurance_requested')(false)} />
                希望しません
              </label>
            </div>

            <h4>特記事項</h4>
            <Field label="食物アレルギーなど" value={form.special_requests} onChange={set('special_requests')} wide />

            {/* ---------------- トラベルセーフティプラン加入申込書 ----------------
                Shown only to someone who asked for cover, exactly as the paper
                form does: 「以下、海外旅行傷害保障 ご加入希望者のみご記入お願い
                します。」 */}
            {wantsInsurance && (
              <div className="ins">
                <h4>トラベルセーフティプラン加入申込書</h4>
                <p className="hint">
                  海外渡航者安全事業共済会のご加入申込です。申込人はご本人様として承ります。
                  保険料はご旅行代金とあわせてご請求いたします。
                </p>

                <div className="g2">
                  <Field label="申込日" type="date" value={form.insurance_application_date} onChange={set('insurance_application_date')} />
                </div>

                <h5>加入プランコード</h5>
                {plans.length === 0 ? (
                  <p className="hint">
                    プランの詳細は担当者よりご案内いたします。
                  </p>
                ) : (
                  <div className="plans">
                    {plans.map(p => {
                      const picked = form.insurance_plan_code === p.planCode
                      return (
                        <label key={p.planCode} className={`plan ${picked ? 'on' : ''} ${p.available ? '' : 'off'}`}>
                          <input
                            type="radio"
                            name={`plan-${traveller.id}`}
                            checked={picked}
                            disabled={!p.available}
                            onChange={() => set('insurance_plan_code')(p.planCode)}
                          />
                          <b>{p.planCode}</b>
                          {p.available ? (
                            <>
                              <span className="amt">{formatJpy(p.quote.premiumJpy)}</span>
                              <span className="band">{p.quote.bandLabel}</span>
                            </>
                          ) : (
                            <span className="why">{ineligibleText(p.reason)}</span>
                          )}
                        </label>
                      )
                    })}
                  </div>
                )}

                {chosenPremium && (
                  <p className="instotal">
                    領収金額合計　<b>{formatJpy(chosenPremium.premiumJpy)}</b>
                    <em>（ご旅行期間 {tripDays}日間・{chosenPremium.bandLabel}）</em>
                  </p>
                )}

                <h5>告知事項</h5>
                <p className="hint">保険のお引受けに必要な確認事項です。ありのままにご記入ください。</p>

                <Select label="ご旅行の目的" value={form.insurance_purpose} onChange={set('insurance_purpose')}
                  options={[['', '選択してください'], ['sightseeing', '観光'], ['business', '商用'], ['study', '留学'], ['pilot_licence', '航空機の免許取得'], ['other', 'その他']]} />
                {form.insurance_purpose === 'other' && (
                  <Field label="その他の目的" value={form.insurance_purpose_other} onChange={set('insurance_purpose_other')} wide />
                )}

                <YesNo
                  question="ご旅行中に危険なお仕事や運動などをなさいますか"
                  note="（注）危険なお仕事とは建設工事等、危険な運動とは登山、ハングライダー等をいいます。"
                  value={form.insurance_hazardous}
                  onChange={set('insurance_hazardous')}
                  detailLabel="お仕事・運動の内容"
                  detail={form.insurance_hazardous_detail}
                  onDetail={set('insurance_hazardous_detail')}
                />
                <YesNo
                  question="現在ケガや病気で医師の治療を受けていますか"
                  value={form.insurance_under_treatment}
                  onChange={set('insurance_under_treatment')}
                  detailLabel="傷病名"
                  detail={form.insurance_treatment_detail}
                  onDetail={set('insurance_treatment_detail')}
                />
                <YesNo
                  question="身体に障害がありますか"
                  value={form.insurance_disability}
                  onChange={set('insurance_disability')}
                  detailLabel="傷病名"
                  detail={form.insurance_disability_detail}
                  onDetail={set('insurance_disability_detail')}
                />
                <YesNo
                  question="下記のいずれかの保険にご加入なさっていますか（生命保険は除く）"
                  value={form.insurance_other_policy}
                  onChange={set('insurance_other_policy')}
                />
                {form.insurance_other_policy === true && (
                  <>
                    <div className="radios">
                      {['普通傷害', '海外旅行傷害', 'その他'].map(kind => (
                        <label key={kind}>
                          <input
                            type="checkbox"
                            checked={otherKinds.includes(kind)}
                            onChange={e => {
                              setTouched(true)
                              setOtherKinds(k => (e.target.checked ? [...k, kind] : k.filter(x => x !== kind)))
                            }}
                          />
                          {kind}
                        </label>
                      ))}
                    </div>
                    <div className="g2">
                      <Field label="保険会社" value={form.insurance_other_policy_insurer} onChange={set('insurance_other_policy_insurer')} />
                      <Field label="死亡保険金額（円）" value={form.insurance_other_policy_death_benefit} onChange={set('insurance_other_policy_death_benefit')} />
                    </div>
                  </>
                )}

                <p className="hint">死亡共済受取人：法定相続人とする（別途受取人をご希望の場合はお申し出ください）</p>
              </div>
            )}

          </fieldset>

          {shown.length > 0 && (
            <ul className="issues">
              {shown.map((i, n) => (
                <li key={n} className={i.severity}>
                  {i.message}
                </li>
              ))}
            </ul>
          )}

          {!locked && (
            <div className="actions">
              <button type="button" onClick={() => save(false)} disabled={saving} className="ghost">
                {saving ? '保存中…' : '一時保存'}
              </button>
              <button type="button" onClick={() => save(true)} disabled={saving || hasErrors} className="primary">
                この内容で登録する
              </button>
            </div>
          )}
          {hasErrors && !locked && (
            <p className="blocked">未入力またはご確認が必要な項目があります。</p>
          )}
        </div>
      )}
    </div>
  )
}

/** The detail fields that only mean something when their question was answered
 *  はい. Anything else is cleared on the way out. */
function clearedDetails(form: FormState): Partial<FormState> {
  const out: Partial<FormState> = {}
  const pairs: Array<[string, string[]]> = [
    ['insurance_hazardous', ['insurance_hazardous_detail']],
    ['insurance_under_treatment', ['insurance_treatment_detail']],
    ['insurance_disability', ['insurance_disability_detail']],
    ['insurance_other_policy', ['insurance_other_policy_insurer', 'insurance_other_policy_death_benefit']],
  ]
  for (const [question, details] of pairs) {
    if (form[question] !== true) for (const d of details) out[d] = null
  }
  // 目的 that is not その他 carries no free text.
  if (form.insurance_purpose !== 'other') out.insurance_purpose_other = null
  // And a traveller who does not want cover has no application at all.
  if (form.insurance_requested !== true) {
    for (const f of Object.keys(form)) {
      if (f.startsWith('insurance_') && f !== 'insurance_requested') out[f] = null
    }
  }
  return out
}

/** A 告知事項 question. Neither answer is preselected: an unanswered
 *  declaration must not read as "no", which is what a defaulted radio would
 *  quietly turn it into. */
function YesNo({
  question, note, value, onChange, detailLabel, detail, onDetail,
}: {
  question: string
  note?: string
  value: string | boolean | null
  onChange: (v: boolean) => void
  detailLabel?: string
  detail?: string | boolean | null
  onDetail?: (v: string) => void
}) {
  return (
    <div className="tell">
      <p className="q">●{question}</p>
      {note && <p className="hint">{note}</p>}
      <div className="radios">
        <label>
          <input type="radio" checked={value === false} onChange={() => onChange(false)} />
          いいえ
        </label>
        <label>
          <input type="radio" checked={value === true} onChange={() => onChange(true)} />
          はい
        </label>
      </div>
      {value === true && detailLabel && onDetail && (
        <Field label={detailLabel} value={detail ?? ''} onChange={onDetail} wide />
      )}
    </div>
  )
}

/** Why a plan cannot be taken, in the customer's language. Saying nothing and
 *  hiding the plan would read as a fault in the page. */
function ineligibleText(reason: 'trip_too_long' | 'age_above_band_limit' | 'no_band'): string {
  switch (reason) {
    case 'trip_too_long':
      return '3ヶ月を超えるご旅行はお申込みいただけません'
    case 'age_above_band_limit':
      return 'この期間は満69歳までの方が対象です'
    default:
      return '担当者よりご案内いたします'
  }
}

function Field({
  label, value, onChange, issue, type = 'text', placeholder, wide,
}: {
  label: string
  value: string | boolean | null
  onChange: (v: string) => void
  issue?: ValidationIssue
  type?: string
  placeholder?: string
  wide?: boolean
}) {
  return (
    <label className={`f ${wide ? 'wide' : ''} ${issue ? issue.severity : ''}`}>
      <span>{label}</span>
      <input
        type={type}
        value={typeof value === 'string' ? value : ''}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
      />
    </label>
  )
}

function Select({
  label, value, onChange, options, issue,
}: {
  label: string
  value: string | boolean | null
  onChange: (v: string) => void
  options: Array<[string, string]>
  issue?: ValidationIssue
}) {
  return (
    <label className={`f ${issue ? issue.severity : ''}`}>
      <span>{label}</span>
      <select value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  )
}
