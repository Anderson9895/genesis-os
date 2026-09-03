export async function loadTeamContext(client, userId) {
  const results = await Promise.all([
    client.from('hq_journal').select('title,body,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(12),
    client.from('jobs').select('id,title,assigned_employee,status').eq('user_id', userId).order('created_at', { ascending: false }).limit(30),
    client.from('deliverables').select('job_id,title,content,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(6),
  ])
  if (results.some((result) => result.error)) throw new Error('Could not load shared team history. No AI run was started.')
  return {
    journal: results[0].data.map((entry) => ({ ...entry, body: entry.body.slice(0, 2500) })),
    jobs: results[1].data,
    deliverables: results[2].data.map((entry) => ({ ...entry, content: JSON.stringify(entry.content).slice(0, 3000) })),
  }
}
