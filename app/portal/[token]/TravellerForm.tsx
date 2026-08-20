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
  validatePassenger,
  type PassengerInput,
  type ValidationIssue,
} from '@/lib/passenger-validation'
import type { PortalTraveller } from '@/lib/booking-portal'

interface Props {
  token: string
  traveller: PortalTraveller
  index: number
  departureDate: string | null
  locked: boolean
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
  insurance_requested: t.insuranceRequested,
  special_requests: t.specialRequests ?? '',
})

export default function TravellerForm({ token, traveller, index, departureDate, locked }: Props) {
  const [form, setForm] = useState<FormState>(() => toForm(traveller))
  const [open, setOpen] = useState(index === 0 && !traveller.submittedAt)
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(Boolean(traveller.submittedAt))
  const [serverIssues, setServerIssues] = useState<ValidationIssue[] | null>(null)
  const [touched, setTouched] = useState(false)

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
        body: JSON.stringify({ ...form, submit }),
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
            <h4>お名前</h4>
            <p className="hint">パスポートと同じローマ字でご記入ください。</p>
            <div className="g2">
              <Field label="ローマ字（姓）" value={form.last_name} onChange={set('last_name')} issue={errorFor('last_name')} placeholder="YAMADA" />
              <Field label="ローマ字（名）" value={form.first_name} onChange={set('first_name')} issue={errorFor('first_name')} placeholder="TARO" />
              <Field label="漢字（姓）" value={form.family_name_kanji} onChange={set('family_name_kanji')} issue={errorFor('family_name_kanji')} placeholder="山田" />
              <Field label="漢字（名）" value={form.given_name_kanji} onChange={set('given_name_kanji')} placeholder="太郎" />
              <Field label="フリガナ（姓）" value={form.family_name_kana} onChange={set('family_name_kana')} issue={errorFor('family_name_kana')} placeholder="ヤマダ" />
              <Field label="フリガナ（名）" value={form.given_name_kana} onChange={set('given_name_kana')} issue={errorFor('given_name_kana')} placeholder="タロウ" />
            </div>

            <h4>ご本人様情報</h4>
            <div className="g2">
              <Field label="生年月日" type="date" value={form.date_of_birth} onChange={set('date_of_birth')} issue={errorFor('date_of_birth')} />
              <Select label="性別" value={form.gender} onChange={set('gender')} issue={errorFor('gender')}
                options={[['', '選択してください'], ['male', '男性'], ['female', '女性'], ['other', 'その他']]} />
              <Field label="国籍" value={form.nationality} onChange={set('nationality')} issue={errorFor('nationality')} />
            </div>

            <h4>パスポート</h4>
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

            {traveller.isLead && (
              <>
                <h4>ご住所</h4>
                <p className="hint">最終日程表をこちらへお送りします。</p>
                <div className="g2">
                  <Field label="郵便番号" value={form.postal_code} onChange={set('postal_code')} issue={errorFor('postal_code')} placeholder="106-0031" />
                </div>
                <Field label="ご住所" value={form.address} onChange={set('address')} issue={errorFor('address')} wide />
                <Field label="フリガナ" value={form.address_kana} onChange={set('address_kana')} wide />
              </>
            )}

            <h4>ご連絡先</h4>
            <div className="g2">
              <Field label="携帯電話番号" value={form.phone} onChange={set('phone')} />
              <Field label="自宅電話番号" value={form.home_phone} onChange={set('home_phone')} />
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

            <h4>その他</h4>
            <div className="radios">
              <label>
                <input type="radio" checked={form.insurance_requested === true} onChange={() => set('insurance_requested')(true)} />
                海外旅行傷害保障を希望する
              </label>
              <label>
                <input type="radio" checked={form.insurance_requested === false} onChange={() => set('insurance_requested')(false)} />
                希望しない
              </label>
            </div>
            <Field label="特記事項（食物アレルギーなど）" value={form.special_requests} onChange={set('special_requests')} wide />
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
