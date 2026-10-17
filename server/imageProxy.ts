import { Context, Effect, Layer } from 'effect'
import { HttpClient } from 'effect/http'
import { BadGateway, BadRequest } from './api.ts'

// Remote images for the TV screen, fetched by the server so the page can use them
// as textures (no CORS): GET /api/image?url=<link>. Public http(s) hosts only.

const MAX_IMAGE = 15 * 1024 * 1024

export class ImageError extends Error {
  status = 400
}

/** Only public http(s) hosts: no local or private addresses. */
export function checkImageUrl(raw: string): URL {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new ImageError('Not a link')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new ImageError('Only http and https links')
  const h = u.hostname.toLowerCase()
  if (
    h === 'localhost' ||
    h.endsWith('.local') ||
    /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|\[?f[cd])/.test(h)
  )
    throw new ImageError('Not a public address')
  return u
}

const badRequest = (e: unknown) => new BadRequest({ message: e instanceof Error ? e.message : String(e) })

export class RemoteImages extends Context.Service<
  RemoteImages,
  {
    /** Fetches a public image: its content type and bytes. Answers are cached in memory (last 30). */
    readonly fetch: (url: string) => Effect.Effect<{ type: string; body: Uint8Array }, BadRequest | BadGateway>
  }
>()('server/RemoteImages') {
  static readonly layer = Layer.effect(
    RemoteImages,
    Effect.gen(function* () {
      const client = (yield* HttpClient.HttpClient).pipe(HttpClient.followRedirects())
      const cache = new Map<string, { type: string; body: Uint8Array }>()

      const fetchImage = Effect.fn('RemoteImages.fetch')(function* (
        raw: string,
      ): Effect.fn.Return<{ type: string; body: Uint8Array }, BadRequest | BadGateway> {
        const u = yield* Effect.try({ try: () => checkImageUrl(raw), catch: badRequest })
        const hit = cache.get(u.href)
        if (hit) return hit
        // Ask like a browser: many image hosts refuse other clients (403).
        const res = yield* client
          .get(u, {
            headers: {
              'user-agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
              accept: 'image/webp,image/jpeg,image/png,image/avif,image/*;q=0.8',
              'accept-language': 'en,es;q=0.9',
            },
          })
          .pipe(
            Effect.timeout('15 seconds'),
            Effect.catch(() => new BadGateway({ message: 'Could not reach that image' })),
          )
        if (!res.status || res.status >= 400)
          return yield* new BadRequest({ message: `The image server answered ${res.status}` })
        const type = res.headers['content-type']?.split(';')[0].trim() ?? ''
        if (!type.startsWith('image/')) return yield* new BadRequest({ message: 'That link is not an image' })
        if (Number(res.headers['content-length'] ?? 0) > MAX_IMAGE)
          return yield* new BadRequest({ message: 'Image too large' })
        const body = new Uint8Array(
          yield* res.arrayBuffer.pipe(Effect.catch(() => new BadGateway({ message: 'Could not reach that image' }))),
        )
        if (body.length > MAX_IMAGE) return yield* new BadRequest({ message: 'Image too large' })
        const out = { type, body }
        if (cache.size > 30) cache.delete(cache.keys().next().value!)
        cache.set(u.href, out)
        return out
      })

      return RemoteImages.of({ fetch: fetchImage })
    }),
  )
}
