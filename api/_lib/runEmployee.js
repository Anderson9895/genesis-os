// Genesis OS AI Workforce — employee runner (P2-3).
//
// This is the "real AI production loop" piece: given a persisted job (title,
// brief, assigned employee) and a provider config, it builds an honest,
// per-employee system prompt from the Genesis OS Employee Playbook and calls
// the runAgent seam to produce a structured deliverable.
//
// Honesty by design:
//   - The employee NEVER claims to have run external tools/websites it did not.
//     The only input is the job brief; the generated work is the output.
//   - It does NOT fake completion when a provider is not configured — callers
//     must check provider configuration BEFORE invoking this runner.
//   - Structured output is requested through a `submitDeliverable` tool, but the
//     default is never to fabricate data on the model's behalf.
//
// This module is a pure engine (no HTTP, no DB). It is injectable for tests via
// the `agentRunner` option so the status/row-shape logic can be unit-tested
// without a live LLM key.
import { runAgent, tool, z } from './agent.js'

// One accurate paragraph per employee, distilled from the Genesis OS Employee
// Playbook. Keyed by the same employee names the roster stores in assigned_employee.
const EMPLOYEE_PROMPTS = {
  'Content & Social Media':
    'You are the Genesis OS Content & Social Media employee. You write on-brand '
    + 'marketing content and social media copy for small businesses and ordinary '
    + 'people: posts, captions, hashtags, blog posts, newsletters, and content '
    + 'calendars built from the customer\u2019s voice and offers. You match the '
    + 'customer\u2019s tone, keep the copy simple and useful, and hand back finished, '
    + 'review-ready material.',
  'Business Research & Sales':
    'You are the Genesis OS Business Research & Sales employee. You help the '
    + 'customer understand their market, customers, competitors, and prospects: '
    + 'market sizing, competitive analysis, pricing validation, customer '
    + 'discovery, and outbound sales research. You organize finds into clear, '
    + 'actionable summaries and flag what still needs human judgment or a '
    + 'database/CRM the customer has not connected.',
  'Software Engineer':
    'You are the Genesis OS Software Engineer. You help the customer reason about '
    + 'and plan technical work in plain language: architecture, code sketches, '
    + 'technical audits, API and database design, and step-by-step build plans '
    + 'for frontend, backend, and deployment. You write in a way a non-programmer '
    + 'can follow and clearly note where real code must be built or tested by an '
    + 'engineer in the customer\u2019s actual environment.',
}

// Global honesty rules every Genesis OS employee follows (from the playbook).
const HONESTY_RULES =
  'Honesty rules you must follow on every job:\n'
  + '1. Say plainly what you can and cannot do. Never pretend to have completed '
  + 'an action you did not actually perform.\n'
  + '2. Report only grounded results. Do not invent transactions, fake outreach, '
  + 'or manufacture urgency.\n'
  + '3. Never claim you searched the web, visited a website, ran code, or queried '
  + 'a live database or CRM \u2014 you have NO access to external tools or the '
  + 'internet in this run. Your ONLY input is the job brief provided below.\n'
  + '4. When professional licensing or human judgment is required (law, tax or '
  + 'accounting advice, medical, legal sign-off), say clearly that a human '
  + 'professional must be involved. Never bluff.\n'
  + '5. Label projections, targets, and forecasts as such. Never present them as '
  + 'actual results.\n'
  + '6. Work entirely from the job brief and your own knowledge. If you cannot '
  + 'satisfy the brief honestly, say so in the deliverable rather than inventing '
  + 'answers.'

/**
 * Build the full system prompt for an employee working one job.
 * @param {string} employeeName e.g. 'Content & Social Media'
 * @param {string} title job title
 * @param {string} brief job brief
 * @returns {string}
 */
