// Client-safe supplier-field constants.
//
// Kept SEPARATE from validate-supplier-fields.ts on purpose: that module is
// server-only (it imports server-messages → next/headers), so client components
// must not import from it. They import the sentinel from HERE instead, which has
// no server dependencies and is safe in the browser bundle.

// Sentinel for the "no supplier / direct" option in supplier dropdowns.
export const NO_SUPPLIER_SENTINEL = '__none__'
