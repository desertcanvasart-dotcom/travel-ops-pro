// ============================================
// Expense categories, and which suppliers each one is paid to
// ============================================
// One list for every expense form (the itinerary's Add Expense, the Expenses
// page). `supplierTypes` are supplier-type keys (lib/supplier-types; the
// suppliers API widens each to the agency's own types that behave like it):
// the form lists the suppliers that fill one of those roles — the
// restaurants for a meal, the hotels for accommodation — instead of a blank
// name box. Categories with none (tips, fuel, office…) keep free text.
//
// Labels live in messages/*.json under expenseModal.categories.<value>.

export interface ExpenseCategory {
  value: string
  icon: string
  supplierTypes: string[]
  /** Only on the general Expenses page (not tied to a trip). */
  overhead?: boolean
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { value: 'guide', icon: '👨‍🏫', supplierTypes: ['guide'] },
  { value: 'driver', icon: '🚗', supplierTypes: ['driver', 'transport'] },
  { value: 'hotel', icon: '🏨', supplierTypes: ['hotel'] },
  { value: 'cruise', icon: '🚢', supplierTypes: ['cruise'] },
  { value: 'transportation', icon: '🚐', supplierTypes: ['transport', 'driver', 'train_operator'] },
  { value: 'flights', icon: '🛫', supplierTypes: ['air_carrier'] },
  { value: 'entrance', icon: '🎫', supplierTypes: ['attraction', 'activity_provider'] },
  { value: 'meal', icon: '🍽️', supplierTypes: ['restaurant'] },
  { value: 'activity', icon: '🎈', supplierTypes: ['activity_provider', 'tour_operator', 'local_operator'] },
  { value: 'airport_staff', icon: '✈️', supplierTypes: ['airport_assistant', 'ground_handler'] },
  { value: 'hotel_staff', icon: '🛎️', supplierTypes: ['hotel_assistant', 'hotel'] },
  { value: 'ground_handler', icon: '🧳', supplierTypes: ['ground_handler'] },
  { value: 'tipping', icon: '💵', supplierTypes: [] },
  { value: 'permits', icon: '📋', supplierTypes: [] },
  { value: 'toll', icon: '🛣️', supplierTypes: [] },
  { value: 'parking', icon: '🅿️', supplierTypes: [] },
  { value: 'fuel', icon: '⛽', supplierTypes: [] },
  { value: 'office', icon: '🏢', supplierTypes: [], overhead: true },
  { value: 'marketing', icon: '📢', supplierTypes: [], overhead: true },
  { value: 'software', icon: '💻', supplierTypes: [], overhead: true },
  { value: 'other', icon: '📦', supplierTypes: [] },
]

/** The trip-related categories (the itinerary's Add Expense). */
export const TRIP_EXPENSE_CATEGORIES = EXPENSE_CATEGORIES.filter(c => !c.overhead)

export function expenseCategory(value: string): ExpenseCategory | undefined {
  return EXPENSE_CATEGORIES.find(c => c.value === value)
}

/** The supplier-type keys whose suppliers an expense of this category is paid to. */
export function supplierTypesForCategory(value: string): string[] {
  return expenseCategory(value)?.supplierTypes ?? []
}
