// ============================================
// The lines a supplier voucher prints, and when editing may rebuild them
// ============================================
// A voucher's `services` are its lines. Generate writes them from the trip
// (with each line's date and notes); the edit page's rate pickers write them
// together with their own `selected_*` list. Two things read those columns
// wrongly before:
//
//   * The PDF took the first `selected_*` list that was not null. A generated
//     voucher has `selected_attractions = []` (the column's default) — an
//     empty list, but not null — so its PDF printed an empty items table
//     while the page showed every line.
//   * Saving the edit page rebuilt `services` from the attractions picker
//     whenever the document's own picker was empty, so saving a hotel,
//     cruise or generated voucher erased the lines Generate had written.

type Line = Record<string, unknown>

function nonEmpty(list: unknown): list is Line[] {
  return Array.isArray(list) && list.length > 0
}

/**
 * The lines to print: `services` when there are any — they are what the page
 * shows and what every save writes — else the first picker list that has
 * lines (documents saved only with a picker list).
 */
export function voucherLines(doc: {
  services?: unknown
  selected_routes?: unknown
  selected_meals?: unknown
  selected_guides?: unknown
  selected_attractions?: unknown
}): Line[] {
  const lists = [doc.services, doc.selected_routes, doc.selected_meals, doc.selected_guides, doc.selected_attractions]
  return lists.find(nonEmpty) ?? []
}

/**
 * Whether saving should rebuild `services` from a picker: when it holds lines
 * now, or held some when the page loaded (the user removed them all). A
 * picker that was never used leaves the voucher's lines as they are.
 */
export function pickerOwnsLines(picked: unknown[], loaded: unknown): boolean {
  return picked.length > 0 || nonEmpty(loaded)
}
