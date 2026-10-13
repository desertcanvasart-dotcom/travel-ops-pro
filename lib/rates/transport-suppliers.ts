// ============================================
// Who can be a transportation rate's transport company
// ============================================
// The Transportation Rates form listed suppliers whose PRIMARY type was
// transport, local_operator or driver. A supplier is filed under several
// roles (`types`, the first of which is `type`), and an agency adds its own
// types in Settings → Vocabulary → Supplier types with a behaviour — so a
// coach company filed "hotel, transport", or a type "coach_operator" that
// behaves as a transport company, never appeared. Flights moved to `types`
// already (air_carrier).
//
// A supplier qualifies when ANY of its roles is one of the three built-ins
// the form always took, or behaves like a transport company or a driver.

/** The built-in roles the form has always offered. */
export const TRANSPORT_SUPPLIER_ROLES = ['transport', 'local_operator', 'driver'] as const

/** The behaviours an agency-added role is offered under. */
export const TRANSPORT_SUPPLIER_BEHAVIOURS = ['transport_company', 'driver'] as const

type SupplierRoles = { type?: string | null; types?: readonly string[] | null }

export function isTransportSupplier(
  supplier: SupplierRoles,
  /** useSupplierTypes().hasBehaviour — resolves an agency type's behaviour. */
  hasBehaviour: (supplier: SupplierRoles, behaviour: string) => boolean
): boolean {
  const roles = supplier.types?.length ? supplier.types : supplier.type ? [supplier.type] : []
  if (roles.some(r => (TRANSPORT_SUPPLIER_ROLES as readonly string[]).includes(r))) return true
  return TRANSPORT_SUPPLIER_BEHAVIOURS.some(b => hasBehaviour(supplier, b))
}
