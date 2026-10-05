import type { Finishes } from './finishes'
import type { Vec3 } from './types'

// Movable decor, saved to layouts/decor.json. Positions are plan coordinates (meters).

/** Which way a wall-mounted item faces: the outward normal of the surface it hangs on. */
export type Facing = 'x+' | 'x-' | 'z+' | 'z-'

/** Items grouped together (a gallery wall, a desk setup) share a group id; clicking one selects them all. */
export interface Groupable {
  groupId?: string
}

export type SizePreset = 'A5' | 'A4' | 'A3' | 'A2' | '50x70' | 'custom'
export type FrameStyle = 'none' | 'thin' | 'classic' | 'box' | 'float' | 'canvas'

export interface ArtworkItem extends Groupable {
  kind: 'artwork'
  id: string
  /** URL under /artwork. */
  image: string
  /** Center of the artwork, on the wall surface. */
  at: Vec3
  facing: Facing
  /** Wall id, so the piece hides with its wall in dollhouse mode. */
  host?: string
  /** Visible print size in meters, orientation already applied. */
  size: { preset: SizePreset; w: number; h: number }
  /** cover crops the image to the print size; contain letterboxes it on paper. */
  fit: 'cover' | 'contain'
  frame: { style: FrameStyle; color: string; /** Passe-partout width, meters. */ mat: number }
}

export type PlantSpecies =
  | 'monstera'
  | 'snake'
  | 'fiddle'
  | 'olive'
  | 'fern'
  | 'palm'
  | 'cactus'
  | 'lavender'
  | 'pothos'
  | 'succulent'
  | 'herbs'
  | 'aloe'
  | 'jade'
  | 'burro'
  | 'haworthia'
  | 'rubber'
  | 'croton'
  | 'spider'
  | 'collection'
  | 'windowBox'
export type PotStyle = 'terracotta' | 'ceramic' | 'concrete' | 'basket' | 'black' | 'clay'
/** Standard clay pot diameters in cm; 'auto' keeps the species' own pot. */
export type PotSize = 'auto' | 6 | 8 | 12

export interface PlantItem extends Groupable {
  kind: 'plant'
  id: string
  species: PlantSpecies
  pot: PotStyle
  /** Base of the pot (or the ceiling hook for hanging plants). */
  at: Vec3
  /** Degrees around y. */
  rotation: number
  scale: number
  /** A standard clay pot of this diameter; the plant is scaled to suit it. */
  potSize?: PotSize
  /** Collection only: how many pots, and the width of the strip they fill (m). */
  count?: number
  spread?: number
  /** Varies the random layout of leaves (and of a collection's pots); defaults to the id. */
  seed?: string
  /** Window box only: the wall it hangs on. */
  facing?: Facing
  host?: string
}

export type LampType =
  | 'arc'
  | 'tripod'
  | 'table'
  | 'mushroom'
  | 'flowerpot'
  | 'pendant'
  | 'globe'
  | 'lantern'
  | 'sconce'
  | 'exit'
  | 'exitCeiling'
  | 'string'
export type Warmth = 2700 | 3000 | 4000

export interface LampItem extends Groupable {
  kind: 'lamp'
  id: string
  type: LampType
  /** Base on a surface, ceiling point for pendants, or wall point for wall lights. */
  at: Vec3
  rotation: number
  facing?: Facing
  host?: string
  on: boolean
  /** Multiplier on the lamp's nominal output. */
  brightness: number
  warmth: Warmth
  /** Body / shade color. */
  color: string
  /** String lights only: run length along the wall, meters. */
  length?: number
  /**
   * Pendants only: cord from the ceiling to the top of the shade, meters. Left
   * out, it follows the room (src/decor/pendant.ts): the bottom stays at 1.95 m
   * or higher, or hangs 70 cm over a dining table under it.
   */
  drop?: number
}

export type FurnitureType =
  // floor
  | 'platformBed'
  | 'murphyBed'
  | 'daybed'
  | 'sofa'
  | 'standingDesk'
  | 'diningTable'
  | 'chair'
  | 'butterflyChair'
  | 'bookshelf'
  | 'wardrobe'
  | 'sideboard'
  | 'blockShelf'
  | 'rug'
  | 'loftBed'
  | 'glassDivider'
  | 'officeChair'
  | 'bistroChair'
  | 'windowBench'
  | 'wireBasket'
  | 'balconyBench'
  | 'planterWall'
  | 'mugs'
  // wall
  | 'gridShelf'
  | 'upperCabinets'
  | 'floatingShelf'
  | 'pegGrid'
  | 'kitchenRail'
  | 'fruitBaskets'
  | 'stationClock'
  | 'retroClock'
  | 'railTable'
  | 'embroideryHoop'
  // ceiling
  | 'hangingRack'
  // appliances & electronics
  | 'speakers'
  | 'standMixer'
  | 'espressoMachine'
  | 'turntable'
  | 'acIndoor'
  | 'acOutdoor'
  | 'tv'
  | 'tvWall'
  | 'fridge'

export type FurnitureOption = number | boolean | string

export interface FurnitureItem extends Groupable {
  kind: 'furniture'
  id: string
  type: FurnitureType
  /**
   * Floor pieces: footprint center at the floor. Wall pieces: on the wall
   * surface, y = bottom edge. Ceiling pieces: the ceiling point they hang from.
   */
  at: Vec3
  rotation: number
  facing?: Facing
  host?: string
  /** [width, height, depth] in meters, in the piece's own axes (+z is its front). */
  size: Vec3
  finish: { body: string; metal: string; fabric: string }
  options: Record<string, FurnitureOption>
}

export type DecorItem = ArtworkItem | PlantItem | LampItem | FurnitureItem
export type DecorKind = DecorItem['kind']

/**
 * Below this height an item has not been dropped anywhere yet: a new item
 * waiting for its first click is parked under the floor, out of sight.
 */
export const UNPLACED_Y = -50

/** Where a new item waits until it is placed. */
export const unplacedAt = (): Vec3 => [0, UNPLACED_Y - 1, 0]

export const isPlaced = (item: DecorItem) => item.at[1] > UNPLACED_Y

/** One layout variant: layouts/decor.json ("Current") or layouts/decor.<slug>.json. */
export interface DecorFile {
  version: 1
  /** Display name in the layouts menu; the file name (slug) when missing. */
  name?: string
  /** The plan (plans/<id>.plan.json) this layout furnishes; missing means the default plan. */
  plan?: string
  /** Floors, paint and tiles for this layout; omitted when they are the defaults. */
  finishes?: Partial<Finishes>
  /** Names given to groups (by groupId); groups without one get a default name. */
  groups?: Record<string, { name: string }>
  items: DecorItem[]
}
