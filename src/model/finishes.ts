// Finishes: floors, wall paint and bathroom tiles, chosen per layout and saved
// in the layout file next to the decor items. Every field has a default that
// reproduces the original look, so a file without `finishes` renders as before.

import type { Plan } from './plan'
import { DEFAULT_STRUCTURE, isDefaultStructure, normalizeStructure, type Structure } from './structure'

/** Floor finishes, see src/project/finishes.ts for how each one looks. */
export const FLOOR_IDS = [
  'oakLight',
  'oakNatural',
  'walnut',
  'herringbone',
  'concrete',
  'hexGrey',
  'hexCharcoal',
  'terracotta',
  'cementQuarter',
  'porcelainGrey',
  'balconyGrey',
] as const
export type FloorId = (typeof FLOOR_IDS)[number]

/** The floor zones the owner can finish separately. */
export type FloorZone = 'main' | 'hall' | 'bath' | 'balcony'

/** Which floors make sense where (the first one is the default). */
export const ZONE_FLOORS: Record<FloorZone, readonly FloorId[]> = {
  main: ['oakLight', 'oakNatural', 'walnut', 'herringbone', 'concrete', 'hexGrey', 'hexCharcoal', 'terracotta'],
  hall: [
    'oakLight',
    'oakNatural',
    'walnut',
    'herringbone',
    'concrete',
    'hexGrey',
    'hexCharcoal',
    'terracotta',
    'cementQuarter',
  ],
  bath: ['porcelainGrey', 'cementQuarter', 'hexGrey', 'hexCharcoal', 'concrete', 'terracotta'],
  balcony: ['balconyGrey', 'terracotta', 'concrete', 'hexGrey', 'hexCharcoal', 'cementQuarter'],
}

/** Main-room walls that can take an accent color: 'none' and the plan's `walls.accent`. */
export const accentWalls = (plan: Pick<Plan, 'walls'>): readonly string[] => [
  'none',
  ...Object.keys(plan.walls.accent ?? {}),
]
/** 'none' or a wall id from the plan's `walls.accent`. */
export type AccentWall = string

export const TILE_LAYOUTS = ['stack', 'subway', 'square', 'vertical'] as const
export type TileLayout = (typeof TILE_LAYOUTS)[number]

/** How the shower is closed off: a glass door, a curtain on a rail, or open (walk-in). */
export const SHOWER_SCREENS = ['glass', 'curtain', 'open'] as const
export type ShowerScreen = (typeof SHOWER_SCREENS)[number]
export const SHOWER_FITTINGS = ['chrome', 'black', 'brass'] as const
export type ShowerFittings = (typeof SHOWER_FITTINGS)[number]

export interface Finishes {
  floors: Record<FloorZone, FloorId>
  /** Hexagons from the hall scattered into the main-room floor past the passage. */
  hexBlend: boolean
  /** Paint for every plastered wall. */
  wallPaint: string
  /**
   * Paint per wall side, over the base color: face id (see src/project/paintFaces.ts:
   * `<wall>:<+|->:<room>`) to color. Missing faces take `wallPaint`.
   */
  paint: Record<string, string>
  /** Ceiling color. */
  ceilingPaint: string
  accentWall: AccentWall
  accentColor: string
  bathTile: { layout: TileLayout; color: string }
  shower: { screen: ShowerScreen; curtainColor: string; fittings: ShowerFittings }
  /** Walls taken out and the entry ceiling raised (src/model/structure.ts). Absent: the flat as built. */
  structure?: Structure
}

export const DEFAULT_FINISHES: Finishes = {
  floors: { main: 'oakLight', hall: 'oakLight', bath: 'porcelainGrey', balcony: 'balconyGrey' },
  hexBlend: false,
  wallPaint: '#f3f1ec',
  paint: {},
  ceilingPaint: '#f7f6f2',
  accentWall: 'none',
  accentColor: '#9fae95',
  bathTile: { layout: 'stack', color: '#f6f6f4' },
  shower: { screen: 'glass', curtainColor: '#f2f0ea', fittings: 'chrome' },
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i
/** `<wall>:<+|->:<room>` */
const FACE_ID = /^[\w-]+:[+-]:[\w-]+$/

const color = (v: unknown, fallback: string) =>
  typeof v === 'string' && HEX_COLOR.test(v) ? v.toLowerCase() : fallback
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  options.includes(v as T) ? (v as T) : fallback

/**
 * Reads `finishes` from a layout file: missing or unknown values fall back to
 * the default (the original look), so old files and hand edits never break.
 * Wall ids are checked against `plan`, the plan the layout furnishes.
 */
export function normalizeFinishes(raw: unknown, plan: Pick<Plan, 'walls'>): Finishes {
  const d = DEFAULT_FINISHES
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const floors = (r.floors && typeof r.floors === 'object' ? r.floors : {}) as Record<string, unknown>
  const tile = (r.bathTile && typeof r.bathTile === 'object' ? r.bathTile : {}) as Record<string, unknown>
  const shower = (r.shower && typeof r.shower === 'object' ? r.shower : {}) as Record<string, unknown>
  const structure = normalizeStructure(r.structure, plan)
  return {
    floors: {
      main: oneOf(floors.main, ZONE_FLOORS.main, d.floors.main),
      hall: oneOf(floors.hall, ZONE_FLOORS.hall, d.floors.hall),
      bath: oneOf(floors.bath, ZONE_FLOORS.bath, d.floors.bath),
      balcony: oneOf(floors.balcony, ZONE_FLOORS.balcony, d.floors.balcony),
    },
    hexBlend: r.hexBlend === true,
    wallPaint: color(r.wallPaint, d.wallPaint),
    paint: Object.fromEntries(
      Object.entries(r.paint && typeof r.paint === 'object' ? (r.paint as Record<string, unknown>) : {}).flatMap(
        ([k, v]) => (FACE_ID.test(k) && typeof v === 'string' && HEX_COLOR.test(v) ? [[k, v.toLowerCase()]] : []),
      ),
    ),
    ceilingPaint: color(r.ceilingPaint, d.ceilingPaint),
    accentWall: oneOf(r.accentWall, accentWalls(plan), d.accentWall),
    accentColor: color(r.accentColor, d.accentColor),
    bathTile: {
      layout: oneOf(tile.layout, TILE_LAYOUTS, d.bathTile.layout),
      color: color(tile.color, d.bathTile.color),
    },
    shower: {
      screen: oneOf(shower.screen, SHOWER_SCREENS, d.shower.screen),
      curtainColor: color(shower.curtainColor, d.shower.curtainColor),
      fittings: oneOf(shower.fittings, SHOWER_FITTINGS, d.shower.fittings),
    },
    ...(isDefaultStructure(structure) ? {} : { structure }),
  }
}

/** The layout's structure, the built flat when it has none. */
export const structureOf = (f: Finishes): Structure => f.structure ?? DEFAULT_STRUCTURE

/** Finishes with a new structure; the key is dropped when it is back to the built flat. */
export function withStructure(f: Finishes, s: Structure): Finishes {
  const { structure: _old, ...rest } = f
  void _old
  return isDefaultStructure(s) ? rest : { ...rest, structure: s }
}

export const sameFinishes = (a: Finishes, b: Finishes) => JSON.stringify(a) === JSON.stringify(b)

export const isDefaultFinishes = (f: Finishes) => sameFinishes(f, DEFAULT_FINISHES)

/** True when the hall's hexagons should spill into the main room: only hex into a non-hex floor. */
export const showsHexBlend = (f: Finishes) =>
  f.hexBlend && f.floors.hall.startsWith('hex') && !f.floors.main.startsWith('hex')
