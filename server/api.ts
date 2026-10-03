import { promises as fs } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { HttpError, readBody, readJson, send } from './http.ts'
import { fetchImage, ImageError } from './imageProxy.ts'
import {
  assertSlug,
  createLayout,
  deleteLayout,
  LayoutError,
  layoutFile,
  listLayouts,
  renameLayout,
} from './layouts.ts'
import type { Library, SpaceStore } from './storage.ts'

// The API, as one plain node:http handler: the dev server mounts it as middleware
// (server/devServer.ts) and the production server in front of the built app
// (server/main.ts). Everything under /api/spaces/<space> belongs to that space.
//
//   GET    /api/templates                              plans a new plan can start from
//   POST   /api/spaces                                 { name } → { id }
//   GET    /api/spaces/<s>                             { id, name, plans }
//   PATCH  /api/spaces/<s>                             { name }
//   DELETE /api/spaces/<s>                             the space and everything in it
//   POST   /api/spaces/<s>/plans                       { name, template | plan } → { id }
//   GET    /api/spaces/<s>/plans/<p>                   the plan
//   PUT    /api/spaces/<s>/plans/<p>                   replace the plan (checked)
//   DELETE /api/spaces/<s>/plans/<p>                   the plan and its layouts
//   GET    /api/spaces/<s>/plans/<p>/decor[?file=]     a layout, verbatim (main without ?file=)
//   PUT    /api/spaces/<s>/plans/<p>/decor[?file=]     replace a layout
//   GET    /api/spaces/<s>/plans/<p>/layouts           list layouts (?all=1 includes e2e*/test*)
//   POST   /api/spaces/<s>/plans/<p>/layouts           { name, data? | from? } → { slug, name }
//   PATCH  /api/spaces/<s>/plans/<p>/layouts[?file=]   { name } → { slug, name }
//   DELETE /api/spaces/<s>/plans/<p>/layouts?file=     delete a named layout
//   GET    /api/spaces/<s>/artwork                     the space's image library
//   POST   /api/spaces/<s>/artwork?name=               upload one image (raw body)
//   GET    /api/spaces/<s>/artwork/<name>              one image
//   …/references[/<name>]                             the same for floor plan images traced in the editor
//   GET    /api/image?url=<link>                       a remote image for the TV screen

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif)$/i
const MAX_UPLOAD = 30 * 1024 * 1024
const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
}

export type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => Promise<void>

