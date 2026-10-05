import type { DecorFile } from '../model/decor'
import { Checker, type Problems } from '../model/validate'
import { FRAME_STYLES, LAMPS, PLANTS, POTS } from './catalog'
import { FURNITURE } from './furnitureCatalog'

// Checks a layout file before the app uses it (see src/model/validate.ts). The
// scene looks every item up in the catalogs, so an unknown species or furniture
// type in a hand edit would break rendering; here it is a readable problem
// instead. Finishes are not checked: normalizeFinishes reads any value safely.

const FACINGS = ['x+', 'x-', 'z+', 'z-'] as const
const FITS = ['cover', 'contain'] as const

/** Problems with a layout file, or none. */
export function validateLayout(raw: unknown): Problems {
  const c = new Checker()
  if (!c.object(raw, 'layout')) return c.problems
  if (raw.version !== undefined) c.oneOf(raw.version, [1], 'version')
  if (raw.items === undefined) return c.problems
  if (!c.array(raw.items, 'items')) return c.problems
  c.unique(
    raw.items.map((i) => (i && typeof i === 'object' ? (i as { id?: unknown }).id : undefined)),
    'items',
  )
  raw.items.forEach((item, n) => {
    const at = `items[${n}]`
    if (!c.object(item, at)) return
    c.string(item.id, `${at}.id`)
    c.tuple(item.at, 3, `${at}.at`)
    if (item.facing !== undefined) c.oneOf(item.facing, FACINGS, `${at}.facing`)
    switch (item.kind) {
      case 'artwork':
        c.string(item.image, `${at}.image`)
        c.oneOf(item.facing, FACINGS, `${at}.facing`)
        c.oneOf(item.fit, FITS, `${at}.fit`)
        if (c.object(item.size, `${at}.size`)) {
          c.number(item.size.w, `${at}.size.w`, { positive: true })
          c.number(item.size.h, `${at}.size.h`, { positive: true })
        }
        if (c.object(item.frame, `${at}.frame`))
          c.oneOf(
            item.frame.style,
            FRAME_STYLES.map((f) => f.id),
            `${at}.frame.style`,
          )
        break
      case 'plant':
        c.oneOf(item.species, Object.keys(PLANTS), `${at}.species`)
        c.oneOf(
          item.pot,
          POTS.map((p) => p.id),
          `${at}.pot`,
        )
        c.number(item.scale, `${at}.scale`, { positive: true })
        break
      case 'lamp':
        c.oneOf(item.type, Object.keys(LAMPS), `${at}.type`)
        break
      case 'furniture':
        c.oneOf(item.type, Object.keys(FURNITURE), `${at}.type`)
        c.tuple(item.size, 3, `${at}.size`)
        c.object(item.finish, `${at}.finish`)
        c.object(item.options, `${at}.options`)
        break
      default:
        c.oneOf(item.kind, ['artwork', 'plant', 'lamp', 'furniture'], `${at}.kind`)
    }
  })
  return c.problems
}

/** Narrows a checked layout file. */
export const isLayoutFile = (raw: unknown): raw is DecorFile => validateLayout(raw).length === 0
