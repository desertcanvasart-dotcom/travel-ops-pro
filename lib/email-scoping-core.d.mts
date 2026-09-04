// Typed surface of lib/email-scoping-core.mjs — see lib/support/bundle-core.d.mts
// for why the implementation is plain JS.
export interface EmailClassifierInput {
  counterpartyEmail: string
  headers?: Record<string, string>
  labelIds?: string[]
  /** Subject and opening text: the website's order form names itself there,
   *  and is correspondence whatever its sender's local part says. */
  subject?: string
  snippet?: string
}
export declare const MACHINE_LOCAL_PART: RegExp
export declare const ORDER_FORM_MARKERS: RegExp
export declare function looksLikeOrderForm(input: Pick<EmailClassifierInput, 'subject' | 'snippet'> | null | undefined): boolean
export declare function looksAutomated(input: EmailClassifierInput): boolean
export declare function shouldStoreThread(input: EmailClassifierInput, isKnownContact: boolean): boolean
