// ============================================
// Canonical rate-resolution surface (consolidation Phase A)
// ============================================
// THE single import path for "look up a rate" across the app. Every pricing
// surface — the bespoke grid, the B2B rate sheet, the AI quote builder — and any
// route that needs a rate should import from HERE, never reimplement lookups.
//
// The hardened implementations live in lib/auto-pricing-service.ts (harness
// Layer 1: every lookup returns a real rate or null — it NEVER fabricates a
// default or substitutes a fuzzy match). This module re-exports them as the
// stable canonical surface so consumers don't depend on the engine file
// directly and a future physical relocation is a no-op for callers.
//
// See PRICING-CONSOLIDATION-PLAN.md (Phase A) and PRICING-HARNESS-PLAN.md.

export {
  // Accommodation
  getHotelRates,
  getCruiseRates,
  // Per-day services
  getGuideRate,
  getMealRates,
  getTippingRate,
  getAirportServiceRate,
  getHotelServiceRate,
  // Per-person
  getEntranceFee,
  // Transport
  buildTransportCache,
  findTransportRate,
  fetchCruiseTransportPricingRules,
  findCruiseTransportRule,
  getCruiseTransportRate,
  calculateCruisePackageInfo,
  // Transport helpers
  getVehicleTypeByPax,
  determineTransportNeeds,
  getAirportCode,
  getTierCategory,
  // Itinerary parsing (shared by intake adapters / surfaces)
  parseItinerary,
} from '@/lib/auto-pricing-service'

export type {
  ServiceTier,
  AccommodationType,
  MealStatus,
  VehicleType,
  TransportServiceType,
  TransportDuration,
  TransportArea,
} from '@/lib/auto-pricing-service'

// Provenance + hole types live in the harness types module.
export type { RateSource, PricingHole, HoleKind } from '@/lib/pricing-types'
