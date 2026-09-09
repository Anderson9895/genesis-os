import { json, getRequestBody } from '../_lib/http.js'
import { callTikTok, getTikTokConfig, postingReadiness, requireTikTokUser } from './_lib.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' })
  const auth = await requireTikTokUser(req)
  if (auth.error) return json(res, auth.status, { error: auth.error })
  const { user, client } = auth
  const id = String(getRequestBody(req).id || '').trim()
  if (!id) return json(res, 400, { error: 'Post id is required.' })

  const { data: post, error: loadError } = await client.from('tiktok_posts').select('*').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (loadError) return json(res, 500, { error: loadError.message })
  if (!post) return json(res, 404, { error: 'TikTok post not found.' })
  if (!post.owner_approved) return json(res, 409, { error: 'Owner approval is required before posting.' })
  if (post.publish_id || ['uploading', 'processing', 'published', 'private_only'].includes(post.status)) {
    return json(res, 409, { error: 'This post already has a TikTok publishing attempt. Refresh its status instead of creating a duplicate.' })
  }

  const config = getTikTokConfig()
  const readiness = postingReadiness(config)
  if (!readiness.ready) return json(res, 409, { error: `TikTok is not connected: ${readiness.missing.join(', ')}.` })
  if (!config.auditApproved && post.privacy_level !== 'SELF_ONLY') {
    return json(res, 409, { error: 'TikTok restricts unaudited clients to private visibility. Change this draft to SELF_ONLY for testing.' })
  }

  try {
    const creatorPayload = await callTikTok('/v2/post/publish/creator_info/query/', { accessToken: config.accessToken, body: {} })
    const creator = creatorPayload?.data?.creator_info || {}
    const allowedPrivacy = Array.isArray(creator.privacy_level_options) ? creator.privacy_level_options : []
    if (!allowedPrivacy.includes(post.privacy_level)) {
      return json(res, 409, { error: `The connected TikTok account does not currently permit ${post.privacy_level}. Refresh creator settings and choose an available option.` })
    }

    const payload = await callTikTok('/v2/post/publish/video/init/', {
      accessToken: config.accessToken,
      body: {
        post_info: {
          title: post.caption,
          privacy_level: post.privacy_level,
          disable_comment: post.disable_comment,
          disable_duet: post.disable_duet,
          disable_stitch: post.disable_stitch,
          video_cover_timestamp_ms: 1000,
        },
        source_info: { source: 'PULL_FROM_URL', video_url: post.media_url },
      },
    })
    const publishId = payload?.data?.publish_id
    if (!publishId) throw new Error('TikTok did not return a publish id.')

    const nextStatus = config.auditApproved ? 'uploading' : 'private_only'
    const { data: updated, error: updateError } = await client.from('tiktok_posts').update({
      publish_id: publishId,
      status: nextStatus,
      last_error: null,
      metadata: { creator_snapshot: creator, init_response: payload.data },
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('user_id', user.id).select().single()
    if (updateError) throw updateError
    return json(res, 200, { post: updated, visibility: config.auditApproved ? post.privacy_level : 'SELF_ONLY' })
  } catch (error) {
    await client.from('tiktok_posts').update({ status: 'failed', last_error: error.message, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id)
    return json(res, error.status || 502, { error: error.message })
  }
}
