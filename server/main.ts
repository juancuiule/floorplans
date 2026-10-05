import { existsSync, promises as fs } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createApi } from './api.ts'
import { SpaceStore } from './storage.ts'

// The production server: the built app (pnpm build) and the API, in one process.
//
//   pnpm build && pnpm start      PORT (default 8080), FLOORPLAN_DATA (default storage)

const root = process.cwd()
const dist = path.join(root, 'dist')
const store = new SpaceStore(path.resolve(root, process.env.FLOORPLAN_DATA ?? 'storage'), path.join(root, 'examples'))
const api = createApi(store)
const port = Number(process.env.PORT ?? 8080)

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json',
}

if (!existsSync(path.join(dist, 'index.html'))) {
  console.error('No build in dist/: run pnpm build first.')
  process.exit(1)
}

http
  .createServer((req, res) => {
    void api(req, res, async () => {
      // Static files from dist/; anything else is the app's page.
      const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
      let file = path.join(dist, pathname)
      if (!file.startsWith(dist + path.sep) || !existsSync(file) || (await fs.stat(file)).isDirectory())
        file = path.join(dist, 'index.html')
      res.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream')
      if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'max-age=31536000, immutable')
      res.end(await fs.readFile(file))
    })
  })
  .listen(port, () => console.log(`floorplan on http://localhost:${port} (data in ${store.root})`))