export function createApi(store: SpaceStore): Handler {
  return async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (!url.pathname.startsWith('/api/')) return next()
    const method = req.method ?? 'GET'
    const parts = url.pathname.split('/').slice(2).map(decodeURIComponent) // after /api/
    const file = url.searchParams.get('file')
    try {
      if (parts[0] === 'image' && method === 'GET') {
        const out = await fetchImage(url.searchParams.get('url') ?? '')
        res.setHeader('Content-Type', out.type)
        res.setHeader('Cache-Control', 'max-age=86400')
        return void res.end(out.body)
      }
      if (parts[0] === 'templates' && parts.length === 1 && method === 'GET')
        return send(res, 200, await store.templates())
      if (parts[0] !== 'spaces') return send(res, 404, { error: 'Not found' })
      if (parts.length === 1 && method === 'POST') {
        const body = await readJson(req)
        return send(res, 201, { id: await store.createSpace(body.name) })
      }
      const [, space, section, plan, sub] = parts
      if (!space) return send(res, 404, { error: 'Not found' })
      if (!section) {
        if (method === 'GET') return send(res, 200, await store.space(space))
        if (method === 'PATCH') {
          await store.renameSpace(space, (await readJson(req)).name)
          return send(res, 200, { ok: true })
        }
        if (method === 'DELETE') {
          await store.deleteSpace(space)
          return send(res, 200, { ok: true })
        }
      }
      if (section === 'artwork' || section === 'references') return await library(store, req, res, space, section, plan)
      if (section === 'plans' && !plan && method === 'POST') {
        const body = await readJson(req)
        return send(res, 201, { id: await store.createPlan(space, body) })
      }
      if (section === 'plans' && plan && !sub) {
        if (method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          return void res.end(await store.readPlan(space, plan))
        }
        if (method === 'PUT') {
          await store.writePlan(space, plan, await readJson(req))
          return send(res, 200, { ok: true })
        }
        if (method === 'DELETE') {
          await store.deletePlan(space, plan)
          return send(res, 200, { ok: true })
        }
      }
      if (section === 'plans' && plan && (sub === 'decor' || sub === 'layouts')) {
        await store.requirePlan(space, plan)
        const dir = store.layoutsDir(space, plan)
        if (file !== null) assertSlug(file)
        if (sub === 'decor' && method === 'GET') {
          // Served verbatim so the app can compare it with what it last wrote.
          const text = await fs
            .readFile(layoutFile(dir, file), 'utf8')
            .catch(() => JSON.stringify({ version: 1, items: [] }))
          res.setHeader('Content-Type', 'application/json')
          return void res.end(text)
        }
        if (sub === 'decor' && method === 'PUT') {
          const data = await readJson(req)
          if (!Array.isArray(data.items)) return send(res, 400, { error: 'Expected { items: [] }' })
          await fs.mkdir(dir, { recursive: true })
          await fs.writeFile(layoutFile(dir, file), JSON.stringify(data, null, 2) + '\n')
          return send(res, 200, { ok: true })
        }
        if (method === 'GET') return send(res, 200, await listLayouts(dir, plan, url.searchParams.get('all') === '1'))
        if (method === 'POST') return send(res, 201, await createLayout(dir, await readJson(req)))
        if (method === 'PATCH')
          return send(res, 200, await renameLayout(dir, file, (await readJson(req, 64 * 1024)).name))
        if (method === 'DELETE') {
          await deleteLayout(dir, file)
          return send(res, 200, { ok: true })
        }
      }
      send(res, 404, { error: 'Not found' })
    } catch (e) {
      if (e instanceof HttpError || e instanceof LayoutError || e instanceof ImageError)
        return send(res, e.status, { error: e.message })
      if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'TypeError') && parts[0] === 'image')
        return send(res, 502, { error: 'Could not reach that image' })
      send(res, 500, { error: e instanceof Error ? e.message : String(e) })
    }
  }
}

async function library(
  store: SpaceStore,
  req: IncomingMessage,
  res: ServerResponse,
  space: string,
  kind: Library,
  name?: string,
) {
  await store.requireSpace(space)
  const dir = store.libraryDir(space, kind)
  const method = req.method ?? 'GET'
  if (name && method === 'GET') {
    const file = path.join(dir, name)
    if (path.dirname(file) !== dir) throw new HttpError('Not found', 404)
    const body = await fs.readFile(file).catch(() => {
      throw new HttpError('Not found', 404)
    })
    res.setHeader('Content-Type', CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream')
    res.setHeader('Cache-Control', 'max-age=3600')
    return void res.end(body)
  }
  if (!name && method === 'GET') {
    await fs.mkdir(dir, { recursive: true })
    const files = (await fs.readdir(dir))
      .filter((f) => IMAGE_EXT.test(f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    return send(
      res,
      200,
      files.map((f) => ({ name: f, url: store.artworkUrl(space, f, kind) })),
    )
  }
  if (!name && method === 'POST') {
    const wanted = new URL(req.url ?? '/', 'http://localhost').searchParams.get('name') ?? 'artwork.png'
    if (!IMAGE_EXT.test(wanted)) return send(res, 400, { error: 'Only png, jpg, webp, gif or avif images' })
    const body = await readBody(req, MAX_UPLOAD)
    await fs.mkdir(dir, { recursive: true })
    const file = await uniqueName(dir, wanted)
    await fs.writeFile(path.join(dir, file), body)
    return send(res, 200, { name: file, url: store.artworkUrl(space, file, kind) })
  }
  send(res, 404, { error: 'Not found' })
}

async function uniqueName(dir: string, wanted: string) {
  const ext = path.extname(wanted).toLowerCase()
  const stem =
    path
      .basename(wanted, path.extname(wanted))
      .replace(/[^\w.\- ]+/g, '-')
      .slice(0, 80) || 'artwork'
  let name = `${stem}${ext}`
  for (let i = 2; ; i++) {
    try {
      await fs.access(path.join(dir, name))
      name = `${stem}-${i}${ext}`
    } catch {
      return name
    }
  }
}
