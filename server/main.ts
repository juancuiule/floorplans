import { createServer } from 'node:http'
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node'
import { Effect, FileSystem, Layer, Scope } from 'effect'
import { HttpServerRequest, HttpServerResponse, HttpStaticServer } from 'effect/http'
import { ServerConfig } from './config.ts'
import { apiHandler, PlatformLive, ServicesLive } from './node.ts'

// The production server: the API under /api/* and the built app (pnpm build),
// in one process.
//
//   pnpm build && pnpm start      PORT (default 8080), HOST, FLOORPLAN_DATA (default storage)

const program = Effect.gen(function* () {
  const config = yield* ServerConfig
  const fs = yield* FileSystem.FileSystem
  if (!(yield* fs.exists(`${config.distDir}/index.html`)))
    return yield* Effect.die(new Error('No build in dist/: run pnpm build first.'))

  // The scope lives for the process: it tracks in-flight requests.
  const scope = yield* Scope.make()
  const api = yield* apiHandler

  // Static files from dist/; anything else is the app's page. Hashed assets
  // under /assets are immutable; everything else revalidates.
  const statics = yield* HttpStaticServer.make({ root: config.distDir, index: 'index.html', spa: true })
  const staticsApp = Effect.gen(function* () {
    const req = yield* HttpServerRequest.HttpServerRequest
    const res = yield* statics
    if (!req.url.includes('/assets/')) return res
    return HttpServerResponse.setHeader(res, 'Cache-Control', 'max-age=31536000, immutable')
  })
  const staticHandler = yield* NodeHttpServer.makeHandler(staticsApp, { scope })

  yield* Effect.acquireRelease(
    Effect.sync(() => {
      const s = createServer((req, res) => {
        const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
        if (pathname.startsWith('/api/')) api(req, res, () => staticHandler(req, res))
        else staticHandler(req, res)
      })
      if (config.host) s.listen(config.port, config.host)
      else s.listen(config.port)
      return s
    }),
    (s) => Effect.promise(() => new Promise<void>((close) => s.close(() => close()))),
  )

  yield* Effect.log(`floorplan on http://localhost:${config.port} (data in ${config.dataDir})`)
  return yield* Effect.never
})

NodeRuntime.runMain(
  program.pipe(
    Effect.provide(ServicesLive.pipe(Layer.provideMerge(Layer.mergeAll(PlatformLive, ServerConfig.layer)))),
    Effect.scoped,
  ),
)
