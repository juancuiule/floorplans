// Remote images for the TV screen, fetched by the server so the page can use them
// as textures (no CORS): GET /api/image?url=<link>. Public http(s) hosts only.

const MAX_IMAGE = 15 * 1024 * 1024
const imageCache = new Map<string, { type: string; body: Buffer }>()

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

export async function fetchImage(raw: string): Promise<{ type: string; body: Buffer }> {
  const u = checkImageUrl(raw)
  const hit = imageCache.get(u.href)
  if (hit) return hit
  // Ask like a browser: many image hosts refuse other clients (403).
  const r = await fetch(u, {
    signal: AbortSignal.timeout(15000),
    redirect: 'follow',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
      Accept: 'image/webp,image/jpeg,image/png,image/avif,image/*;q=0.8',
      'Accept-Language': 'en,es;q=0.9',
    },
  })
  if (!r.ok) throw new ImageError(`The image server answered ${r.status}`)
  const type = r.headers.get('content-type')?.split(';')[0].trim() ?? ''
  if (!type.startsWith('image/')) throw new ImageError('That link is not an image')
  if (Number(r.headers.get('content-length') ?? 0) > MAX_IMAGE) throw new ImageError('Image too large')
  const body = Buffer.from(await r.arrayBuffer())
  if (body.length > MAX_IMAGE) throw new ImageError('Image too large')
  const out = { type, body }
  if (imageCache.size > 30) imageCache.delete(imageCache.keys().next().value!)
  imageCache.set(u.href, out)
  return out
}
