import { json, getRequestBody } from '../_lib/http.js'
import { callTikTok, getTikTokConfig, postingReadiness, requireTikTokUser } from './_lib.js'

const STATUS_MAP = {
  PROCESSING_UPLOAD: 'uploading',
  PROCESSING_DOWNLOAD: 'processing',
  SEND_TO_USER_INBOX: 'processing',
  PUBLISH_COMPLETE: 'published',
  FAILED: 'failed',
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' })
  const auth = await requireTikTokUser(req)
  if (auth.error) return json(res, auth.status, { error: auth.error })
  const { user, client } = auth
  const id = String(getRequestBody(req).id || '').trim()
  const { data: post, error: loadError } = await client.from('tiktok_posts').select('*').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (loadError) return json(res, 500, { error: loadError.message })
  if (!post?.publish_id) return json(res, 409, { error: 'This draft has no TikTok publish id yet.' })

  const config = getTikTokConfig()
  const readiness = postingReadiness(config)
  if (!readiness.ready) return json(res, 409, { error: `TikTok is not connected: ${readiness.missing.join(', ')}.` })

  try {
    const payload = await callTikTok('/v2/post/publish/status/fetch/', { accessToken: config.accessToken, body: { publish_id: post.publish_id } })
    const statusData = payload?.data || {}
    const nextStatus = STATUS_MAP[statusData.status] || 'processing'
    const updates = {
      status: !config.auditApproved && nextStatus === 'published' ? 'private_only' : nextStatus,
      tiktok_post_id: statusData.publicaly_available_post_id?.[0] || post.tiktok_post_id,
      last_error: statusData.fail_reason || null,
      metadata: { ...(post.metadata || {}), latest_status: statusData },
      updated_at: new Date().toISOString(),
    }
    const { data: updated, error: updateError } = await client.from('tiktok_posts').update(updates).eq('id', id).eq('user_id', user.id).select().single()
    if (updateError) throw updateError
    return json(res, 200, { post: updated, tiktokStatus: statusData.status || 'UNKNOWN' })
  } catch (error) {
    return json(res, error.status || 502, { error: error.message })
  }
}
