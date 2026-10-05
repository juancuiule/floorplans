import type { IncomingMessage, ServerResponse } from 'node:http'

// Small helpers for the API's plain node:http handlers.

/** An error with the HTTP status the client should get. */
export class HttpError extends Error {
  readonly status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) {
        reject(new HttpError('Upload too large', 413))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/** A JSON request body ({} when empty). Malformed JSON is a 400. */
export async function readJson(req: IncomingMessage, limit = 5 * 1024 * 1024): Promise<Record<string, unknown>> {
  const text = (await readBody(req, limit)).toString('utf8')
  if (!text) return {}
  try {
    const data = JSON.parse(text) as unknown
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  } catch {
    throw new HttpError('Malformed JSON')
  }
}

export function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}
