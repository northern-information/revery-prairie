import { PrairieDO } from './PrairieDO'
import { PRAIRIE_CREATE_PATH } from '@revery-prairie/shared'

export { PrairieDO }

interface Env {
  PRAIRIE: DurableObjectNamespace
  ASSETS: Fetcher
}

const CONNECT_PATTERN = /^\/api\/prairies\/([^/]+)\/connect$/

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
}

const generatePrairieId = (): string => {
  const raw = crypto.randomUUID().replace(/-/g, '')
  return `prairie-${raw.slice(0, 12)}`
}

const withCors = (res: Response): Response => {
  const headers = new Headers(res.headers)
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value)
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    if (url.pathname === PRAIRIE_CREATE_PATH && request.method === 'POST') {
      const prairieId = generatePrairieId()
      const id = env.PRAIRIE.idFromName(prairieId)
      const stub = env.PRAIRIE.get(id)
      let body: unknown = {}
      try {
        body = await request.json()
      } catch {
        return withCors(
          new Response(JSON.stringify({ error: 'invalid JSON body' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          })
        )
      }
      const createReq = new Request('https://do/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...(body as Record<string, unknown>), prairieId }),
      })
      const res = await stub.fetch(createReq)
      return withCors(res)
    }

    const connectMatch = CONNECT_PATTERN.exec(url.pathname)
    if (connectMatch) {
      const prairieId = decodeURIComponent(connectMatch[1])
      const id = env.PRAIRIE.idFromName(prairieId)
      const stub = env.PRAIRIE.get(id)
      const connectReq = new Request('https://do/connect', {
        method: request.method,
        headers: request.headers,
      })
      return stub.fetch(connectReq)
    }

    // Anything that isn't an /api/* route falls through to the static assets
    // binding so the SPA's index.html (and any matching files) can serve it.
    // not_found_handling = "single-page-application" in wrangler.toml ensures
    // unknown paths like /p/{id} resolve to index.html for client-side routing.
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
