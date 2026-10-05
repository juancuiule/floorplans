import path from 'node:path'
import type { Plugin } from 'vite'
import { slugOfFileName } from '../src/model/layoutNames.ts'
import { createApi } from './api.ts'
import type { SpaceStore } from './storage.ts'

/**
 * Mounts the API on the Vite dev server, and tells open tabs when a layout file
 * changes on disk, so a hand edit (or an agent's) shows up live:
 * 'decor:changed' { space, plan, file } and 'layouts:changed' { space, plan }.
 */
export function devApi(store: SpaceStore): Plugin {
  return {
    name: 'floorplan-api',
    apply: 'serve',
    configureServer(server) {
      const spaces = path.join(store.root, 'spaces')
      server.watcher.add(spaces)
      /** <space>/layouts/<plan>/<file> of a layout file, or null for any other file. */
      const layoutOf = (file: string) => {
        const rel = path.relative(spaces, file).split(path.sep)
        if (rel.length !== 4 || rel[1] !== 'layouts') return null
        const slug = slugOfFileName(rel[3])
        return slug === undefined ? null : { space: rel[0], plan: rel[2], file: slug }
      }
      server.watcher.on('change', (file) => {
        const at = layoutOf(file)
        if (!at) return
        server.ws.send({ type: 'custom', event: 'decor:changed', data: at })
        server.ws.send({ type: 'custom', event: 'layouts:changed', data: { space: at.space, plan: at.plan } })
      })
      for (const ev of ['add', 'unlink'] as const)
        server.watcher.on(ev, (file) => {
          const at = layoutOf(file)
          if (at) server.ws.send({ type: 'custom', event: 'layouts:changed', data: { space: at.space, plan: at.plan } })
        })
      const api = createApi(store)
      server.middlewares.use((req, res, next) => void api(req, res, next))
    },
  }
}
