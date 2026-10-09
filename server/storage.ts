import { randomBytes } from 'node:crypto'
import { Context, Effect, FileSystem, Layer, Option, Path, PlatformError } from 'effect'
import { isPlanMainSlug, layoutFileName, slugify, slugOfFileName } from '../src/model/layoutNames.ts'
import { validatePlan } from '../src/model/validate.ts'
import type { PlanSummary, SpaceInfo, TemplateInfo } from './api.ts'
import { BadRequest, Conflict, NotFound } from './api.ts'
import { ServerConfig } from './config.ts'

// Where everyone's data lives (docs/adr/0010-spaces.md). A space is one person's
// (or one household's) corner of the app: their plans, the layouts of each plan
// and their artwork. Nothing in a space is shared with another; the catalog of
// furniture, plants and lamps is code, the same for everyone.
//
//   <dataDir>/spaces/<space>/space.json                 { name, created }
//   <dataDir>/spaces/<space>/plans/<plan>.plan.json
//   <dataDir>/spaces/<space>/layouts/<plan>/decor*.json  decor.json is the plan's main layout
//   <dataDir>/spaces/<space>/artwork/*
//   <dataDir>/spaces/<space>/references/*              floor plan images traced in the editor
//
// Templates are the example workspaces in examples/ (docs/adr/0009): a new plan
// can start as a copy of one, without its artwork.

/** A space's image folders: `artwork` (hung on walls) and `references` (floor plans traced in the editor). */
export type Library = 'artwork' | 'references'

/** Space and plan ids: lowercase letters, digits and dashes, safe in paths and URLs. */
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/

/** The API's schema checks path ids before they reach here; this guards ids read from disk instead. */
const assertId = (id: string, what: string) => {
  if (!ID.test(id)) throw new BadRequest({ message: `Bad ${what} id` })
}

/** A FileSystem that dies on failure instead of failing with PlatformError. */
type FatalFileSystem = {
  readonly [K in keyof FileSystem.FileSystem]: FileSystem.FileSystem[K] extends (
    ...args: infer A
  ) => Effect.Effect<infer V, infer E, infer R>
    ? (...args: A) => Effect.Effect<V, Exclude<E, PlatformError.PlatformError>, R>
    : FileSystem.FileSystem[K]
}

/**
 * A FileSystem whose failures are defects: a broken disk is a 500, not a domain
 * error — the same as an uncaught throw in a plain handler.
 */
export const fatalFileSystem = (fs: FileSystem.FileSystem): FatalFileSystem =>
  new Proxy(fs, {
    get: (target, key) => {
      const value = target[key as keyof FileSystem.FileSystem]
      if (typeof value !== 'function') return value
      return (...args: unknown[]) => {
        const out = (value as (...a: unknown[]) => unknown).apply(target, args)
        return Effect.isEffect(out)
          ? (out as Effect.Effect<unknown, PlatformError.PlatformError>).pipe(
              Effect.catchTag(['PlatformError'], Effect.die),
            )
          : out
      }
    },
  }) as unknown as FatalFileSystem

/** Whether a defect is a missing file (ENOENT) — fs failures are defects under fatalFileSystem. */
const isMissingFile = (d: unknown): boolean => d instanceof PlatformError.PlatformError && d.reason._tag === 'NotFound'

/**
 * `fallback` when the operation found no file; every other defect still
 * crashes (a broken disk is a 500, not a 404).
 */
export const orMissing =
  <S, E2, R2>(fallback: Effect.Effect<S, E2, R2>) =>
  <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A | S, E | E2, R | R2> =>
    Effect.catchDefect(self, (d) => (isMissingFile(d) ? fallback : Effect.die(d)))

/** Artwork links in a layout point at the space's own library; a copy into another space drops them. */
const withoutArtwork = (layout: Record<string, unknown>): Record<string, unknown> => ({
  ...layout,
  items: Array.isArray(layout.items) ? layout.items.filter((i) => (i as { kind?: string })?.kind !== 'artwork') : [],
})

