// ============================================
// Autoura licence public keys
// ============================================
// kid → Ed25519 public key (SPKI PEM). A licence names the kid that signed
// it; verify-core.mjs looks the key up here. Being readable is fine — forging
// a licence needs the PRIVATE half, which lives in Autoura's password manager
// and is never on a server.
//
// Rotation is ADDING a key under a new kid (scripts/mint-licence.mjs keygen
// writes the entry). Never remove a kid that a live licence still names: the
// install would report its licence as "signed with a key this build does not
// know" on its next boot.
//
// Empty until the first keygen: every LICENSE_KEY then reads as invalid,
// and an install without one is an unlicensed evaluation — both harmless.

export const PUBLIC_KEYS = {
}
