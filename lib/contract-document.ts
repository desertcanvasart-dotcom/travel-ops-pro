// ============================================
// What a travel contract says, as the page shows it
// ============================================
// The contract page lets the operator edit the payment terms, inclusions,
// exclusions, cancellation terms, force majeure and special notes, and shows
// the terms and conditions in the page's language. The PDF printed none of
// it — a fixed "10% deposit… upon arrival", its own lists and no
// cancellation section — and the WhatsApp send rebuilt the contract from the
// database. The page now hands both the contract exactly as shown: every
// string already resolved (edited, translated, in the page's language).
//
// sanitizeContractDocument bounds what the server accepts from the page. The
// parties and the recipient never come from here.

export interface ContractTermsSection {
  title: string
  /** One paragraph, or several bullet points. */
  text: string[]
}

/** The PDF's headings, in the page's language. Missing ones print in English. */
export interface ContractLabels {
  title: string
  parties: string
  serviceProvider: string
  client: string
  travellers: string
  tourDetails: string
  tour: string
  dates: string
  destinations: string
  financialTerms: string
  totalPrice: string
  paymentTerms: string
  inclusions: string
  exclusions: string
  cancellationPolicy: string
  flightCancellation: string
  noShowPolicy: string
  forceMajeure: string
  termsAndConditions: string
  specialNotes: string
  signatures: string
  date: string
}

export const ENGLISH_CONTRACT_LABELS: ContractLabels = {
  title: 'TRAVEL CONTRACT',
  parties: 'Parties',
  serviceProvider: 'Service Provider',
  client: 'Client',
  travellers: 'Travelers',
  tourDetails: 'Tour details',
  tour: 'Tour',
  dates: 'Dates',
  destinations: 'Destinations',
  financialTerms: 'Financial terms',
  totalPrice: 'Total price',
  paymentTerms: 'Payment',
  inclusions: 'Inclusions',
  exclusions: 'Exclusions',
  cancellationPolicy: 'Cancellation policy',
  flightCancellation: 'Flight cancellation',
  noShowPolicy: 'No-show policy',
  forceMajeure: 'Force majeure',
  termsAndConditions: 'Terms and conditions',
  specialNotes: 'Special notes',
  signatures: 'Signatures',
  date: 'Date',
}

export interface ContractDocument {
  labels?: Partial<ContractLabels>
  paymentTerms?: string
  inclusions?: string[]
  exclusions?: string[]
  /** The cancellation section: its intro line, then its points. */
  cancellationIntro?: string
  cancellationLines?: string[]
  flightCancellation?: string
  noShowPolicy?: string
  forceMajeure?: string
  termsSections?: ContractTermsSection[]
  specialNotes?: string
  /** The closing line under the signatures (which law governs). */
  governingNote?: string
  /** The trip facts the operator may have corrected on the page. */
  tourName?: string
  destinations?: string
  totalCost?: number | null
}

const MAX_TEXT = 2000
const MAX_ITEMS = 40
const str = (v: unknown, max = MAX_TEXT) => (typeof v === 'string' ? v.slice(0, max) : undefined)
const list = (v: unknown, max = 500) =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').slice(0, MAX_ITEMS).map(x => x.slice(0, max))
    : undefined

/** Only contract text, only strings and lists of strings, bounded. */
export function sanitizeContractDocument(input: unknown): ContractDocument {
  if (!input || typeof input !== 'object') return {}
  const src = input as Record<string, unknown>
  const out: ContractDocument = {}
  for (const key of ['paymentTerms', 'cancellationIntro', 'flightCancellation', 'noShowPolicy', 'forceMajeure', 'specialNotes', 'governingNote', 'tourName', 'destinations'] as const) {
    const v = str(src[key])
    if (v !== undefined) out[key] = v
  }
  for (const key of ['inclusions', 'exclusions', 'cancellationLines'] as const) {
    const v = list(src[key])
    if (v !== undefined) out[key] = v
  }
  if (Array.isArray(src.termsSections)) {
    out.termsSections = src.termsSections.slice(0, 20).flatMap(s => {
      if (!s || typeof s !== 'object') return []
      const title = str((s as Record<string, unknown>).title, 200)
      const text = list((s as Record<string, unknown>).text, MAX_TEXT)
      return title && text?.length ? [{ title, text }] : []
    })
  }
  if (src.labels && typeof src.labels === 'object') {
    const labels: Partial<ContractLabels> = {}
    for (const key of Object.keys(ENGLISH_CONTRACT_LABELS) as (keyof ContractLabels)[]) {
      const v = str((src.labels as Record<string, unknown>)[key], 120)
      if (v) labels[key] = v
    }
    out.labels = labels
  }
  const total = src.totalCost
  if (total === null || (typeof total === 'number' && Number.isFinite(total) && total >= 0)) out.totalCost = total
  return out
}
