import type { MaterialDef, MaterialId, Rect, SceneObject, Shell, Vec2, Vec3 } from './types'
import type { Sketch } from './sketch'

// A plan is one apartment as data: its shell, fixed fittings, materials, where
// it is (for the sun) and the design rules the app needs about it (which walls
// can come out, which can take an accent color, the cameras worth having).
// Plans live in a workspace's plans/<id>.plan.json; everything the app knows about a
// specific flat comes from here or is derived from it (src/project/derived.ts).

export interface Place {
  lat: number
  lon: number
  /** Hours from UTC, no daylight saving. */
  tz: number
}

/** A partition that can come out in a "what if" layout, and what that takes. */
export interface RemovalDef {
  label: string
  /** What goes with it, for the Room tab. */
  note: string
  /** Stretch of the wall (distance from wall.a) that stays standing. */
  keep?: [number, number]
  /**
   * Floor under the old wall, in the finish of the room that owned that side, up
   * to the wall's centerline. `with`: only when those walls are gone too.
   */
  floors: { rect: Rect; material: MaterialId; with?: string[] }[]
}

export type CameraId = 'iso-balcony' | 'iso-entry' | 'top' | 'from-balcony' | 'from-entry'

export interface CameraDef {
  label: string
  position: Vec3
  target: Vec3
}

export interface Plan {
  version: 1
  id: string
  name: string
  /** One line under the name, e.g. the overall size. */
  subtitle?: string
  location: Place & { label?: string }
  materials: Record<MaterialId, MaterialDef>
  shell: Shell
  fixtures: SceneObject[]
  walls: {
    /** Names for walls in the UI; removable walls use their removal label. */
    labels?: Record<string, string>
    /** The facade takes the big opening; party walls are shared with the neighbors. Used for sun shadows. */
    roles?: Record<string, 'facade' | 'party'>
    /** Partitions that carry no load and can come out. */
    removable?: Record<string, RemovalDef>
    /** Walls that can take an accent color, with their short label. */
    accent?: Record<string, string>
  }
  /** A services ceiling that can be raised to the slab, and the wall whose removal leaves a bulkhead at its edge. */
  droppedCeiling?: { id: string; raiseTo: number; bulkheadWall?: string; label: string }
  /** Where the hall's hexagons can scatter into the next room: the area, the passage center and half its span. */
  hexBlend?: { rect: Rect; focus: Vec2; halfSpan: number }
  /** Camera presets; missing ones are derived from the plan's bounds. */
  cameras?: Partial<Record<CameraId, CameraDef>>
  /** Drawn in the floor plan editor: what was drawn, to edit it again (src/model/sketch.ts). */
  sketch?: Sketch
}
