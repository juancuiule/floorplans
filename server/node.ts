import type { IncomingMessage, ServerResponse } from 'node:http'
import { NodeFileSystem, NodeHttpServer, NodePath } from '@effect/platform-node'
import { ByteSize, Effect, Layer, ManagedRuntime, Scope } from 'effect'
import { FetchHttpClient, HttpIncomingMessage, HttpRouter } from 'effect/http'
import { HttpApiBuilder } from 'effect/http-api'
import { Api } from './api.ts'
import { ServerConfig } from './config.ts'
import {
  ImagesHandlers,
  LayoutsHandlers,
  LibraryHandlers,
  PlansHandlers,
  SpacesHandlers,
  TemplatesHandlers,
} from './handlers.ts'
import { RemoteImages } from './imageProxy.ts'
import { Layouts } from './layouts.ts'
import { Libraries, MAX_UPLOAD } from './library.ts'
import { Spaces } from './storage.ts'

// How the API is wired: services first (they need ServerConfig, FileSystem,
// Path and HttpClient from whoever embeds this), then the endpoint handlers,
// then the HttpApi itself — which registers the routes on the router.
export const ServicesLive = Layer.mergeAll(
  Spaces.layer,
  // The same Spaces.layer instance provided twice is built once and shared.
  Layouts.layer.pipe(Layer.provide(Spaces.layer)),
  Libraries.layer.pipe(Layer.provide(Spaces.layer)),
  RemoteImages.layer,
)

const HandlersLive = Layer.mergeAll(
  TemplatesHandlers,
  SpacesHandlers,
  PlansHandlers,
  LayoutsHandlers,
  LibraryHandlers,
  ImagesHandlers,
)

export const ApiLive = HttpApiBuilder.layer(Api, { openapiPath: '/api/openapi.json' }).pipe(Layer.provide(HandlersLive))

/** The platform services the API needs beyond its own — provided by the embedder. */
export const PlatformLive = Layer.mergeAll(
  NodeFileSystem.layer,
  NodePath.layer,
  NodeHttpServer.layerHttpServices,
  FetchHttpClient.layer,
)

/** A connect-style middleware: handles `/api/*`, passes everything else to `next()`. */
export type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void

/**
 * The API as a middleware: it owns `/api/*` and passes everything
 * else on (`next`). The Vite dev server and the unit tests mount it this way;
 * the production server (server/main.ts) puts it in front of the built app.
 */
export const apiHandler = Effect.gen(function* () {
  // The scope outlives the effect that built it: it tracks in-flight requests
  // for the lifetime of the process (or the test's runtime).
  const scope = yield* Scope.make()
  const app = yield* HttpRouter.toHttpEffect(ApiLive).pipe(Effect.provideService(Scope.Scope, scope))
  // Request bodies are read into memory: stop reading at the biggest upload
  // there is, instead of buffering whatever a client sends.
  const capped = app.pipe(Effect.provideService(HttpIncomingMessage.MaxBodySize, ByteSize.bytes(MAX_UPLOAD)))
  const handle = yield* NodeHttpServer.makeHandler(capped, { scope })
  const handler: Handler = (req, res, next) => {
    if (!req.url?.startsWith('/api/')) return next()
    // A declared length over the cap gets a proper answer before any reading;
    // a body without one is cut off by MaxBodySize.
    if (Number(req.headers['content-length'] ?? 0) > MAX_UPLOAD) {
      res.writeHead(413, { 'Content-Type': 'application/json', Connection: 'close' })
      res.end(JSON.stringify({ _tag: 'PayloadTooLarge', message: 'Upload too large' }))
      return
    }
    handle(req, res)
  }
  return handler
})

/** A running API over a temporary or dev data folder — for the Vite plugin and tests. */
export const createApi = (config: { dataDir: string; templatesDir: string }) =>
  ManagedRuntime.make(
    ServicesLive.pipe(Layer.provideMerge(Layer.mergeAll(PlatformLive, ServerConfig.layerFromValues(config)))),
  ).runPromise(apiHandler)
