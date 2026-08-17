// ============================================
// PASSENGER DETAILS — the checks paper cannot make
// ============================================
// A.T.S post a 海外旅行参加申込書 to every traveller and read the answers back
// off a fax. That process cannot check anything. Two of its failure modes only
// surface at an airport, and both are written on their own documents:
//
//   ＊必ずパスポートをご確認の上、同じスペルをご記入ください。
//     一文字でも違うと飛行機に搭乗出来ませんので、ご注意下さい。
//       — one character wrong in the romanised name and the traveller does not
//         board. A form cannot compare against the passport, but it CAN refuse
//         a name that is not romanised at all, which is the common slip.
//
//   注）エジプトは入国査証申請時6ヶ月以上の残存有効期間が必要
//       — Egypt wants six months of passport validity. Their visa is obtained
//         on arrival (観光ビザ 入国時現地にて取得できます), so the six months
//         run from the ARRIVAL date, not from today and not from the booking.
//
// A form knows the departure date. It can say so while the traveller is still
// sitting there, rather than three weeks before departure when somebody finally
// reads the fax.
//
// Pure: a passenger and a trip in, issues out. No database, no clock — the
// caller supplies the departure date, so a result is reproducible in a test and
// does not change depending on when it runs.
//
// Messages are Japanese: the form is Japanese-only, and these are read by the
// traveller. Every issue also carries a stable `code`, so the UI can translate
// or group without parsing prose.

export type IssueSeverity = 'error' | 'warning'

export interface ValidationIssue {
  field: string
  severity: IssueSeverity
  /** Stable identifier — safe to switch on, safe to translate. */
  code: string
  /** Shown to the traveller. */
  message: string
}

export interface PassengerInput {
  first_name?: string | null
  last_name?: string | null
  family_name_kanji?: string | null
  given_name_kanji?: string | null
  family_name_kana?: string | null
  given_name_kana?: string | null
  date_of_birth?: string | null
  gender?: string | null
  nationality?: string | null
  postal_code?: string | null
  address?: string | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  emergency_contact_relationship?: string | null
  passport_number?: string | null
  passport_expiry?: string | null
  passport_status?: string | null
  passport_expected_date?: string | null
  passenger_type?: string | null
  is_lead_passenger?: boolean | null
}

export interface TripContext {
  /** ISO date the party arrives — what the six-month rule counts from. */
  departure_date: string | null
  /** Months of passport validity the destination requires on arrival. */
  residual_validity_months?: number
}

/** Egypt, per A.T.S's own pre-departure guidance. */
export const DEFAULT_RESIDUAL_VALIDITY_MONTHS = 6

// Latin letters, spaces, hyphens and apostrophes. A passport's machine-readable
// name has nothing else in it.
const ROMAJI = /^[A-Za-z][A-Za-z\s'-]*$/
// Katakana, hiragana, the long vowel mark and spaces. フリガナ conventionally
// means katakana, but hiragana is accepted rather than rejected — a traveller
// who writes their own name in hiragana has not made a mistake worth blocking.
const KANA = /^[぀-ゟ゠-ヿー\s　]+$/
// 〒NNN-NNNN. Accepted with or without the hyphen.
const JP_POSTAL = /^\d{3}-?\d{4}$/

function has(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/** Months added in UTC — local arithmetic shifts a date across a DST boundary. */
export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + months, d))
  // Rolling 31 Aug forward six months lands on 31 Feb, which JS turns into
  // 3 March. Clamp to the last day of the intended month instead, so the check
  // never becomes accidentally more lenient than the rule.
  if (target.getUTCMonth() !== (((m - 1 + months) % 12) + 12) % 12) {
    target.setUTCDate(0)
  }
  return target.toISOString().slice(0, 10)
}

/** Whole years old on a given date. */
export function ageOn(dateOfBirth: string, onDate: string): number {
  const dob = dateOfBirth.slice(0, 10)
  const on = onDate.slice(0, 10)
  let age = Number(on.slice(0, 4)) - Number(dob.slice(0, 4))
  if (on.slice(5) < dob.slice(5)) age -= 1
  return age
}

