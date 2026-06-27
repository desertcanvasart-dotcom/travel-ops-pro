// ============================================
// API: AI MODEL HEALTH CHECK
// ============================================
// GET /api/health/ai-models — probe every configured Anthropic model with a
// minimal request, report green/red per model. The goal is to catch a retired
// or typo'd model ID at deploy time, not from a customer hours later.
//
// Returns 200 with overall='ok' when all models respond, or 503 with
// overall='degraded' if any model fails. Per-model details include the
// purpose, env var (so an operator knows what to override), the resolved
// model ID, and the error class on failure.
//
// AUTH: This is a /api/* route so the existing session middleware applies
// (requires a logged-in operator). The route does NOT bypass auth — a CI/
// deploy check that needs to run without a session should use
// scripts/check-ai-models.mjs, which uses the service-role key locally.
// ============================================

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { ALL_CONFIGURED_MODELS } from '@/lib/ai/models'
import { ALL_CONFIGURED_OPENAI_MODELS } from '@/lib/ai/openai-models'

export const dynamic = 'force-dynamic'

interface ProbeResult {
  provider: 'anthropic' | 'openai'
  purpose: string
  envVar: string
  modelId: string
  ok: boolean
  errorClass?: string
  errorMessage?: string
  latencyMs?: number
}

type ProbeOutcome = { ok: boolean; errorClass?: string; errorMessage?: string; latencyMs: number }

function classifyStatus(status: number | undefined): string {
  if (status === 404) return 'not_found_error'
  if (status === 401) return 'authentication_error'
  if (status === 429) return 'rate_limit_error'
  if (status && status >= 500) return 'service_error'
  if (status === 400) return 'bad_request_error'
  return 'unknown_error'
}

async function probeAnthropic(client: Anthropic, modelId: string): Promise<ProbeOutcome> {
  const t0 = Date.now()
  try {
    await client.messages.create({ model: modelId, max_tokens: 1, messages: [{ role: 'user', content: '.' }] })
    return { ok: true, latencyMs: Date.now() - t0 }
  } catch (err: any) {
    const body = err?.error ?? err?.body ?? null
    return { ok: false, errorClass: classifyStatus(err?.status), errorMessage: body?.error?.message || err?.message || String(err), latencyMs: Date.now() - t0 }
  }
}

async function probeOpenAI(client: OpenAI, modelId: string): Promise<ProbeOutcome> {
  const t0 = Date.now()
  try {
    await client.chat.completions.create({ model: modelId, max_tokens: 1, messages: [{ role: 'user', content: '.' }] })
    return { ok: true, latencyMs: Date.now() - t0 }
  } catch (err: any) {
    return { ok: false, errorClass: classifyStatus(err?.status), errorMessage: err?.error?.message || err?.message || String(err), latencyMs: Date.now() - t0 }
  }
}

export async function GET() {
  const models: ProbeResult[] = []
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY

  // ---- Anthropic ----
  if (!anthropicKey) {
    for (const cfg of ALL_CONFIGURED_MODELS) {
      models.push({ provider: 'anthropic', purpose: cfg.purpose, envVar: cfg.envVar, modelId: cfg.modelId, ok: false, errorClass: 'not_configured', errorMessage: 'ANTHROPIC_API_KEY is not configured' })
    }
  } else {
    const client = new Anthropic({ apiKey: anthropicKey })
    const seen = new Map<string, ProbeOutcome>()
    for (const cfg of ALL_CONFIGURED_MODELS) {
      let probe = seen.get(cfg.modelId)
      if (!probe) { probe = await probeAnthropic(client, cfg.modelId); seen.set(cfg.modelId, probe) }
      models.push({ provider: 'anthropic', purpose: cfg.purpose, envVar: cfg.envVar, modelId: cfg.modelId, ...probe })
    }
  }

  // ---- OpenAI (translation path — core for the bilingual workflow) ----
  if (!openaiKey) {
    for (const cfg of ALL_CONFIGURED_OPENAI_MODELS) {
      models.push({ provider: 'openai', purpose: cfg.purpose, envVar: cfg.envVar, modelId: cfg.modelId, ok: false, errorClass: 'not_configured', errorMessage: 'OPENAI_API_KEY is not configured' })
    }
  } else {
    const client = new OpenAI({ apiKey: openaiKey })
    const seen = new Map<string, ProbeOutcome>()
    for (const cfg of ALL_CONFIGURED_OPENAI_MODELS) {
      let probe = seen.get(cfg.modelId)
      if (!probe) { probe = await probeOpenAI(client, cfg.modelId); seen.set(cfg.modelId, probe) }
      models.push({ provider: 'openai', purpose: cfg.purpose, envVar: cfg.envVar, modelId: cfg.modelId, ...probe })
    }
  }

  const overall = models.length > 0 && models.every((m) => m.ok) ? 'ok' : 'degraded'
  const status = overall === 'ok' ? 200 : 503

  return NextResponse.json(
    { overall, checked_at: new Date().toISOString(), models },
    { status }
  )
}
