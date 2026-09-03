import test from 'node:test'
import assert from 'node:assert/strict'
import { TEAM } from '../shared/team.js'
import { isKnownEmployee, pickEmployeeFromBrief } from '../api/_lib/workforce.js'
import { buildSystemPrompt, runEmployeeOnJob } from '../api/_lib/runEmployee.js'
import { loadTeamContext } from '../api/_lib/teamContext.js'

test('all 13 new roles have distinct identities and real runner instructions', () => {
  assert.equal(TEAM.length, 13)
  assert.equal(new Set(TEAM.map(a => a.id)).size, 13)
  for (const role of TEAM) {
    assert.ok(isKnownEmployee(role.name))
    const prompt = buildSystemPrompt(role.name, 'Test assignment', role.firstAssignment, { journal: [{body: 'Agreed shared decision'}] })
    assert.ok(prompt.includes(role.mission))
    assert.ok(prompt.includes('Agreed shared decision'))
    assert.ok(prompt.includes('No external actions'))
  }
  assert.throws(() => buildSystemPrompt('Made up role', 'x', 'y'), /Unknown employee/)
})

test('platform assignments route to the platform specialist', () => {
  assert.equal(pickEmployeeFromBrief('Build an Etsy listing'), 'Etsy Manager')
  assert.equal(pickEmployeeFromBrief('Plan Shopify products'), 'Shopify Manager')
  assert.equal(pickEmployeeFromBrief('YouTube marketing script'), 'YouTube Manager')
  assert.equal(pickEmployeeFromBrief('Customer support complaint'), 'Customer Support')
})

test('runner passes shared context and reads current SDK structured tool output', async () => {
  const result = await runEmployeeOnJob({
    job: { assigned_employee: 'AI Boss', title: 'Plan', brief: 'Prepare next steps' },
    sharedContext: { journal: [{ body: 'First business only' }] },
    agentRunner: async ({ system, tools }) => {
      assert.ok(system.includes('First business only'))
      assert.deepEqual(Object.keys(tools), ['submitDeliverable'])
      return { steps: [{ toolCalls: [{ toolName: 'submitDeliverable', input: { title: 'Next steps', body: 'Review the product brief.', format: 'plan' } }] }] }
    },
  })
  assert.equal(result.body, 'Review the product brief.')
})

test('failed shared history blocks the run instead of silently dropping context', async () => {
  const query = { select() { return this }, eq() { return this }, order() { return this }, limit() { return Promise.resolve({ error: { message: 'unavailable' }, data: null }) } }
  await assert.rejects(loadTeamContext({ from: () => query }, 'user'), /No AI run was started/)
})
