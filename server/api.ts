import { Schema } from 'effect'
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

// The API contract, schema-first: the dev server mounts it as middleware
// (server/devServer.ts) and the production server in front of the built app
// (server/main.ts). Everything under /api/spaces/<space> belongs to that space.
//
//   GET    /api/templates                              plans a new plan can start from
//   POST   /api/spaces                                 { name? } → { id }
//   GET    /api/spaces/<s>                             { id, name, plans }
//   PATCH  /api/spaces/<s>                             { name? }
//   DELETE /api/spaces/<s>                             the space and everything in it
//   POST   /api/spaces/<s>/plans                       { name?, template | plan } → { id }
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

/** Space and plan ids: lowercase letters, digits and dashes, safe in paths and URLs. */
const Id = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9-]{0,39}$/))

/** A named layout's slug — the `file` query parameter of the decor/layouts endpoints. */
const FileSlug = Schema.String.check(Schema.isPattern(/^[a-z0-9-]{1,40}$/))

/** A space's image libraries. */
const Library = Schema.Literals(['artwork', 'references'])

const Ok = Schema.Struct({ ok: Schema.Literal(true) })
const JsonText = Schema.String.pipe(HttpApiSchema.asText({ contentType: 'application/json' }))
const ImageBytes = Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array())

export const TemplateInfo = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  subtitle: Schema.String,
})
export type TemplateInfo = typeof TemplateInfo.Type

export const PlanSummary = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  subtitle: Schema.String,
  /** The plan was drawn in the floor plan editor and can be opened there again. */
  sketched: Schema.Boolean,
  /** ISO time of the last change to the plan or any of its layouts. */
  updated: Schema.String,
})
export type PlanSummary = typeof PlanSummary.Type

export const SpaceInfo = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  plans: Schema.Array(PlanSummary),
})
export type SpaceInfo = typeof SpaceInfo.Type

export const LayoutInfo = Schema.Struct({
  /** null for the default plan's main layout (decor.json). */
  slug: Schema.NullOr(Schema.String),
  name: Schema.String,
  items: Schema.Int,
  /** ISO time of the last write. */
  updated: Schema.String,
  /** The plan it furnishes. */
  plan: Schema.String,
})
export type LayoutInfo = typeof LayoutInfo.Type

export const LibraryImage = Schema.Struct({
  name: Schema.String,
  url: Schema.String,
})
export type LibraryImage = typeof LibraryImage.Type

// Errors answer JSON `{ _tag, message }` with the annotated status.

export class NotFound extends Schema.TaggedError<NotFound>()(
  'NotFound',
  { message: Schema.String },
  { httpApiStatus: 404 },
) {}

