// Genesis OS — TikTok scheduling settings (owner-configurable daily time).
//
// Reads/writes the owner's daily publishing settings. Posts are never auto-
// published until: TikTok is connected, the client passes audit, AND the owner
// enables daily auto-publish. All defaults are off/safe.

import { json, getRequestBody } from '../_lib/http.js'
import { requireTikTokUser } from './_lib.js'

const CAMPAIGN_KEY = '6000-strangers-one-question'

export async function loadSettings(client, userId) {
  const { data, error } = await client
    .from('tiktok_settings')
    .select('*')
    .eq('user_id', userId)
    .eq('campaign_key', CAMPAIGN_KEY)
    .maybeSingle()
  if (error) return { ok: false, error }
  if (!data) {
    return {
      ok: true,
      settings: {
        campaign_key: CAMPAIGN_KEY,
        daily_time_utc: '16:00',
        daily_auto_publish_enabled: false,
        max_one_per_day: true,
        timezone_label: 'UTC',
      },
    }
  }
  return { ok: true, settings: data }
}

export default async function handler(req, res) {
  const auth = await requireTikTokUser(req)
  if (auth.error) return json(res, auth.status, { error: auth.error })
  const { user, client } = auth

  if (req.method === 'GET') {
    const result = await loadSettings(client, user.id)
    if (!result.ok) {
      return json(res, 500, {
        error: result.error?.message || 'Failed to load scheduling settings.',
        note: 'If the tiktok_settings migration has not been applied, apply supabase/migrations/*_tiktok_extensions.sql.',
      })
    }
    return json(res, 200, { settings: result.settings })
  }

  if (req.method === 'PUT') {
    const body = getRequestBody(req)
    const dailyTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.daily_time_utc || '').trim())
      ? String(body.daily_time_utc).trim()
      : body.daily_time_utc ? null : '16:00'
    if (!dailyTime) {
      return json(res, 400, { error: 'daily_time_utc must be HH:MM (24-hour, UTC).' })
    }
    const enabled = Boolean(body.daily_auto_publish_enabled)
    const patch = {
      daily_time_utc: dailyTime,
      daily_auto_publish_enabled: enabled,
      updated_at: new Date().toISOString(),
    }
    // Upsert (owner-only row). Auto-publish is gated: even if enabled, the
    // publisher refuses until connected + audit approved (see schedule.js).
    const { data, error } = await client
      .from('tiktok_settings')
      .upsert(
        { user_id: user.id, campaign_key: CAMPAIGN_KEY, ...patch },
        { onConflict: 'user_id,campaign_key' },
      )
      .select()
      .single()
    if (error) {
      return json(res, 500, {
        error: error.message || 'Failed to save scheduling settings.',
        note: 'Apply the tiktok_settings migration if the table does not exist.',
      })
    }
    return json(res, 200, { settings: data })
  }

  return json(res, 405, { error: 'Method not allowed.' })
}
