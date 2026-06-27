// Gated debug logging for hot server paths (pricing engine, itinerary generation).
//
// These paths logged 50–80 lines on EVERY quote/generation — internal cost and
// rate data included — which is noise (and a minor perf cost) in production.
// Routing them through `debugLog` means they only print when PRICING_DEBUG=true.
// console.error / console.warn are intentionally NOT gated — real failures should
// always surface.
const PRICING_DEBUG = process.env.PRICING_DEBUG === 'true'

export const debugLog: (...args: any[]) => void = PRICING_DEBUG
  ? (...args: any[]) => console.log(...args)
  : () => {}
