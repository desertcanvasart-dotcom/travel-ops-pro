// ============================================
// ANTHROPIC MODEL REGISTRY — single source of truth
// ============================================
// Every Anthropic model ID used by this app is centralized here. Adding a new
// AI feature? Pick the bucket whose tradeoffs match (DRAFT/PARSER/GENERATOR),
// or add a new named export — NEVER inline a 'claude-...' literal in a route
// or library file. The grep `claude-sonnet-4-20250514` outage in June 2026
// hit 11 files for that exact reason.
//
// HOW THIS WORKS:
//   - Each constant has a hardcoded KNOWN-GOOD pin (the value to ship with).
//   - At runtime the constant resolves to `process.env.<ANTHROPIC_MODEL_*>`
//     when set, else the pin. This lets ops swap models per environment
//     (staging Opus, prod Sonnet, single-run override for testing) without
//     a code change.
//   - When Anthropic retires a model, you bump the pin here in ONE place.
//
// CRITICAL — DO NOT auto-discover or "always use the latest model".
//   Model selection stays deliberate, pinned, and reviewed. This file is the
//   pin; the env vars are the override; the health check (/api/health/ai-models)
//   catches retirements at deploy time, not in customer-facing requests.
// ============================================

// Hardcoded known-good pins. Exported as literals so client components can
// import them directly (client bundles don't see process.env).
// When Anthropic retires a model, bump the relevant constant here.
//
// Current as of 2026-06-26 — verify against the model catalog in the
// claude-api skill or platform.claude.com/docs/en/about-claude/models/overview
// before bumping.
export const CLAUDE_SONNET_4_6 = 'claude-sonnet-4-6'
export const CLAUDE_OPUS_4_8 = 'claude-opus-4-8'
export const CLAUDE_HAIKU_4_5 = 'claude-haiku-4-5'

// Internal: read an env var safely (works in both server and client bundles —
// `process` is undefined in browsers, so guard before accessing).
function pin(envName: string, fallback: string): string {
  const v =
    typeof process !== 'undefined' && process.env ? process.env[envName] : undefined
  return v && v.trim() ? v.trim() : fallback
}

// ============================================
// BUCKETS — per-purpose model selection
// ============================================
// If you're adding an AI feature, pick the bucket whose tradeoffs match.
// Adding a new bucket is fine — give it a clear name and document the
// workload shape.

// DEFAULT — fallback for paths that haven't picked a bucket. Used by the
// content-library prompt runner when the request body doesn't specify a model.
export const MODEL_DEFAULT = pin('ANTHROPIC_MODEL_DEFAULT', CLAUDE_SONNET_4_6)

// DRAFT — Copilot reply drafts. Short, conversational, latency-sensitive.
// Read by lib/ai/draft-generator.ts and the drafts route's DB snapshot.
export const MODEL_DRAFT = pin('ANTHROPIC_MODEL_DRAFT', CLAUDE_SONNET_4_6)

// PARSER — structured extraction from messages, files, invoices, pricing grids.
// JSON-schema-constrained workloads. Read by app/api/ai/parse-* and
// app/api/pricing-grid/parse.
export const MODEL_PARSER = pin('ANTHROPIC_MODEL_PARSER', CLAUDE_SONNET_4_6)

// GENERATOR — itinerary task generation and itinerary prompt building.
// Longer reasoning, more context, structured JSON output.
// Read by app/api/itineraries/[id]/generate-tasks and lib/ai/prompt-builder.ts.
export const MODEL_GENERATOR = pin('ANTHROPIC_MODEL_GENERATOR', CLAUDE_SONNET_4_6)

// ============================================
// HEALTH-CHECK REGISTRY
// ============================================
// The list of distinct, configured models the app talks to. The health check
// at /api/health/ai-models and scripts/check-ai-models.mjs probe every entry.
// Each `purpose` is informational — it tells operators which workload would
// break if the corresponding model 404s.

export interface ConfiguredModel {
  purpose: string
  envVar: string
  modelId: string
}

export const ALL_CONFIGURED_MODELS: ConfiguredModel[] = [
  { purpose: 'default', envVar: 'ANTHROPIC_MODEL_DEFAULT', modelId: MODEL_DEFAULT },
  { purpose: 'draft', envVar: 'ANTHROPIC_MODEL_DRAFT', modelId: MODEL_DRAFT },
  { purpose: 'parser', envVar: 'ANTHROPIC_MODEL_PARSER', modelId: MODEL_PARSER },
  { purpose: 'generator', envVar: 'ANTHROPIC_MODEL_GENERATOR', modelId: MODEL_GENERATOR },
]
