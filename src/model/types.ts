// Plan coordinates, in meters (docs/your-own-floorplan.md#2-measure-and-pick-your-axes).
// x runs along the apartment: 0 = inner face of the entry wall, the facade at the far end (+x).
// z runs across: 0 = the inner face of one long wall.
// y is up, 0 = finished floor.

export type Vec2 = [x: number, z: number]
export type Vec3 = [x: number, y: number, z: number]
export type Rect = [x0: number, z0: number, x1: number, z1: number]

export type MaterialId = string

export interface MaterialDef {
  color: string
  roughness?: number
  metalness?: number
  opacity?: number
  emissive?: string
  /** Procedural surface pattern, in meters. */
  pattern?: PatternDef
}

/** Procedural surface patterns (src/scene/patterns.ts). Sizes in meters; `color` of the material is the base tone. */
export type PatternDef =
  /** Boards running along x, staggered. `grain` 0–1 sets how visible the grain is. */
  | { kind: 'planks'; width: number; length: number; grain?: number }
  /** Rectangular tiles; `bond` 0.5 offsets every other row by half a tile; `tones` mixes colors tile by tile. */
  | { kind: 'tiles'; width: number; height: number; grout: string; bond?: number; tones?: string[]; vary?: number }
  /** Boards in a 45° herringbone. */
  | { kind: 'herringbone'; width: number; length: number; grain?: number }
  /** Hexagonal tiles, `size` across flats, colored at random from `tones`. */
  | { kind: 'hex'; size: number; grout: string; tones: string[] }
  /** Polished concrete: soft mottling and fine aggregate. */
  | { kind: 'concrete' }
  /** Cement tiles with a quarter circle in one corner, turned to make circles. */
  | { kind: 'quarter'; size: number; ink: string; grout: string }

export interface DoorLeaf {
  /** Which jamb the hinge sits on: 'a' = the end nearest wall.a. */
  hinge: 'a' | 'b'
  /** Side the leaf swings to: +1 = toward the wall normal (wallFrame().n), -1 = away. */
  swing: 1 | -1
  openDeg: number
  material: MaterialId
  frameMaterial: MaterialId
}

export interface Glazing {
  panels: number
  frameMaterial: MaterialId
}

export interface Opening {
  id: string
  kind: 'door' | 'window' | 'passage'
  /** Distance from wall.a to the near edge of the opening, along the wall. */
  offset: number
  width: number
  height: number
  sill?: number
  leaf?: DoorLeaf
  glazing?: Glazing
}

export interface Wall {
  id: string
  /** Centerline endpoints. */
  a: Vec2
  b: Vec2
  thickness: number
  height: number
  /** Exterior walls are cut away in dollhouse mode when they face the camera. */
  kind: 'exterior' | 'interior'
  material: MaterialId
  openings?: Opening[]
}

/** Columns, beams, soffits: boxes in plan coordinates that fade with a host wall. */
export interface Bulge {
  id: string
  host: string
  min: Vec3
  max: Vec3
  material: MaterialId
}

export interface Room {
  id: string
  name: string
  rect: Rect
  /** Omit to leave the base floor showing. */
  floor?: MaterialId
  label?: boolean
  /** Label position when the rect center is not a good spot. */
  labelAt?: Vec2
  /** Dimension text when the rect is not the whole room. */
  labelDims?: string
}

export interface Ceiling {
  id: string
  rect: Rect
  height: number
  material: MaterialId
}

export interface Shell {
  walls: Wall[]
  bulges: Bulge[]
  rooms: Room[]
  ceilings: Ceiling[]
  /** Continuous finished floor under everything that has no room floor of its own, one zone per finish. */
  baseFloors: { id: string; rect: Rect; material: MaterialId }[]
  /** Thin paint layers over one face of a wall, shown when that wall is the accent wall. */
  accentPanels: { wall: string; min: Vec3; max: Vec3 }[]
  slab: { rect: Rect; thickness: number; material: MaterialId }
}

export type ObjectType =
  'box' | 'toilet' | 'basin' | 'showerTray' | 'counter' | 'kitchenSink' | 'cooktop' | 'fridge' | 'downlight' | 'railing'

export interface SceneObject {
  id: string
  type: ObjectType
  /** Footprint center at its base. Local +z is the object's front. */
  position: Vec3
  /** Degrees around y. */
  rotation?: number
  /** [width, height, depth] in local axes. */
  size?: Vec3
  material?: MaterialId
  /** Type-specific extras. */
  props?: Record<string, unknown>
}

export interface Project {
  name: string
  materials: Record<MaterialId, MaterialDef>
  shell: Shell
  objects: SceneObject[]
}