export class Spaces extends Context.Service<
  Spaces,
  {
    /** The data folder (FLOORPLAN_DATA). */
    readonly root: string
    /** Folder of example workspaces offered as templates. */
    readonly templatesDir: string
    readonly spaceDir: (space: string) => string
    readonly planFile: (space: string, plan: string) => string
    readonly layoutsDir: (space: string, plan: string) => string
    readonly libraryDir: (space: string, library: Library) => string
    /** The URL the app loads an image of this space from. */
    readonly imageUrl: (space: string, name: string, library?: Library) => string
    readonly requireSpace: (space: string) => Effect.Effect<void, NotFound>
    readonly requirePlan: (space: string, plan: string) => Effect.Effect<void, NotFound>
    readonly createSpace: (name: unknown, id?: string) => Effect.Effect<string, Conflict>
    readonly space: (space: string) => Effect.Effect<SpaceInfo, NotFound>
    readonly renameSpace: (space: string, name: unknown) => Effect.Effect<void, NotFound>
    /** Deletes a space and everything in it: plans, layouts, artwork, reference images. There is no undo. */
    readonly deleteSpace: (space: string) => Effect.Effect<void, NotFound>
    readonly plans: (space: string) => Effect.Effect<PlanSummary[]>
    /** The plan file's exact text — the app compares it with what it last wrote. */
    readonly readPlan: (space: string, plan: string) => Effect.Effect<string, NotFound>
    /** Replaces a plan; it must be valid, and keep its id. */
    readonly writePlan: (
      space: string,
      plan: string,
      data: Record<string, unknown>,
    ) => Effect.Effect<void, NotFound | BadRequest>
    /**
     * Adds a plan to a space: `plan` as given (from the floor plan editor), or a
     * copy of a template with its main layout. Returns the new plan's id,
     * derived from its name.
     */
    readonly createPlan: (
      space: string,
      body: { name?: unknown; template?: unknown; plan?: unknown },
    ) => Effect.Effect<string, NotFound | BadRequest>
    readonly deletePlan: (space: string, plan: string) => Effect.Effect<void, NotFound>
    readonly listTemplates: () => Effect.Effect<TemplateInfo[]>
    /**
     * Copies an example-style workspace (examples/<name>/, docs/adr/0009) into a
     * new space, artwork included: its owner's way in. Layouts are sorted into
     * their plans, and artwork links point at the new space's library.
     */
    readonly importWorkspace: (dir: string, opts?: { id?: string; name?: string }) => Effect.Effect<string, Conflict>
  }
