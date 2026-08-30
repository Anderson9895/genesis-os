import { json, getRequestBody } from '../_lib/http.js'
import { requireTikTokUser } from './_lib.js'

const PRIVACY_LEVELS = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY']

export default async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) return json(res, 405, { error: 'Method not allowed.' })
  const auth = await requireTikTokUser(req)
  if (auth.error) return json(res, auth.status, { error: auth.error })
  const { user, client } = auth

  if (req.method === 'GET') {
    const { data, error } = await client.from('tiktok_posts').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    if (error) return json(res, 500, { error: error.message || 'Failed to load TikTok posts.' })
    return json(res, 200, { posts: data || [] })
  }

  const body = getRequestBody(req)
  if (req.method === 'POST') {
    const title = String(body.title || '').trim()
    const caption = String(body.caption || '').trim()
    const mediaUrl = String(body.media_url || '').trim()
    const privacyLevel = PRIVACY_LEVELS.includes(body.privacy_level) ? body.privacy_level : 'SELF_ONLY'
    if (!title || !caption || !/^https:\/\//i.test(mediaUrl)) {
      return json(res, 400, { error: 'Title, caption, and an HTTPS video URL are required.' })
    }

    const row = {
      user_id: user.id,
      title: title.slice(0, 200),
      caption: caption.slice(0, 2200),
      media_url: mediaUrl,
      scheduled_for: body.scheduled_for || null,
      privacy_level: privacyLevel,
      disable_comment: Boolean(body.disable_comment),
      disable_duet: Boolean(body.disable_duet),
      disable_stitch: Boolean(body.disable_stitch),
      status: 'draft',
    }
    const { data, error } = await client.from('tiktok_posts').insert(row).select().single()
    if (error) return json(res, 500, { error: error.message || 'Failed to create TikTok draft.' })
    return json(res, 201, { post: data })
  }

  const id = String(body.id || '').trim()
  if (!id) return json(res, 400, { error: 'Post id is required.' })
  const { data: existing, error: loadError } = await client.from('tiktok_posts').select('*').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (loadError) return json(res, 500, { error: loadError.message })
  if (!existing) return json(res, 404, { error: 'TikTok post not found.' })
  if (['uploading', 'processing', 'published', 'private_only'].includes(existing.status)) {
    return json(res, 409, { error: 'This post can no longer be edited or re-approved.' })
  }

  const approved = Boolean(body.owner_approved)
  const updates = {
    owner_approved: approved,
    approved_at: approved ? new Date().toISOString() : null,
    status: approved ? (existing.scheduled_for ? 'scheduled' : 'approved') : 'draft',
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await client.from('tiktok_posts').update(updates).eq('id', id).eq('user_id', user.id).select().single()
  if (error) return json(res, 500, { error: error.message || 'Failed to update approval.' })
  return json(res, 200, { post: data })
}
