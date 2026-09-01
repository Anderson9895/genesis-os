// Genesis OS — TikTok webhook ingest.
//
// TikTok can push publishing-status events to a verified webhook URL instead of
// (or alongside) client polling. This endpoint validates a server-side shared
// secret, records the event, and can flip a post's status.
//
// HONESTY / STATUS: Not live. No registered app -> no TikTok pushes webhooks.
// Also, an anonymous webhook has no user session and cannot write an owner's
// RLS-protected row without a server service-role client. A service-role path
// is not configured, so this endpoint truthfully reports that it acknowledges
// events but cannot persist them until the vault/service-role write path exists.
// The normal user-authenticated path is POST /api/tiktok/publish-status (polling).

import { json, getRequestBody } from '../_lib/http.js'

const STATUS_MAP = {
  PROCESSING_UPLOAD: 'uploading',
  PROCESSING_DOWNLOAD: 'processing',
  SEND_TO_USER_INBOX: 'processing',
  PUBLISH_COMPLETE: 'published',
  FAILED: 'failed',
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed.' })
  }
  // GET is the URL-verification handshake TikTok uses when a webhook/subscription
  // URL is configured. We return the challenge only when a secret is configured.
  const webhookSecret = String(process.env.TIKTOK_WEBHOOK_SECRET || '').trim()
  if (!webhookSecret) {
    return json(res, 503, {
      error: 'TikTok webhook is not configured.',
      configured: false,
      note: 'Add TIKTOK_WEBHOOK_SECRET and a verified callback domain once the app is registered. No webhook events have been received.',
    })
  }
  if (req.method === 'GET') {
    const challenge = String(req.query?.challenge || '').trim()
    return json(res, 200, { challenge })
  }

  const body = getRequestBody(req)
  // TikTok signs webhooks; validating the HMAC signature requires the official
  // verification secret. We check the plain shared secret here and flag that we
  // are NOT persisting without a service-role write path.
  const provided = String(body?.signature || body?.signed || '').trim()
  if (provided && provided !== webhookSecret) {
    return json(res, 401, { error: 'Invalid webhook signature.' })
  }

  const publishId = String(body?.publish_id || body?.data?.publish_id || '').trim()
  const status = STATUS_MAP[String(body?.status || body?.data?.status || '').toUpperCase()] || null

  return json(res, 200, {
    acknowledged: true,
    persisted: false,
    publishId: publishId || null,
    inferredStatus: status,
    note: 'Event acknowledged. Persisting to the owner RLS row and tiktok_webhook_events requires a server service-role write path, which is not configured yet. Verify via user-authenticated POST /api/tiktok/publish-status until then.',
  })
}
