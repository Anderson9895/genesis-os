// Genesis OS — Render controller (mock, clearly labeled).
//
// POST /api/tiktok/render  { id }
// Loads an owner-authenticated tiktok_posts record and runs the renderer into
// the approved package. Because the renderer is a clearly-labeled MOCK (no real
// ffmpeg/lib installed), this endpoint returns the mock result and does NOT
// change the post status to "rendered" — claiming a render we did not perform
// would be dishonest. It truthfully reports rendered:false.

import { json, getRequestBody } from '../_lib/http.js'
import { requireTikTokUser } from './_lib.js'
import { renderCampaignVideo } from '../../renderer/mock-renderer.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' })
  const auth = await requireTikTokUser(req)
  if (auth.error) return json(res, auth.status, { error: auth.error })
  const { user, client } = auth

  const id = String(getRequestBody(req).id || '').trim()
  if (!id) return json(res, 400, { error: 'Post id is required.' })

  const { data: post, error } = await client
    .from('tiktok_posts')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) return json(res, 500, { error: error.message })
  if (!post) return json(res, 404, { error: 'TikTok post not found.' })

  const result = renderCampaignVideo({ post })
  if (!result.ok) return json(res, 409, result)

  // Honesty: mock produced no media_url and no render, so we do NOT flip status
  // to "rendered". A real renderer (see renderer/RENDER_SPEC.md) may set that
  // only after genuinely producing and hosting an MP4.
  return json(res, 200, {
    ...result,
    status: post.status,
    note: 'No real render was performed and no status changed. Post remains ' + post.status + '.',
  })
}
