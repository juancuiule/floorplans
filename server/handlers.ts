import { Effect } from 'effect'
import { HttpServerResponse } from 'effect/http'
import { HttpApiBuilder } from 'effect/http-api'
import { Api } from './api.ts'
import { RemoteImages } from './imageProxy.ts'
import { Layouts } from './layouts.ts'
import { Libraries } from './library.ts'
import { Spaces } from './storage.ts'

export const TemplatesHandlers = HttpApiBuilder.group(
  Api,
  'templates',
  Effect.fn(function* (handlers) {
    const spaces = yield* Spaces
    return handlers.handleAll({
      listTemplates: () => spaces.listTemplates(),
    })
  }),
)

export const SpacesHandlers = HttpApiBuilder.group(
  Api,
  'spaces',
  Effect.fn(function* (handlers) {
    const spaces = yield* Spaces
    return handlers.handleAll({
      createSpace: ({ payload }) => spaces.createSpace(payload.name).pipe(Effect.map((id) => ({ id }))),
      getSpace: ({ params }) => spaces.space(params.space),
      renameSpace: ({ params, payload }) =>
        spaces.renameSpace(params.space, payload.name).pipe(Effect.map(() => ({ ok: true as const }))),
      deleteSpace: ({ params }) => spaces.deleteSpace(params.space).pipe(Effect.map(() => ({ ok: true as const }))),
    })
  }),
)

export const PlansHandlers = HttpApiBuilder.group(
  Api,
  'plans',
  Effect.fn(function* (handlers) {
    const spaces = yield* Spaces
    return handlers.handleAll({
      createPlan: ({ params, payload }) => spaces.createPlan(params.space, payload).pipe(Effect.map((id) => ({ id }))),
      readPlan: ({ params }) => spaces.readPlan(params.space, params.plan),
      writePlan: ({ params, payload }) =>
        spaces
          .writePlan(params.space, params.plan, payload as Record<string, unknown>)
          .pipe(Effect.map(() => ({ ok: true as const }))),
      deletePlan: ({ params }) =>
        spaces.deletePlan(params.space, params.plan).pipe(Effect.map(() => ({ ok: true as const }))),
    })
  }),
)

export const LayoutsHandlers = HttpApiBuilder.group(
  Api,
  'layouts',
  Effect.fn(function* (handlers) {
    const layouts = yield* Layouts
    return handlers.handleAll({
      readLayout: ({ params, query }) => layouts.read(params.space, params.plan, query.file ?? null),
      writeLayout: ({ params, query, payload }) =>
        layouts
          .write(params.space, params.plan, query.file ?? null, payload)
          .pipe(Effect.map(() => ({ ok: true as const }))),
      listLayouts: ({ params, query }) => layouts.list(params.space, params.plan, query.all === '1'),
      createLayout: ({ params, payload }) => layouts.create(params.space, params.plan, payload),
      renameLayout: ({ params, query, payload }) =>
        layouts.rename(params.space, params.plan, query.file ?? null, payload.name),
      deleteLayout: ({ params, query }) =>
        layouts.remove(params.space, params.plan, query.file ?? null).pipe(Effect.map(() => ({ ok: true as const }))),
    })
  }),
)

export const LibraryHandlers = HttpApiBuilder.group(
  Api,
  'library',
  Effect.fn(function* (handlers) {
    const libraries = yield* Libraries
    return handlers.handleAll({
      listImages: ({ params }) => libraries.list(params.space, params.library),
      uploadImage: ({ params, query, payload }) => libraries.upload(params.space, params.library, query.name, payload),
      readImage: ({ params }) =>
        libraries.read(params.space, params.library, params.name).pipe(
          Effect.map(({ type, body }) =>
            HttpServerResponse.uint8Array(body, {
              contentType: type,
              headers: { 'cache-control': 'max-age=3600' },
            }),
          ),
        ),
    })
  }),
)

export const ImagesHandlers = HttpApiBuilder.group(
  Api,
  'images',
  Effect.fn(function* (handlers) {
    const images = yield* RemoteImages
    return handlers.handleAll({
      fetchImage: ({ query }) =>
        images.fetch(query.url).pipe(
          Effect.map(({ type, body }) =>
            HttpServerResponse.uint8Array(body, {
              contentType: type,
              headers: { 'cache-control': 'max-age=86400' },
            }),
          ),
        ),
    })
  }),
)
