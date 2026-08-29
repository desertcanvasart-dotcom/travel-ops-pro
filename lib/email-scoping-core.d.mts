// Typed surface of lib/email-scoping-core.mjs — see lib/support/bundle-core.d.mts
// for why the implementation is plain JS.
export interface EmailClassifierInput {
  counterpartyEmail: string
  headers?: Record<string, string>
  labelIds?: string[]
}
export declare const MACHINE_LOCAL_PART: RegExp
export declare function looksAutomated(input: EmailClassifierInput): boolean
export declare function shouldStoreThread(input: EmailClassifierInput, isKnownContact: boolean): boolean
