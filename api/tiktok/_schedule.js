// Genesis OS — Daily scheduling controller.
//
// Enforces the campaign posting policy:
//   * One approved campaign video per day at the owner-configured time.
//   * A day with no approved+scheduled video is marked "needs approval" — never
//     post filler.
//   * Never post the same record twice (guarded by publish_id / terminal status).
//
// This endpoint computes the assignment for the next N days and reports which
// records are queued vs days needing approval. It never triggers an external
// post by itself: actual publishing is further gated on the owner enabling
// daily_auto_publish AND TikTok being connected AND the client passing audit.

import { json } from '../_lib/http.js'
import { requireTikTokUser, getTikTokConfig } from './_lib.js'
import { loadSettings } from './_settings.js'

const CAMPAIGN_KEY = '6000-strangers-one-question'
const DAILY_TARGET = '16:00'

function dayKey(date) {
  return date.toISOString().slice(0, 10)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' })
  const auth = await requireTikTokUser(req)
  if (auth.error) return json(res, auth.status, { error: auth.error })
  const { user, client } = auth

  const settingsResult = await loadSettings(client, user.id)
  const settings = settingsResult.ok ? settingsResult.settings : {}
  const dailyTime = settings.daily_time_utc || DAILY_TARGET

  const { data: posts, error } = await client
    .from('tiktok_posts')
    .select('*')
    .eq('user_id', user.id)
    .eq('campaign_key', CAMPAIGN_KEY)
    .order('scheduled_for', { ascending: true })
  if (error) {
    return json(res, 500, { error: error.message, note: 'Apply the tiktok_posts migration if the table does not exist.' })
  }

  const daysAhead = Math.min(Math.max(Number(req.query?.days || 14), 1), 90)
  const calendar = []
  const now = new Date()
  for (let i = 0; i < daysAhead; i += 1) {
    const date = new Date(now.getTime() + i * 86400000)
    const target = new Date(`${dayKey(date)}T${dailyTime}:00.000Z`)
    // An approved campaign video scheduled for this calendar day.
    const candidates = (posts || []).filter((post) => {
      if (!post.owner_approved || !post.scheduled_for) return false
      return dayKey(new Date(post.scheduled_for)) === dayKey(target)
    })
    const alreadyPosted = (posts || []).filter((post) => {
      return dayKey(new Date(post.scheduled_for)) === dayKey(target)
        && ['published', 'private_only', 'uploading', 'processing'].includes(post.status)
    })
    if (alreadyPosted.length) {
      calendar.push({ date: dayKey(date), status: alreadyPosted[0].status, post: alreadyPosted[0], note: 'A post already occupies this day.' })
    } else {
      const chosen = candidates[0] || null
      calendar.push({
        date: dayKey(date),
        status: chosen ? 'scheduled' : 'needs_approval',
        post: chosen,
        note: chosen
          ? `Approved video scheduled. Daily time ${dailyTime} UTC.`
          : 'No approved video for this day — marked needs approval. No filler is posted.',
      })
    }
  }

  const config = getTikTokConfig()
  const publicUnlocked = config.vault?.configured && config.auditApproved
  return json(res, 200, {
    settings,
    daily_target_utc: dailyTime,
    daily_auto_publish_enabled: Boolean(settings.daily_auto_publish_enabled),
    public_posting_unlocked: publicUnlocked,
    auto_publish_can_run: publicUnlocked && Boolean(settings.daily_auto_publish_enabled),
    calendar,
    note: 'Auto-publish only runs when daily_auto_publish_enabled is true AND TikTok is connected AND the client has passed audit. Scheduling here never, by itself, posts externally.',
  })
}
