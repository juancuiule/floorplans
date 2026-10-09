import { Context, Effect, FileSystem, Layer, Path } from 'effect'
import type { LibraryImage } from './api.ts'
import { BadRequest, NotFound, PayloadTooLarge } from './api.ts'
import type { Library } from './storage.ts'
import { fatalFileSystem, orMissing, Spaces } from './storage.ts'

// A space's image libraries (docs/adr/0010): artwork hangs on walls, references
// are floor plan pictures the editor traces. Files live in the space's folder,
// uploads land raw and are served back with a content type from their extension.

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif)$/i
/** The biggest image a library takes — also the server's cap on any request body. */
export const MAX_UPLOAD = 30 * 1024 * 1024
const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
}

export class Libraries extends Context.Service<
  Libraries,
  {
    /** The library's images, in natural order, with their URLs. */
    readonly list: (space: string, kind: Library) => Effect.Effect<LibraryImage[], NotFound>
    /** Stores an upload under a free name derived from `name`; never overwrites. */
    readonly upload: (
      space: string,
      kind: Library,
      name: string | undefined,
      body: Uint8Array,
    ) => Effect.Effect<LibraryImage, NotFound | BadRequest | PayloadTooLarge>
    /** One image's bytes and content type. */
    readonly read: (
      space: string,
      kind: Library,
      name: string,
    ) => Effect.Effect<{ type: string; body: Uint8Array }, NotFound>
  }
>()('server/Libraries') {
  static readonly layer = Layer.effect(
    Libraries,
    Effect.gen(function* () {
      const fs = fatalFileSystem(yield* FileSystem.FileSystem)
      const p = yield* Path.Path
      const spaces = yield* Spaces

      /** A name that is free: the wanted one, or stem-2, stem-3… */
      const uniqueName = Effect.fnUntraced(function* (dir: string, wanted: string) {
        const realExt = p.extname(wanted)
        const ext = realExt.toLowerCase()
        const stem =
          p
            .basename(wanted, realExt)
            .replace(/[^\w.\- ]+/g, '-')
            .slice(0, 80) || 'artwork'
        let name = `${stem}${ext}`
        for (let i = 2; ; i++) {
          if (!(yield* fs.exists(p.join(dir, name)))) return name
          name = `${stem}-${i}${ext}`
        }
      })

      return Libraries.of({
        list: Effect.fn('Libraries.list')(function* (space: string, kind: Library) {
          yield* spaces.requireSpace(space)
          const dir = spaces.libraryDir(space, kind)
          yield* fs.makeDirectory(dir, { recursive: true })
          return (yield* fs.readDirectory(dir))
            .filter((f) => IMAGE_EXT.test(f))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            .map((f) => ({ name: f, url: spaces.imageUrl(space, f, kind) }))
        }),

        upload: Effect.fn('Libraries.upload')(function* (
          space: string,
          kind: Library,
          wanted: string | undefined,
          body: Uint8Array,
        ) {
          yield* spaces.requireSpace(space)
          const name = wanted ?? 'artwork.png'
          if (!IMAGE_EXT.test(name))
            return yield* new BadRequest({ message: 'Only png, jpg, webp, gif or avif images' })
          if (body.length > MAX_UPLOAD) return yield* new PayloadTooLarge({ message: 'Upload too large' })
          const dir = spaces.libraryDir(space, kind)
          yield* fs.makeDirectory(dir, { recursive: true })
          const file = yield* uniqueName(dir, name)
          yield* fs.writeFile(p.join(dir, file), body)
          return { name: file, url: spaces.imageUrl(space, file, kind) }
        }),

        read: Effect.fn('Libraries.read')(function* (space: string, kind: Library, name: string) {
          yield* spaces.requireSpace(space)
          const dir = spaces.libraryDir(space, kind)
          const file = p.join(dir, name)
          // Only the library's own files: anything resolving outside it is a 404.
          if (p.dirname(file) !== dir) return yield* new NotFound({ message: 'Not found' })
          const body = yield* fs.readFile(file).pipe(orMissing(new NotFound({ message: 'Not found' })))
          return { type: CONTENT_TYPES[p.extname(file).toLowerCase()] ?? 'application/octet-stream', body }
        }),
      })
    }),
  )
}
