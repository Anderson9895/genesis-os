import { json } from '../_lib/http.js'
import connect from './_connect.js'
import creator from './_creator.js'
import oauthCallback from './_oauthCallback.js'
import posts from './_posts.js'
import publish from './_publish.js'
import publishStatus from './_publishStatus.js'
import render from './_render.js'
import schedule from './_schedule.js'
import settings from './_settings.js'
import status from './_status.js'
import webhook from './_webhook.js'

const handlers = {
  connect,
  creator,
  'oauth/callback': oauthCallback,
  posts,
  publish,
  'publish-status': publishStatus,
  render,
  schedule,
  settings,
  status,
  webhook,
}

function requestedPath(req) {
  const value = req.query?.path
  const queryPath = Array.isArray(value) ? value.join('/') : String(value || '')
  const urlPath = new URL(req.url || '/', 'http://localhost').pathname
    .replace(/^\/api\/tiktok\/?/, '')

  return (queryPath || urlPath)
    .replace(/^\/+|\/+$/g, '')
}

export default async function handler(req, res) {
  const route = requestedPath(req)
  const routeHandler = handlers[route]
  if (!routeHandler) {
    return json(res, 404, {
      error: 'Unknown TikTok operation.',
      route,
    })
  }
  return routeHandler(req, res)
}