export function validatePassenger(
  passenger: PassengerInput,
  trip: TripContext
): { ok: boolean; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = []
  const add = (field: string, severity: IssueSeverity, code: string, message: string) =>
    issues.push({ field, severity, code, message })

  const departure = trip.departure_date?.slice(0, 10) ?? null
  const months = trip.residual_validity_months ?? DEFAULT_RESIDUAL_VALIDITY_MONTHS

  // ---------- the romanised name ----------
  for (const [field, value, label] of [
    ['last_name', passenger.last_name, '姓'],
    ['first_name', passenger.first_name, '名'],
  ] as const) {
    if (!has(value)) {
      add(field, 'error', 'romaji_required', `ローマ字の${label}をご記入ください。`)
    } else if (!ROMAJI.test(value.trim())) {
      // The common slip: Japanese typed into the romaji box.
      add(
        field,
        'error',
        'romaji_not_latin',
        `ローマ字の${label}はパスポートと同じアルファベットでご記入ください。一文字でも異なると搭乗できません。`
      )
    }
  }

  // ---------- kana and kanji ----------
  for (const [field, value, label] of [
    ['family_name_kana', passenger.family_name_kana, '姓'],
    ['given_name_kana', passenger.given_name_kana, '名'],
  ] as const) {
    if (!has(value)) {
      add(field, 'error', 'kana_required', `フリガナ（${label}）をご記入ください。`)
    } else if (!KANA.test(value.trim())) {
      add(field, 'warning', 'kana_not_kana', `フリガナ（${label}）はカタカナでご記入ください。`)
    }
  }
  if (!has(passenger.family_name_kanji) && !has(passenger.given_name_kanji)) {
    add('family_name_kanji', 'warning', 'kanji_missing', '漢字のお名前もご記入ください。')
  }

  // ---------- the person ----------
  if (!has(passenger.date_of_birth)) {
    add('date_of_birth', 'error', 'dob_required', '生年月日をご記入ください。')
  } else if (departure && passenger.date_of_birth.slice(0, 10) >= departure) {
    add('date_of_birth', 'error', 'dob_after_departure', '生年月日をご確認ください。')
  }
  if (!has(passenger.gender)) add('gender', 'error', 'gender_required', '性別をご記入ください。')
  if (!has(passenger.nationality)) {
    add('nationality', 'error', 'nationality_required', '国籍をご記入ください。')
  }

  // A traveller booked as an adult who is a child on the day of departure is
  // priced wrong and may need different arrangements. Flagged, not blocked —
  // the operator decides, not the form.
  if (has(passenger.date_of_birth) && departure && has(passenger.passenger_type)) {
    const age = ageOn(passenger.date_of_birth, departure)
    const declared = passenger.passenger_type
    const actual = age < 2 ? 'infant' : age < 12 ? 'child' : 'adult'
    if (declared !== 'tour_leader' && declared !== actual) {
      add(
        'date_of_birth',
        'warning',
        'age_type_mismatch',
        `ご出発時点で${age}歳のため、区分をご確認ください。`
      )
    }
  }

  // ---------- passport ----------
  const applying = passenger.passport_status === 'applying'
  if (applying) {
    // Their form allows this: 現在申請中 ⇒ 取得予定. It is a real answer, so it
    // needs a date rather than an empty passport field.
    if (!has(passenger.passport_expected_date)) {
      add(
        'passport_expected_date',
        'error',
        'passport_expected_required',
        'パスポートの取得予定日をご記入ください。'
      )
    } else if (departure && passenger.passport_expected_date.slice(0, 10) >= departure) {
      add(
        'passport_expected_date',
        'error',
        'passport_expected_after_departure',
        'パスポートの取得予定日がご出発日以降になっています。ご出発までに取得できない場合はご連絡ください。'
      )
    }
  } else {
    if (!has(passenger.passport_number)) {
      add('passport_number', 'error', 'passport_number_required', 'パスポート番号をご記入ください。')
    }
    if (!has(passenger.passport_expiry)) {
      add('passport_expiry', 'error', 'passport_expiry_required', 'パスポートの有効期間満了日をご記入ください。')
    } else if (departure) {
      const expiry = passenger.passport_expiry.slice(0, 10)
      const required = addMonths(departure, months)
      if (expiry < departure) {
        add(
          'passport_expiry',
          'error',
          'passport_expired',
          `パスポートがご出発日（${departure}）より前に失効します。`
        )
      } else if (expiry < required) {
        // The check that actually earns this form. Egypt refuses entry without
        // six months' residual validity, and nobody finds out from a fax.
        add(
          'passport_expiry',
          'error',
          'passport_residual_validity',
          `エジプト入国には、ご出発日から${months}ヶ月以上（${required}まで）の残存有効期間が必要です。現在のパスポートは${expiry}に失効します。`
        )
      }
    }
  }

  // ---------- the emergency contact left behind in Japan ----------
  // 渡航中の国内緊急連絡先 is marked 必須 on their form, 続柄 included.
  if (!has(passenger.emergency_contact_name)) {
    add('emergency_contact_name', 'error', 'emergency_name_required', '国内緊急連絡先のお名前をご記入ください。')
  }
  if (!has(passenger.emergency_contact_phone)) {
    add('emergency_contact_phone', 'error', 'emergency_phone_required', '国内緊急連絡先の電話番号をご記入ください。')
  }
  if (!has(passenger.emergency_contact_relationship)) {
    add(
      'emergency_contact_relationship',
      'error',
      'emergency_relationship_required',
      '国内緊急連絡先の続柄をご記入ください。'
    )
  }

  // ---------- address ----------
  // Required of the LEAD only: their form says the final itinerary is posted to
  // the 代表者's address unless told otherwise, so a companion who leaves it
  // blank has not failed to answer anything.
  if (passenger.is_lead_passenger) {
    if (!has(passenger.address)) {
      add('address', 'error', 'address_required', 'ご住所をご記入ください。最終日程表をお送りします。')
    }
    if (!has(passenger.postal_code)) {
      add('postal_code', 'error', 'postal_required', '郵便番号をご記入ください。')
    } else if (!JP_POSTAL.test(passenger.postal_code.trim())) {
      add('postal_code', 'warning', 'postal_format', '郵便番号は7桁でご記入ください（例：106-0031）。')
    }
  }

  return { ok: !issues.some(i => i.severity === 'error'), issues }
}

/** Whether every traveller on a booking is ready — the gate before documents go out. */
export function validateManifest(
  passengers: PassengerInput[],
  trip: TripContext
): { ok: boolean; byPassenger: Array<{ index: number; issues: ValidationIssue[] }> } {
  const byPassenger = passengers.map((p, index) => ({
    index,
    issues: validatePassenger(p, trip).issues,
  }))

  const leads = passengers.filter(p => p.is_lead_passenger).length
  if (leads !== 1) {
    // Their paperwork is addressed to one 代表者. Nobody, or two people, means
    // the documents have no single destination.
    byPassenger.push({
      index: -1,
      issues: [
        {
          field: 'is_lead_passenger',
          severity: 'error',
          code: leads === 0 ? 'lead_missing' : 'lead_duplicate',
          message:
            leads === 0
              ? '代表者を1名ご指定ください。'
              : '代表者は1名のみご指定ください。',
        },
      ],
    })
  }

  return {
    ok: byPassenger.every(p => !p.issues.some(i => i.severity === 'error')),
    byPassenger,
  }
}
