// ============================================
// The office's answer to a seat hold
// ============================================
// A website order holds seats on its date's departure as a PENDING
// departure_bookings row (hold_departure_seats). Nothing ever moved one on:
// no route or screen changed a hold's status, so a hold whose quote was lost
// kept its seats for good, and a departure with one could never be deleted
// ("Cancel bookings first", with nowhere to cancel). The departure page now
// lists its holds with Confirm and Release.
//
//   confirm  pending → confirmed   the seats are sold; still counted
//   release  pending or confirmed → cancelled   the seats are free again
//
// A cancelled hold stays cancelled (a new order makes a new hold), and a
// cancelled departure takes no new confirmations.

export type HoldAction = 'confirm' | 'release'

export function holdTransition(
  action: unknown,
  holdStatus: string | null | undefined,
  departureStatus: string | null | undefined,
): { from: string; to: 'confirmed' | 'cancelled' } | { error: string; status: number } {
  if (action !== 'confirm' && action !== 'release') {
    return { error: "action must be 'confirm' or 'release'", status: 400 }
  }
  if (holdStatus === 'cancelled') {
    return { error: 'This hold was already released', status: 409 }
  }
  if (action === 'confirm') {
    if (holdStatus === 'confirmed') return { error: 'This hold is already confirmed', status: 409 }
    if (departureStatus === 'cancelled') return { error: 'The departure is cancelled — release the hold instead', status: 409 }
    return { from: 'pending', to: 'confirmed' }
  }
  return { from: String(holdStatus), to: 'cancelled' }
}