export function buildSystemPrompt(employeeName, title, brief) {
  const rolePrompt = EMPLOYEE_PROMPTS[employeeName] || EMPLOYEE_PROMPTS['Software Engineer']
  return [
    `You are ${employeeName}, an AI employee on the Genesis OS workforce.`,
    rolePrompt,
    HONESTY_RULES,
    `The job you are working: "${title}".`,
    `The job brief from the customer is the only input you have:`,
    `---BEGIN BRIEF---\n${brief}\n---END BRIEF---`,
    'Produce the finished work for this job and submit it through the '
    + 'submitDeliverable tool. The title should be a short, human-readable name '
    + 'for the deliverable. The body must contain the actual finished work. The '
    + 'format describes the kind of deliverable (e.g. "report", "content post", '
    + '"technical plan", "markdown"). Do not use external tools \u2014 you have none.',
  ].join('\n')
}

/**
 * Pull the structured deliverable out of an agent run result. Looks for the
 * submitDeliverable tool call in the tool-calling steps; falls back to the plain
 * generated text if no tool call was produced.
 * @param {object} result runAgent result ({ text, steps, ... })
 * @returns {{title:string,body:string,format:string}|null}
 */
export function extractDeliverable(result) {
  const steps = Array.isArray(result?.steps) ? result.steps : []

  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const calls = steps[i]?.toolCalls
    if (!Array.isArray(calls) || calls.length === 0) continue

    const call = [...calls]
      .reverse()
      .find((c) => c?.toolName === 'submitDeliverable' && c?.args && typeof c.args === 'object')

    if (call) {
      return {
        title: String(call.args.title || '').trim() || 'Deliverable',
        body: String(call.args.body || '').trim(),
        format: String(call.args.format || '').trim() || 'markdown',
      }
    }
  }

  const text = String(result?.text || '').trim()
  if (text) {
    return { title: 'Deliverable', body: text, format: 'markdown' }
  }
  return null
}

/**
 * Run one assigned employee on one job and return a structured deliverable.
 *
 * @param {object} opts
 * @param {object} opts.job the job row (must include title, brief, assigned_employee)
 * @param {string} [opts.provider] 'openai' | 'anthropic' (must be configured)
 * @param {string} [opts.model] optional model id
 * @param {Function} [opts.agentRunner] injectable runAgent for tests
 * @returns {Promise<{title:string, body:string, format:string, text:string, usage:object}>}
 * @throws {Error} when the agent run fails or produces no deliverable.
 */
export async function runEmployeeOnJob({ job, provider = 'openai', model, agentRunner = runAgent }) {
  const employee = String(job?.assigned_employee || '').trim()
  const title = String(job?.title || '').trim() || 'Untitled job'
  const brief = String(job?.brief || '').trim() || ''

  if (!employee) {
    throw new Error('This job has no employee assigned, so no employee can work it yet.')
  }

  const system = buildSystemPrompt(employee, title, brief)

  const submitDeliverable = tool({
    description:
      'Submit the finished deliverable for this job. Returns a confirmation.',
    inputSchema: z.object({
      title: z
        .string()
        .describe('Short, human-readable name for the finished deliverable.'),
      body: z
        .string()
        .describe(
          'The actual finished work for the job. Produced from the job brief only '
          + '\u2014 never invent external data you cannot see.'
        ),
      format: z
        .string()
        .describe('The kind of deliverable, e.g. "report", "content post", "technical plan".'),
      summary: z
        .string()
        .describe('A 1\u20132 sentence plain-language summary of what was produced.'),
    }),
    execute: async ({ title: t, body, format, summary }) => ({ ok: true, t, body, format, summary }),
  })

  const result = await agentRunner({
    provider,
    model: model || undefined,
    system,
    tools: { submitDeliverable },
    messages: [{ role: 'user', content: brief }],
    maxSteps: 12,
  })

  const deliverable = extractDeliverable(result)
  if (!deliverable || !deliverable.body) {
    throw new Error('The employee did not produce usable work for this job.')
  }

  return {
    ...deliverable,
    text: String(result?.text || '').trim(),
    usage: result?.usage || {},
  }
}
