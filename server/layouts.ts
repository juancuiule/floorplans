import { Context, Effect, FileSystem, Layer, Option, Path } from 'effect'
import {
  isHiddenSlug,
  LAYOUT_SLUG,
  type LayoutInfo,
  layoutFileName,
  MAIN_NAME,
  slugify,
  slugOfFileName,
} from '../src/model/layoutNames.ts'
import { BadRequest, NotFound } from './api.ts'
import { fatalFileSystem, orMissing, Spaces } from './storage.ts'

// One plan's layouts on disk, in its folder (server/storage.ts): decor.json is the
// main layout ("Current"), decor.<slug>.json the others. A file may carry its
// display name ({ version, name, finishes, items }); the slug is its identity.

/** The empty layout a missing file reads as. */
const EMPTY = JSON.stringify({ version: 1, items: [] })

const assertSlug = Effect.fnUntraced(function* (slug: string) {
  if (!LAYOUT_SLUG.test(slug)) return yield* new BadRequest({ message: 'Bad layout name' })
})

const cleanName = Effect.fnUntraced(function* (name: unknown) {
  if (typeof name !== 'string' || !name.trim()) return yield* new BadRequest({ message: 'A layout needs a name' })
  return name.trim().replace(/\s+/g, ' ').slice(0, 60)
})

export class Layouts extends Context.Service<
  Layouts,
  {
    /** The layout file's exact text — missing files read as the empty layout. */
    readonly read: (space: string, plan: string, slug: string | null) => Effect.Effect<string, NotFound | BadRequest>
    /** Replaces a layout file; the body must be a layout ({ items: [] }). */
    readonly write: (
      space: string,
      plan: string,
      slug: string | null,
      data: unknown,
    ) => Effect.Effect<void, NotFound | BadRequest>
    /** Every layout: the main one first, then named ones by name. Test files are left out unless `all`. */
    readonly list: (space: string, plan: string, all?: boolean) => Effect.Effect<LayoutInfo[], NotFound>
    /**
     * Saves a new layout named `name`: a copy of `data` when given (the editor's
     * current state), else of the layout `from` (null = main).
     */
    readonly create: (
      space: string,
      plan: string,
      body: { name?: unknown; from?: unknown; data?: unknown },
    ) => Effect.Effect<{ slug: string; name: string }, NotFound | BadRequest>
    /**
     * Renames a layout. A named one also moves to the slug of its new name (when
     * that is free); the main layout keeps its file and only takes the name.
     */
    readonly rename: (
      space: string,
      plan: string,
      slug: string | null,
      name: unknown,
    ) => Effect.Effect<{ slug: string | null; name: string }, NotFound | BadRequest>
    readonly remove: (space: string, plan: string, slug: string | null) => Effect.Effect<void, NotFound | BadRequest>
  }