>()('server/Spaces') {
  static readonly layer = Layer.effect(
    Spaces,
    Effect.gen(function* () {
      const fs = fatalFileSystem(yield* FileSystem.FileSystem)
      const p = yield* Path.Path
      const { dataDir: root, templatesDir } = yield* ServerConfig

      const writeJson = (file: string, data: unknown) => fs.writeFileString(file, JSON.stringify(data, null, 2) + '\n')
      /** The file's JSON, or {} when missing or unparsable (a half-done hand edit). */
      const readJsonOrEmpty = (file: string) =>
        fs.readFileString(file, 'utf8').pipe(
          Effect.map((text) => {
            try {
              const data: unknown = JSON.parse(text)
              return data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
            } catch {
              return {}
            }
          }),
          orMissing(Effect.succeed({} as Record<string, unknown>)),
        )

      const spaceDir = (space: string) => {
        assertId(space, 'space')
        return p.join(root, 'spaces', space)
      }
      const planFile = (space: string, plan: string) => {
        assertId(plan, 'plan')
        return p.join(spaceDir(space), 'plans', `${plan}.plan.json`)
      }
      const layoutsDir = (space: string, plan: string) => {
        assertId(plan, 'plan')
        return p.join(spaceDir(space), 'layouts', plan)
      }
      const libraryDir = (space: string, library: Library) => p.join(spaceDir(space), library)

      const requireSpace = Effect.fn('Spaces.requireSpace')(function* (space: string) {
        if (!(yield* fs.exists(p.join(spaceDir(space), 'space.json'))))
          return yield* new NotFound({ message: 'No such space' })
      })

      const requirePlan = Effect.fn('Spaces.requirePlan')(function* (space: string, plan: string) {
        yield* requireSpace(space)
        if (!(yield* fs.exists(planFile(space, plan)))) return yield* new NotFound({ message: 'No such plan' })
      })

      /** The newest change to a plan or its layouts. */
      const updated = Effect.fnUntraced(function* (space: string, plan: string) {
        const files = [planFile(space, plan)]
        const layouts = layoutsDir(space, plan)
        if (yield* fs.exists(layouts)) {
          for (const f of yield* fs.readDirectory(layouts)) files.push(p.join(layouts, f))
        }
        const times = yield* Effect.all(
          files.map((f) =>
            fs.stat(f).pipe(
              Effect.map((s) =>
                Option.getOrElse(
                  Option.map(s.mtime, (d) => d.getTime()),
                  () => 0,
                ),
              ),
              Effect.catchDefect(() => Effect.succeed(0)),
            ),
          ),
        )
        return new Date(Math.max(...times)).toISOString()
      })

      const plans = Effect.fnUntraced(function* (space: string): Effect.fn.Return<PlanSummary[]> {
        const dir = p.join(spaceDir(space), 'plans')
        const files = (yield* fs.exists(dir))
          ? (yield* fs.readDirectory(dir)).filter((f) => f.endsWith('.plan.json'))
          : []
        const out: PlanSummary[] = []
        for (const f of files) {
          const id = f.replace(/\.plan\.json$/, '')
          const plan = yield* readJsonOrEmpty(p.join(dir, f))
          out.push({
            id,
            name: typeof plan.name === 'string' ? plan.name : id,
            subtitle: typeof plan.subtitle === 'string' ? plan.subtitle : '',
            sketched: !!plan.sketch,
            updated: yield* updated(space, id),
          })
        }
        return out.sort((a, b) => b.updated.localeCompare(a.updated))
      })

      /** A plan id that is free: the wanted one, or wanted-2, wanted-3… */
      const freePlanId = Effect.fnUntraced(function* (space: string, wanted: string) {
        const base = wanted.slice(0, 36).replace(/-+$/, '') || 'plan'
        if (!(yield* fs.exists(planFile(space, base)))) return base
        for (let i = 2; ; i++) {
          if (!(yield* fs.exists(planFile(space, `${base}-${i}`)))) return `${base}-${i}`
        }
      })

      /** A template's default plan and its main layout. */
      const template = Effect.fnUntraced(function* (id: string): Effect.fn.Return<
        {
          plan: Record<string, unknown>
          layout: Record<string, unknown> | null
        },
        NotFound
      > {
        if (!ID.test(id)) return yield* new NotFound({ message: 'No such template' })
        const dir = p.join(templatesDir, id)
        const ws = yield* fs.readFileString(p.join(dir, 'workspace.json'), 'utf8').pipe(
          Effect.map((text) => JSON.parse(text) as Record<string, unknown>),
          orMissing(new NotFound({ message: 'No such template' })),
        )
        const planId = String(ws.defaultPlan)
        const plan = yield* readJsonOrEmpty(p.join(dir, 'plans', `${planId}.plan.json`))
        const layout = yield* readJsonOrEmpty(p.join(dir, 'layouts', 'decor.json')).pipe(
          Effect.map((data) => (Object.keys(data).length ? data : null)),
        )
        return { plan, layout }
      })

      const checkPlan = Effect.fnUntraced(function* (
        data: Record<string, unknown>,
      ): Effect.fn.Return<void, BadRequest> {
        const problems = validatePlan(data)
        if (problems.length)
          return yield* new BadRequest({ message: `Not a valid plan: ${problems.slice(0, 5).join('; ')}` })
      })

      const service = Spaces.of({
        root,
        templatesDir,
        spaceDir,
        planFile,
        layoutsDir,
        libraryDir,
        imageUrl: (space, name, library = 'artwork') => `/api/spaces/${space}/${library}/${encodeURIComponent(name)}`,
        requireSpace,
        requirePlan,

        createSpace: Effect.fn('Spaces.createSpace')(function* (name: unknown, id = randomId()) {
          assertId(id, 'space')
          const dir = spaceDir(id)
          if (yield* fs.exists(dir)) return yield* new Conflict({ message: 'That space already exists' })
          yield* fs.makeDirectory(p.join(dir, 'plans'), { recursive: true })
          yield* writeJson(p.join(dir, 'space.json'), {
            name: cleanName(name, 'My space'),
            created: new Date().toISOString(),
          })
          return id
        }),

        space: Effect.fn('Spaces.space')(function* (space: string) {
          yield* requireSpace(space)
          const meta = yield* readJsonOrEmpty(p.join(spaceDir(space), 'space.json'))
          return { id: space, name: String(meta.name ?? space), plans: yield* plans(space) }
        }),

        renameSpace: Effect.fn('Spaces.renameSpace')(function* (space: string, name: unknown) {
          yield* requireSpace(space)
          const file = p.join(spaceDir(space), 'space.json')
          const meta = yield* readJsonOrEmpty(file)
          yield* writeJson(file, { ...meta, name: cleanName(name, 'My space') })
        }),

        deleteSpace: Effect.fn('Spaces.deleteSpace')(function* (space: string) {
          yield* requireSpace(space)
          yield* fs.remove(spaceDir(space), { recursive: true, force: true })
        }),

        plans,

        readPlan: Effect.fn('Spaces.readPlan')(function* (space: string, plan: string) {
          yield* requirePlan(space, plan)
          return yield* fs.readFileString(planFile(space, plan), 'utf8')
        }),

        writePlan: Effect.fn('Spaces.writePlan')(function* (
          space: string,
          plan: string,
          data: Record<string, unknown>,
        ) {
          yield* requirePlan(space, plan)
          if (data.id !== plan) return yield* new BadRequest({ message: `The plan's id must stay "${plan}"` })
          yield* checkPlan(data)
          yield* writeJson(planFile(space, plan), data)
        }),

        createPlan: Effect.fn('Spaces.createPlan')(function* (
          space: string,
          body: { name?: unknown; template?: unknown; plan?: unknown },
        ) {
          yield* requireSpace(space)
          let data: Record<string, unknown>
          let layout: Record<string, unknown> | null = null
          if (body.plan && typeof body.plan === 'object') data = { ...(body.plan as Record<string, unknown>) }
          else if (typeof body.template === 'string') {
            const t = yield* template(body.template)
            data = t.plan
            layout = t.layout
          } else return yield* new BadRequest({ message: 'A new plan needs a template or a plan' })
          data.name = cleanName(body.name ?? data.name, 'New plan')
          const id = yield* freePlanId(space, slugify(String(data.name)))
          data.id = id
          yield* checkPlan(data)
          yield* fs.makeDirectory(p.dirname(planFile(space, id)), { recursive: true })
          yield* writeJson(planFile(space, id), data)
          if (layout) {
            yield* fs.makeDirectory(layoutsDir(space, id), { recursive: true })
            const { plan: _plan, ...rest } = withoutArtwork(layout)
            yield* writeJson(p.join(layoutsDir(space, id), layoutFileName(null)), rest)
          }
          return id
        }),

        deletePlan: Effect.fn('Spaces.deletePlan')(function* (space: string, plan: string) {
          yield* requirePlan(space, plan)
          yield* fs.remove(planFile(space, plan))
          yield* fs.remove(layoutsDir(space, plan), { recursive: true, force: true })
        }),

        listTemplates: Effect.fnUntraced(function* (): Effect.fn.Return<TemplateInfo[]> {
          if (!(yield* fs.exists(templatesDir))) return []
          const out: TemplateInfo[] = []
          for (const id of (yield* fs.readDirectory(templatesDir)).sort()) {
            const t = yield* template(id).pipe(Effect.catch(() => Effect.succeed(null)))
            if (t) out.push({ id, name: String(t.plan.name ?? id), subtitle: String(t.plan.subtitle ?? '') })
          }
          return out
        }),

        importWorkspace: Effect.fn('Spaces.importWorkspace')(function* (
          dir: string,
          opts: { id?: string; name?: string } = {},
        ) {
          const ws = yield* readJsonOrEmpty(p.join(dir, 'workspace.json'))
          const space = yield* service.createSpace(opts.name ?? ws.name, opts.id)
          const defaultPlan = String(ws.defaultPlan)
          const planIds: string[] = []
          for (const f of yield* fs.readDirectory(p.join(dir, 'plans'))) {
            if (!f.endsWith('.plan.json')) continue
            yield* fs.copyFile(p.join(dir, 'plans', f), planFile(space, f.replace(/\.plan\.json$/, '')))
            planIds.push(f.replace(/\.plan\.json$/, ''))
          }
          const artwork = p.join(dir, 'artwork')
          if (yield* fs.exists(artwork)) yield* fs.copy(artwork, libraryDir(space, 'artwork'))
          const layouts = p.join(dir, 'layouts')
          for (const f of (yield* fs.exists(layouts)) ? yield* fs.readDirectory(layouts) : []) {
            const slug = slugOfFileName(f)
            if (slug === undefined) continue
            const data = yield* readJsonOrEmpty(p.join(layouts, f))
            // A plan's main layout is decor.json in the default plan's folder, decor.plan-<id>.json for the others.
            const plan =
              slug && isPlanMainSlug(slug)
                ? slug.slice('plan-'.length)
                : typeof data.plan === 'string'
                  ? data.plan
                  : defaultPlan
            if (!planIds.includes(plan)) continue
            const target = slug && isPlanMainSlug(slug) ? null : slug
            const text = JSON.stringify({ ...data, plan: undefined }, null, 2).replaceAll(
              '"/artwork/',
              `"/api/spaces/${space}/artwork/`,
            )
            yield* fs.makeDirectory(layoutsDir(space, plan), { recursive: true })
            yield* fs.writeFileString(p.join(layoutsDir(space, plan), layoutFileName(target)), text + '\n')
          }
          return space
        }),
      })
      return service
    }),
  )
}

/** A space id nobody can guess: the link is the key (docs/adr/0010). */
function randomId() {
  return [...randomBytes(12)].map((b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('')
}

function cleanName(name: unknown, fallback: string) {
  const n = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').slice(0, 60) : ''
  return n || fallback
}
