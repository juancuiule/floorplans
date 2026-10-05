import type { CameraDef, CameraId } from '../model/plan'
import type { Rect, Vec2, Vec3 } from '../model/types'
import { plan } from './plan'
import { sideNames } from './cameraSides'

// Numbers the app needs about the open plan that follow from its geometry, so
// a plan file doesn't have to spell them out.

const { shell } = plan

function union(rects: Rect[]): Rect {
  return rects.reduce<Rect>(
    (u, r) => [Math.min(u[0], r[0]), Math.min(u[1], r[1]), Math.max(u[2], r[2]), Math.max(u[3], r[3])],
    [Infinity, Infinity, -Infinity, -Infinity],
  )
}

const area = (r: Rect) => (r[2] - r[0]) * (r[3] - r[1])

/** Every floor you can stand on (rooms, base floors, the balcony), as one rectangle. */
export const FLOOR_BOUNDS: Rect = union([...shell.baseFloors.map((f) => f.rect), ...shell.rooms.map((r) => r.rect)])

/** The tallest ceiling. */
export const CEILING_TOP = Math.max(...shell.ceilings.map((c) => c.height))

/** The whole unit, walls and slab included: what the sun's shadow camera has to cover. */
export const SCENE_BOX: { min: Vec3; max: Vec3 } = (() => {
  const [x0, z0, x1, z1] = union([shell.slab.rect, FLOOR_BOUNDS])
  return { min: [x0 - 0.1, -0.1, z0 - 0.2], max: [x1 + 0.1, CEILING_TOP + 0.35, z1 + 0.2] }
})()

/** Middle of the lived-in floor, at table height: where the sun and the default cameras aim. */
export const ROOM_CENTER: Vec3 = (() => {
  const [x0, z0, x1, z1] = union(shell.baseFloors.map((f) => f.rect))
  return [(x0 + x1) / 2, 1.2, (z0 + z1) / 2]
})()

/** A point certainly inside the flat (the middle of its largest room), to tell a wall's outer face from its inner one. */
export const INSIDE: Vec2 = (() => {
  const big = [...shell.rooms].sort((a, b) => area(b.rect) - area(a.rect))[0]
  return big ? [(big.rect[0] + big.rect[2]) / 2, (big.rect[1] + big.rect[3]) / 2] : [ROOM_CENTER[0], ROOM_CENTER[2]]
})()

/** Floor patterns are anchored here in plan z, so they run on across neighboring floors. */
export const FLOOR_ORIGIN_Z = Math.max(...shell.baseFloors.map((f) => f.rect[3]))

/** Where along z the front door is: the first door in the wall at the entry end (x min), if there is one. */
const ENTRY_DOOR_Z: number | undefined = shell.walls
  .filter((w) => Math.abs(w.a[0] - w.b[0]) < 1e-6 && Math.abs(w.a[0] - FLOOR_BOUNDS[0]) < 0.3)
  .flatMap((w) =>
    (w.openings ?? []).filter((o) => o.kind === 'door').map((o) => Math.min(w.a[1], w.b[1]) + o.offset + o.width / 2),
  )[0]

/** Where walk mode starts: just inside the front door, or the middle of the entry end without one. */
export const ENTRY_SPOT: Vec2 = [FLOOR_BOUNDS[0] + 0.55, ENTRY_DOOR_Z ?? (FLOOR_BOUNDS[1] + FLOOR_BOUNDS[3]) / 2]

/** Camera presets: the plan's own, or views derived from its bounds. */
export const CAMERAS: Record<CameraId, CameraDef> = (() => {
  const [x0, z0, x1, z1] = FLOOR_BOUNDS
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  const span = Math.max(x1 - x0, z1 - z0)
  const eye = 1.55
  // Stand just inside the front door (the first door in a wall at the plan's entry end), else mid-wall.
  const doorZ = ENTRY_DOOR_Z ?? cz
  const derived: Record<CameraId, CameraDef> = {
    'iso-balcony': {
      label: 'Iso · far end',
      position: [x1 + span * 0.35, span * 0.9, z0 - span * 0.55],
      target: [cx, 0.4, cz],
    },
    'iso-entry': {
      label: 'Iso · entry',
      position: [x0 - span * 0.5, span * 0.9, z1 + span * 0.5],
      target: [cx, 0.4, cz],
    },
    top: { label: 'Top', position: [cx, span * 1.6, cz + 0.0001], target: [cx, 0, cz] },
    'from-balcony': { label: 'From the far end', position: [x1 - 0.25, eye, cz], target: [x0, 1.2, cz] },
    'from-entry': { label: 'From entry', position: [x0 + 0.6, eye, doorZ], target: [x1, 1.1, cz] },
  }
  return { ...derived, ...plan.cameras }
})()

/** The plan's center line along its length (constant z): the iso views flip across it. */
export const CENTER_Z = (FLOOR_BOUNDS[1] + FLOOR_BOUNDS[3]) / 2

/** Names of the plan's two long sides, z min then z max ("bathroom", "hall + kitchen"). */
export const SIDE_NAMES = sideNames(shell)
