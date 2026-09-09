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

export default async function handler(req, res) {
  const rawPath = req.query?.path
  const route = Array.isArray(rawPath) ? rawPath.join('/') : String(rawPath || '')
  const routeHandler = handlers[route]
  if (!routeHandler) return json(res, 404, { error: 'TikTok route not found.' })
  return routeHandler(req, res)
}
