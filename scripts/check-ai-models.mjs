#!/usr/bin/env node
// ============================================
// AI MODEL HEALTH CHECK — CLI
// ============================================
// Probes every model configured in lib/ai/models.ts with a minimal request.
// Exits 0 if all green, 1 if any model 404s / errors. Use in CI / pre-deploy
// checks where you don't have a logged-in session for /api/health/ai-models.
//
// Usage:
//   node scripts/check-ai-models.mjs
//
// Reads ANTHROPIC_API_KEY and any ANTHROPIC_MODEL_* overrides from .env.local
// (same precedence as the running app: env var wins over the hardcoded pin).
//
// IMPORTANT: This script mirrors lib/ai/models.ts but does not import it
// (the TS file uses path aliases). Pins MUST be kept in sync — if you bump
// a model in lib/ai/models.ts, bump it here too. The set is small.
// ============================================

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

// ---- env loader (matches phase0-fire-concierge-test.mjs) ----
function loadEnvLocal() {
  const path = resolve(repoRoot, '.env.local')
  const text = readFileSync(path, 'utf8')
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    const [, k, vRaw] = m
    const v = vRaw.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
    if (!process.env[k]) process.env[k] = v
  }
}

// Mirror of lib/ai/models.ts — keep these in sync.
const KNOWN_GOOD_FALLBACKS = {
  default: 'claude-sonnet-4-6',
  draft: 'claude-sonnet-4-6',
  parser: 'claude-sonnet-4-6',
  generator: 'claude-sonnet-4-6',
}

function pin(envName, fallback) {
  const v = process.env[envName]
  return v && v.trim() ? v.trim() : fallback
}

function loadConfiguredModels() {
  return [
    { provider: 'anthropic', purpose: 'default', envVar: 'ANTHROPIC_MODEL_DEFAULT', modelId: pin('ANTHROPIC_MODEL_DEFAULT', KNOWN_GOOD_FALLBACKS.default) },
    { provider: 'anthropic', purpose: 'draft', envVar: 'ANTHROPIC_MODEL_DRAFT', modelId: pin('ANTHROPIC_MODEL_DRAFT', KNOWN_GOOD_FALLBACKS.draft) },
    { provider: 'anthropic', purpose: 'parser', envVar: 'ANTHROPIC_MODEL_PARSER', modelId: pin('ANTHROPIC_MODEL_PARSER', KNOWN_GOOD_FALLBACKS.parser) },
    { provider: 'anthropic', purpose: 'generator', envVar: 'ANTHROPIC_MODEL_GENERATOR', modelId: pin('ANTHROPIC_MODEL_GENERATOR', KNOWN_GOOD_FALLBACKS.generator) },
  ]
}

// Mirror of lib/ai/openai-models.ts — keep in sync.
const OPENAI_FALLBACKS = { translation: 'gpt-4o', mini: 'gpt-4o-mini' }
function loadConfiguredOpenAIModels() {
  return [
    { provider: 'openai', purpose: 'translation', envVar: 'OPENAI_MODEL_TRANSLATION', modelId: pin('OPENAI_MODEL_TRANSLATION', OPENAI_FALLBACKS.translation) },
    { provider: 'openai', purpose: 'mini', envVar: 'OPENAI_MODEL_MINI', modelId: pin('OPENAI_MODEL_MINI', OPENAI_FALLBACKS.mini) },
  ]
}

async function probeOpenAI(client, modelId) {
  const t0 = Date.now()
  try {
    await client.chat.completions.create({ model: modelId, max_tokens: 1, messages: [{ role: 'user', content: '.' }] })
    return { ok: true, latencyMs: Date.now() - t0 }
  } catch (err) {
    const status = err?.status
    let errorClass = 'unknown_error'
    if (status === 404) errorClass = 'not_found_error'
    else if (status === 401) errorClass = 'authentication_error'
    else if (status === 429) errorClass = 'rate_limit_error'
    else if (status >= 500) errorClass = 'service_error'
    else if (status === 400) errorClass = 'bad_request_error'
    return { ok: false, errorClass, errorMessage: err?.error?.message || err?.message || String(err), status, latencyMs: Date.now() - t0 }
  }
}

async function probeModel(client, modelId) {
  const t0 = Date.now()
  try {
    await client.messages.create({
      model: modelId,
      max_tokens: 1,
      messages: [{ role: 'user', content: '.' }],
    })
    return { ok: true, latencyMs: Date.now() - t0 }
  } catch (err) {
    const status = err?.status
    const body = err?.error ?? err?.body ?? null
    let errorClass = 'unknown_error'
    if (status === 404) errorClass = 'not_found_error'
    else if (status === 401) errorClass = 'authentication_error'
    else if (status === 429) errorClass = 'rate_limit_error'
    else if (status >= 500) errorClass = 'service_error'
    else if (status === 400) errorClass = 'bad_request_error'
    return {
      ok: false,
      errorClass,
      errorMessage: body?.error?.message || err?.message || String(err),
      status,
      latencyMs: Date.now() - t0,
    }
  }
}

async function main() {
  loadEnvLocal()

  console.log('--- AI model health check ---')
  console.log('checked_at:', new Date().toISOString())
  console.log()

  const results = []

  // ---- Anthropic ----
  const anthropicConfigured = loadConfiguredModels()
  if (!process.env.ANTHROPIC_API_KEY) {
    for (const cfg of anthropicConfigured) results.push({ ...cfg, ok: false, errorClass: 'not_configured', errorMessage: 'ANTHROPIC_API_KEY is not configured' })
  } else {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const seen = new Map()
    for (const cfg of anthropicConfigured) {
      let probe = seen.get(cfg.modelId)
      if (!probe) { probe = await probeModel(client, cfg.modelId); seen.set(cfg.modelId, probe) }
      results.push({ ...cfg, ...probe })
    }
  }

  // ---- OpenAI ----
  const openaiConfigured = loadConfiguredOpenAIModels()
  if (!process.env.OPENAI_API_KEY) {
    for (const cfg of openaiConfigured) results.push({ ...cfg, ok: false, errorClass: 'not_configured', errorMessage: 'OPENAI_API_KEY is not configured' })
  } else {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const seen = new Map()
    for (const cfg of openaiConfigured) {
      let probe = seen.get(cfg.modelId)
      if (!probe) { probe = await probeOpenAI(client, cfg.modelId); seen.set(cfg.modelId, probe) }
      results.push({ ...cfg, ...probe })
    }
  }

  for (const row of results) {
    const marker = row.ok ? 'OK  ' : 'FAIL'
    const status = row.ok ? `${row.latencyMs}ms` : `${row.errorClass}${row.status ? ` (${row.status})` : ''}`
    console.log(`${marker}  [${row.provider}/${row.purpose}]  ${row.modelId}  ${status}`)
    if (!row.ok) {
      console.log(`      reason: ${row.errorMessage}`)
      console.log(`      override env var: ${row.envVar}`)
    }
  }

  const allOk = results.length > 0 && results.every((r) => r.ok)
  console.log()
  console.log(allOk ? '--- overall: ok ---' : '--- overall: degraded ---')
  process.exit(allOk ? 0 : 1)
}

main().catch((e) => {
  console.error('FATAL:', e?.message || e)
  process.exit(99)
})
