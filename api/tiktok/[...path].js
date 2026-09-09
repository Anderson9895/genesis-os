import { json } from '../_lib/http.js'
import creator from './_creator.js'
import posts from './_posts.js'
import publishStatus from './_publishStatus.js'
import publish from './_publish.js'
import status from './_status.js'

const handlers = {
  creator,
  posts,
  'publish-status': publishStatus,
  publish,
  status,
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
  if (!routeHandler) return json(res, 404, { error: 'TikTok route not found.' })
  return routeHandler(req, res)
}