>()('server/Layouts') {
  static readonly layer = Layer.effect(
    Layouts,
    Effect.gen(function* () {
      const fs = fatalFileSystem(yield* FileSystem.FileSystem)
      const p = yield* Path.Path
      const spaces = yield* Spaces

      const file = (space: string, plan: string, slug: string | null) =>
        p.join(spaces.layoutsDir(space, plan), layoutFileName(slug))

      const exists = (f: string) => fs.exists(f)

      /** The file's JSON, or {} when missing or unparsable. */
      const readJsonOrEmpty = (f: string) =>
        fs.readFileString(f, 'utf8').pipe(
          Effect.map((text) => {
            try {
              const data = JSON.parse(text) as unknown
              return data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
            } catch {
              return {}
            }
          }),
          orMissing(Effect.succeed({} as Record<string, unknown>)),
        )

      const write = (f: string, data: unknown) => fs.writeFileString(f, JSON.stringify(data, null, 2) + '\n')

      /** A slug that is free: the wanted one, or wanted-2, wanted-3… */
      const freeSlug = Effect.fnUntraced(function* (dir: string, wanted: string) {
        const base = wanted.slice(0, 36).replace(/-+$/, '') || 'layout'
        if (!(yield* exists(p.join(dir, layoutFileName(base))))) return base
        for (let i = 2; ; i++) {
          const slug = `${base}-${i}`
          if (!(yield* exists(p.join(dir, layoutFileName(slug))))) return slug
        }
      })

      return Layouts.of({
        read: Effect.fn('Layouts.read')(function* (space: string, plan: string, slug: string | null) {
          yield* spaces.requirePlan(space, plan)
          if (slug !== null) yield* assertSlug(slug)
          return yield* fs.readFileString(file(space, plan, slug), 'utf8').pipe(orMissing(Effect.succeed(EMPTY)))
        }),

        write: Effect.fn('Layouts.write')(function* (space: string, plan: string, slug: string | null, data: unknown) {
          yield* spaces.requirePlan(space, plan)
          if (slug !== null) yield* assertSlug(slug)
          if (!data || typeof data !== 'object' || !Array.isArray((data as { items?: unknown }).items))
            return yield* new BadRequest({ message: 'Expected { items: [] }' })
          const dir = spaces.layoutsDir(space, plan)
          yield* fs.makeDirectory(dir, { recursive: true })
          yield* write(file(space, plan, slug), data)
        }),

        list: Effect.fn('Layouts.list')(function* (space: string, plan: string, all = false) {
          yield* spaces.requirePlan(space, plan)
          const dir = spaces.layoutsDir(space, plan)
          yield* fs.makeDirectory(dir, { recursive: true })
          const out: LayoutInfo[] = []
          for (const f of yield* fs.readDirectory(dir)) {
            const slug = slugOfFileName(f)
            if (slug === undefined) continue
            if (slug && !all && isHiddenSlug(slug)) continue
            const path = p.join(dir, f)
            const [data, stat] = yield* Effect.all([readJsonOrEmpty(path), fs.stat(path)])
            out.push({
              slug,
              name: typeof data.name === 'string' && data.name ? data.name : slug === null ? MAIN_NAME : slug,
              items: Array.isArray(data.items) ? data.items.length : 0,
              updated: new Date(
                Option.getOrElse(
                  Option.map(stat.mtime, (d) => d.getTime()),
                  () => 0,
                ),
              ).toISOString(),
              plan,
            })
          }
          if (!out.some((l) => l.slug === null))
            out.push({ slug: null, name: MAIN_NAME, items: 0, updated: new Date(0).toISOString(), plan })
          return out.sort((a, b) =>
            a.slug === null ? -1 : b.slug === null ? 1 : a.name.localeCompare(b.name, undefined, { numeric: true }),
          )
        }),

        create: Effect.fn('Layouts.create')(function* (
          space: string,
          plan: string,
          body: { name?: unknown; from?: unknown; data?: unknown },
        ) {
          yield* spaces.requirePlan(space, plan)
          const name = yield* cleanName(body.name)
          let data: Record<string, unknown>
          if (body.data !== undefined) {
            data = body.data as Record<string, unknown>
            if (!data || typeof data !== 'object' || !Array.isArray(data.items))
              return yield* new BadRequest({ message: 'Expected { items: [] }' })
          } else {
            const from = (body.from ?? null) as string | null
            if (from !== null) yield* assertSlug(from)
            data = yield* readJsonOrEmpty(file(space, plan, from))
            if (!Array.isArray(data.items)) data.items = []
          }
          const dir = spaces.layoutsDir(space, plan)
          yield* fs.makeDirectory(dir, { recursive: true })
          const slug = yield* freeSlug(dir, slugify(name))
          const { name: _old, ...rest } = data
          yield* write(p.join(dir, layoutFileName(slug)), { version: 1, name, ...rest })
          return { slug, name }
        }),

        rename: Effect.fn('Layouts.rename')(function* (
          space: string,
          plan: string,
          slug: string | null,
          rawName: unknown,
        ) {
          yield* spaces.requirePlan(space, plan)
          const name = yield* cleanName(rawName)
          if (slug !== null) yield* assertSlug(slug)
          const path = file(space, plan, slug)
          if (!(yield* exists(path))) return yield* new NotFound({ message: 'No such layout' })
          const { name: _old, version: _v, ...rest } = yield* readJsonOrEmpty(path)
          const dir = spaces.layoutsDir(space, plan)
          let next = slug
          if (slug !== null) {
            const wanted = slugify(name)
            if (wanted !== slug) next = yield* freeSlug(dir, wanted)
          }
          yield* write(file(space, plan, next), { version: 1, name, ...rest })
          if (next !== slug) yield* fs.remove(path)
          return { slug: next, name }
        }),

        remove: Effect.fn('Layouts.remove')(function* (space: string, plan: string, slug: string | null) {
          yield* spaces.requirePlan(space, plan)
          if (slug === null) return yield* new BadRequest({ message: 'The current layout cannot be deleted' })
          yield* assertSlug(slug)
          const path = file(space, plan, slug)
          if (!(yield* exists(path))) return yield* new NotFound({ message: 'No such layout' })
          yield* fs.remove(path)
        }),
      })
    }),
  )
}
