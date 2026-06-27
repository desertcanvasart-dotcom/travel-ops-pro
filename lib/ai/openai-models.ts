// ============================================
// OPENAI MODEL REGISTRY — single source of truth
// ============================================
// Mirror of lib/ai/models.ts (the Anthropic registry), same conventions. Every
// OpenAI model ID the app uses is centralized here. NEVER inline a 'gpt-...'
// literal in a route or library file — the June 2026 Anthropic retirement
// silently broke AI features for 11 days for exactly that reason, and the
// OpenAI translation path (core to the EN/JA content-sync workflow) carries the
// same time-bomb on a different provider.
//
// HOW THIS WORKS (identical to the Anthropic registry):
//   - Each constant has a hardcoded KNOWN-GOOD pin (the value to ship with).
//   - At runtime it resolves to process.env.<OPENAI_MODEL_*> when set, else the
//     pin — lets ops swap models per environment without a code change.
//   - When OpenAI retires a model, bump the pin here in ONE place.
//   - The health check (/api/health/ai-models + scripts/check-ai-models.mjs)
//     probes every entry and catches a retirement at deploy time, not in a
//     customer-facing translation request.
//
// CRITICAL — DO NOT auto-discover or "always use the latest model". Selection
// stays deliberate, pinned, and reviewed.
// ============================================

import type { ConfiguredModel } from './models'

// Hardcoded known-good pins. Exported as literals so client components (e.g.
// the content-library prompt model picker) can import them directly.
//
// Current + verified valid as of 2026-06-27 (live-probed both: 200 OK).
// When OpenAI retires a model, bump the relevant constant here.
export const GPT_4O = 'gpt-4o'
export const GPT_4O_MINI = 'gpt-4o-mini'

// Internal: read an env var safely (works in both server and client bundles).
function pin(envName: string, fallback: string): string {
  const v =
    typeof process !== 'undefined' && process.env ? process.env[envName] : undefined
  return v && v.trim() ? v.trim() : fallback
}

// ============================================
// BUCKETS — per-purpose model selection
// ============================================

// TRANSLATION — the EN/JA content translation route (app/api/translate). Used
// for both single and batch translation. CORE for the bilingual two-office
// workflow: if this model 404s, content stops syncing between Cairo and Japan.
export const OPENAI_TRANSLATION_MODEL = pin('OPENAI_MODEL_TRANSLATION', GPT_4O)

// MINI — cheaper bucket referenced by lib/translate.ts (currently unused — see
// the OpenAI-surface note in the registry README/report) and offered as an
// option in the content-library prompt model picker.
export const OPENAI_MINI_MODEL = pin('OPENAI_MODEL_MINI', GPT_4O_MINI)

// ============================================
// HEALTH-CHECK REGISTRY
// ============================================
// The distinct configured OpenAI models the app talks to. Probed by the same
// health check that covers Anthropic. Reuses the ConfiguredModel shape so the
// route + CLI can iterate Anthropic and OpenAI uniformly.
export const ALL_CONFIGURED_OPENAI_MODELS: ConfiguredModel[] = [
  { purpose: 'translation', envVar: 'OPENAI_MODEL_TRANSLATION', modelId: OPENAI_TRANSLATION_MODEL },
  { purpose: 'mini', envVar: 'OPENAI_MODEL_MINI', modelId: OPENAI_MINI_MODEL },
]
