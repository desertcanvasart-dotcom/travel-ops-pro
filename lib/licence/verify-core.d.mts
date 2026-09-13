export type LicenceStatus = 'valid' | 'grace' | 'expired' | 'invalid' | 'missing'

export interface LicencePayload {
  /** Licence id — the key everything joins on. */
  lid: string
  /** The legal entity, as it will be printed. */
  licensee: string
  org_key: string
  /** Hostnames the install may answer on. */
  domains: string[]
  /** Staff accounts; a soft limit, reported not enforced. */
  seats: number
  features: string[]
  issued: string
  valid_until: string
  grace_days: number
  /** Which public key signed it (rotation). */
  kid: string
}

export interface LicenceResult {
  status: LicenceStatus
  licence: LicencePayload | null
  /** A human sentence for Settings, the boot log and doctor. */
  reason: string
  /** Days until expiry (the last valid day reads 1); 0 or negative once
   *  past; null when there is no verified licence. */
  daysLeft: number | null
}

export const LICENCE_FORMAT: 'AUT1'
export const LICENCE_STATUSES: readonly LicenceStatus[]
export const PAYLOAD_FIELDS: readonly (keyof LicencePayload)[]

export function payloadProblem(payload: unknown): string | null
export function parseLicence(token: unknown):
  | { error: string; payload?: undefined }
  | { error?: undefined; payload: LicencePayload; signedPart: string; signature: Buffer }
export function verifyLicence(token: unknown, now?: Date | number, publicKeys?: Record<string, string>): LicenceResult
export function licenceSummary(result: LicenceResult): string
export function mintLicence(payload: LicencePayload, privateKeyPem: string): string
export function generateSigningKeyPair(): { privateKeyPem: string; publicKeyPem: string }
