// Genesis OS AI Workforce — agent seam (P2-1 foundation).
//
// Isolated, additive module built on the Vercel AI SDK. It registers the
// OpenAI and Anthropic providers from the SAME server env keys the existing
// providers.js uses (OPENAI_API_KEY / ANTHROPIC_API_KEY) and exposes a single
// `runAgent({ system, tools, messages })` helper for in-repo AI employees to
// call tools and return finished work to the Genesis Team Lead.
//
// This module intentionally does NOT import or modify api/_lib/providers.js or
// api/ai/chat.js — the existing non-streaming chat path is left untouched.
// P2-2/P2-3 will plug /api/jobs and the employee loop into this seam.

import { generateText, tool as defineTool } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'

const openaiKey = String(process.env.OPENAI_API_KEY || '').trim()
const anthropicKey = String(process.env.ANTHROPIC_API_KEY || '').trim()

// Lazy singletons: only instantiate a provider client if its key is present.
const openai = openaiKey ? createOpenAI({ apiKey: openaiKey }) : null
const anthropic = anthropicKey ? createAnthropic({ apiKey: anthropicKey }) : null

const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
}

/**
 * Whether a given provider has an API key configured for the AI Workforce.
 * @param {string} provider 'openai' | 'anthropic'
 * @returns {boolean}
 */
export function isAgentProviderConfigured(provider) {
  const normalized = String(provider || '').toLowerCase()
  if (normalized === 'anthropic') return Boolean(anthropic)
  return Boolean(openai)
}

/**
 * List the provider ids currently configured for the AI Workforce.
 * @returns {string[]} e.g. ['openai', 'anthropic']
 */
export function getConfiguredAgentProviders() {
  const providers = []
  if (openai) providers.push('openai')
  if (anthropic) providers.push('anthropic')
  return providers
}

/**
 * Convenience wrapper around the AI SDK `tool()` so the agent seam re-exports
 * `tool` alongside `z` for callers to define typed tools. Accepts either the
 * SDK's `{ description, inputSchema, execute }` shape or a plain function that
 * is treated as `execute`.
 *
 * @param {object} definition tool definition (description, inputSchema, execute)
 */
export function tool(definition) {
  return defineTool(definition)
}

/**
 * Run an AI employee agent with optional tool-calling across either provider.
 *
 * @param {object} opts
 * @param {string} [opts.provider] 'openai' (default) | 'anthropic'
 * @param {string} [opts.model] model id; falls back to the provider default
 * @param {string} [opts.system] system prompt (role / mission of the employee)
 * @param {Record<string, import('ai').Tool>} [opts.tools] tools the agent may call
 * @param {Array<{role:string,content:string}>} [opts.messages] conversation messages
 * @param {number} [opts.maxSteps] max tool-calling/turn steps (default 8)
 * @returns {Promise<{text:string, usage:object, steps:Array}>}
 */
export async function runAgent({
  provider = 'openai',
  model,
  system,
  tools = {},
  messages = [],
  maxSteps = 8,
}) {
  const normalizedProvider = String(provider || '').toLowerCase()
  const client = normalizedProvider === 'anthropic' ? anthropic : openai

  if (!client) {
    throw new Error(
      `Genesis AI Workforce: provider '${normalizedProvider}' is not configured (missing API key).`
    )
  }

  const resolvedModel =
    String(model || '').trim() || DEFAULT_MODELS[normalizedProvider] || DEFAULT_MODELS.openai

  const result = await generateText({
    model: client(resolvedModel),
    system,
    tools,
    messages,
    maxSteps,
  })

  const inputTokens = result?.usage?.inputTokens ?? 0
  const outputTokens = result?.usage?.outputTokens ?? 0

  return {
    text: result?.text ?? '',
    usage: {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    },
    steps: result?.steps ?? [],
  }
}

export { z }