export class BadRequest extends Schema.TaggedError<BadRequest>()(
  'BadRequest',
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

export class Conflict extends Schema.TaggedError<Conflict>()(
  'Conflict',
  { message: Schema.String },
  { httpApiStatus: 409 },
) {}

export class PayloadTooLarge extends Schema.TaggedError<PayloadTooLarge>()(
  'PayloadTooLarge',
  { message: Schema.String },
  { httpApiStatus: 413 },
) {}

export class BadGateway extends Schema.TaggedError<BadGateway>()(
  'BadGateway',
  { message: Schema.String },
  { httpApiStatus: 502 },
) {}

const space = { space: Id }
const plan = { space: Id, plan: Id }
const file = { file: Schema.optional(FileSlug) }

export class TemplatesApiGroup extends HttpApiGroup.make('templates')
  .add(HttpApiEndpoint.get('listTemplates', '/templates', { success: Schema.Array(TemplateInfo) }))
  .prefix('/api') {}

export class SpacesApiGroup extends HttpApiGroup.make('spaces')
  .add(
    HttpApiEndpoint.post('createSpace', '/spaces', {
      payload: Schema.Struct({ name: Schema.optional(Schema.String) }),
      success: Schema.Struct({ id: Schema.String }).pipe(HttpApiSchema.status(201)),
      // Unreachable through the API (ids are server-minted randoms), declared so
      // the service's conflict error stays typed end to end.
      error: Conflict,
    }),
  )
  .add(
    HttpApiEndpoint.get('getSpace', '/spaces/:space', {
      params: space,
      success: SpaceInfo,
      error: NotFound,
    }),
  )
  .add(
    HttpApiEndpoint.patch('renameSpace', '/spaces/:space', {
      params: space,
      payload: Schema.Struct({ name: Schema.optional(Schema.String) }),
      success: Ok,
      error: NotFound,
    }),
  )
  .add(
    HttpApiEndpoint.delete('deleteSpace', '/spaces/:space', {
      params: space,
      success: Ok,
      error: NotFound,
    }),
  )
  .prefix('/api') {}

export class PlansApiGroup extends HttpApiGroup.make('plans')
  .add(
    HttpApiEndpoint.post('createPlan', '/spaces/:space/plans', {
      params: space,
      payload: Schema.Struct({
        name: Schema.optional(Schema.String),
        template: Schema.optional(Schema.String),
        plan: Schema.optional(Schema.Unknown),
      }),
      success: Schema.Struct({ id: Schema.String }).pipe(HttpApiSchema.status(201)),
      error: [NotFound, BadRequest],
    }),
  )
  // Served verbatim, not re-encoded: the app compares the text with what it last wrote.
  .add(
    HttpApiEndpoint.get('readPlan', '/spaces/:space/plans/:plan', {
      params: plan,
      success: JsonText,
      error: NotFound,
    }),
  )
  .add(
    HttpApiEndpoint.put('writePlan', '/spaces/:space/plans/:plan', {
      params: plan,
      payload: Schema.Unknown,
      success: Ok,
      error: [NotFound, BadRequest],
    }),
  )
  .add(
    HttpApiEndpoint.delete('deletePlan', '/spaces/:space/plans/:plan', {
      params: plan,
      success: Ok,
      error: NotFound,
    }),
  )
  .prefix('/api') {}

export class LayoutsApiGroup extends HttpApiGroup.make('layouts')
  .add(
    HttpApiEndpoint.get('readLayout', '/spaces/:space/plans/:plan/decor', {
      params: plan,
      query: file,
      success: JsonText,
      error: [NotFound, BadRequest],
    }),
  )
  .add(
    HttpApiEndpoint.put('writeLayout', '/spaces/:space/plans/:plan/decor', {
      params: plan,
      query: file,
      payload: Schema.Unknown,
      success: Ok,
      error: [NotFound, BadRequest],
    }),
  )
  .add(
    HttpApiEndpoint.get('listLayouts', '/spaces/:space/plans/:plan/layouts', {
      params: plan,
      query: { all: Schema.optional(Schema.String) },
      success: Schema.Array(LayoutInfo),
      error: NotFound,
    }),
  )
  .add(
    HttpApiEndpoint.post('createLayout', '/spaces/:space/plans/:plan/layouts', {
      params: plan,
      payload: Schema.Struct({
        name: Schema.String,
        data: Schema.optional(Schema.Unknown),
        from: Schema.optional(Schema.NullOr(Schema.String)),
      }),
      success: Schema.Struct({ slug: Schema.NullOr(Schema.String), name: Schema.String }).pipe(
        HttpApiSchema.status(201),
      ),
      error: [NotFound, BadRequest],
    }),
  )
  .add(
    HttpApiEndpoint.patch('renameLayout', '/spaces/:space/plans/:plan/layouts', {
      params: plan,
      query: file,
      payload: Schema.Struct({ name: Schema.String }),
      success: Schema.Struct({ slug: Schema.NullOr(Schema.String), name: Schema.String }),
      error: [NotFound, BadRequest],
    }),
  )
  .add(
    HttpApiEndpoint.delete('deleteLayout', '/spaces/:space/plans/:plan/layouts', {
      params: plan,
      query: file,
      success: Ok,
      error: [NotFound, BadRequest],
    }),
  )
  .prefix('/api') {}

export class LibraryApiGroup extends HttpApiGroup.make('library')
  .add(
    HttpApiEndpoint.get('listImages', '/spaces/:space/:library', {
      params: { space: Id, library: Library },
      success: Schema.Array(LibraryImage),
      error: NotFound,
    }),
  )
  .add(
    HttpApiEndpoint.post('uploadImage', '/spaces/:space/:library', {
      params: { space: Id, library: Library },
      query: { name: Schema.optional(Schema.String) },
      payload: ImageBytes,
      success: LibraryImage,
      error: [NotFound, BadRequest, PayloadTooLarge],
    }),
  )
  // The handler answers with a custom response: the image's own content type
  // and a cache header — the schema only documents the bytes.
  .add(
    HttpApiEndpoint.get('readImage', '/spaces/:space/:library/:name', {
      params: { space: Id, library: Library, name: Schema.String },
      success: ImageBytes,
      error: NotFound,
    }),
  )
  .prefix('/api') {}

export class ImagesApiGroup extends HttpApiGroup.make('images')
  .add(
    HttpApiEndpoint.get('fetchImage', '/image', {
      query: { url: Schema.String },
      success: ImageBytes,
      error: [BadRequest, BadGateway],
    }),
  )
  .prefix('/api') {}

export class Api extends HttpApi.make('floorplan')
  .add(TemplatesApiGroup)
  .add(SpacesApiGroup)
  .add(PlansApiGroup)
  .add(LayoutsApiGroup)
  .add(LibraryApiGroup)
  .add(ImagesApiGroup) {}
