// ============================================
// OPERATOR DOCUMENTS — the canonical contract
// ============================================
// This app produces the working documents an operator already recognises:
// operations sheets for the ground team, confirmations and invoices for the
// customer, meet boards for the airport. It is sold to different operators,
// each of whom has their OWN paper, so nothing in this file names one. The
// shapes below are the facts a document is built from; a template arranges
// those facts into one operator's layout.
//
// Adding an operator's document means writing one template file and adding it
// to the registry. It must never mean a migration or a change to this file.
//
// Templates are PURE — context in, HTML out. No database, no network, no
// browser. That keeps a layout verifiable against a fixture with no
// environment, and it is the same split the integration adapters use:
// the decision half is pure, the route does the I/O.

/** Page setup handed to the PDF renderer. */
export interface DocumentPage {
  size: 'A4' | 'Letter'
  orientation: 'portrait' | 'landscape'
  /** CSS length applied to all four sides, e.g. '12mm'. */
  margin: string
}

export interface DocumentTemplate<Context> {
  /** Stable slug — used in the render URL and stored on generated documents. */
  readonly slug: string
  /** Shown in the documents UI. */
  readonly label: string
  /** One line on what this document is and who receives it. */
  readonly description: string
  readonly page: DocumentPage
  /** Full standalone HTML document. Must inline its own CSS. */
  render(context: Context): string
}

// ---------------------------------------------------------------------------
// Operations sheet — what a ground operator needs to run a trip
// ---------------------------------------------------------------------------
// The document the selling office sends to the destination office: who is
// arriving, when, on what, in how many rooms, with which guides, and what
// happens each day. Every operator has a version of this; the fields below are
// the union of what one has to say, not one operator's column order.

export interface StaffContact {
  /** The operator's own label for this posting — "CAI. GUIDE", "UPP. GUIDE".
   *  A trip handed between regions has a different guide per region, and the
   *  ground team needs to know which is which, not just a list of names. */
  role: string
  name: string | null
  mobile: string | null
}

export interface OperationsSheetDay {
  /** As the operator numbers it. Not necessarily "1" for the first ground day —
   *  a trip that starts with an overnight flight has its first day in the air,
   *  and the ground sheet starts at D2. */
  label: string
  date: string | null
  /** Movement and sightseeing, one instruction per line, in the order they
   *  happen. Times the office has not filled yet stay as the operator's own
   *  placeholder rather than being invented here. */
  lines: string[]
  meals: {
    breakfast: boolean
    lunch: boolean
    dinner: boolean
  }
  /** Where the party sleeps that night, as the operator's short code
   *  (GIZA, ABS, ASW …). Null on a day with no overnight — the last day. */
  accommodation_code: string | null
}

export interface OperationsSheetHotel {
  city: string | null
  hotel: string | null
  check_in: string | null
  check_out: string | null
  nights: number | null
  room: string | null
  remarks: string | null
}

export interface OperationsSheetContext {
  // --- identity ---
  tour_code: string | null
  /** The operator's own reference for this booking's paperwork. */
  file_no: string | null
  group_ref: string | null
  /** The ground company running it. */
  operator: string | null
  /** When the ground arrangements were confirmed. */
  confirmed_date: string | null
  /** When this sheet was produced. */
  final_date: string | null

  // --- the party ---
  pax_count: number | null
  room_count: number | null
  /** Standing instructions that change how the ground team handles the party —
   *  e.g. that visas and tips are already paid, so nothing is collected. */
  remarks: string | null

  // --- movement ---
  arrival_date: string | null
  departure_date: string | null
  nights: number | null
  arrival_flight: string | null
  departure_flight: string | null

  // --- ground staff ---
  guides: StaffContact[]

  // --- programme ---
  days: OperationsSheetDay[]
  hotels: OperationsSheetHotel[]
}
