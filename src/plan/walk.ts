import { isPendant, PENDANT_RADIUS, pendantBottom } from '../decor/pendant'
import type { DecorItem } from '../model/decor'
import type { Vec2 } from '../model/types'
import { FLOOR_BOUNDS, ENTRY_SPOT } from '../project/derived'
import { furnitureObstacles, pushOut, shellObstacles, walkable, type Obstacle } from './obstacles'

/** Half the width of a person's shoulders, roughly: how close the eye gets to a wall. */
export const BODY_RADIUS = 0.2
/** Where walk mode starts when no spot is picked: inside the front door, looking down the flat. */
export { ENTRY_SPOT }

/** Floor you can stand on: every room and floor in the plan. */
const [bx0, bz0, bx1, bz1] = FLOOR_BOUNDS
const BOUNDS = { x0: bx0, x1: bx1, z0: bz0, z1: bz1 }
const STEP = 0.05
const ITERATIONS = 4

/** Walk-mode eye height (Walk.tsx). */
export const EYE = 1.6
/** A pendant whose bottom is lower than this is in the way of a head: walk around it. */
export const HEAD_TOP = EYE + 0.2

/** Pendants hanging low enough to walk into (a long cord, a big lantern under a low ceiling). */
export function lowPendants(items: DecorItem[]): Obstacle[] {
  const out: Obstacle[] = []
  for (const i of items) {
    if (i.kind !== 'lamp' || !isPendant(i.type) || i.at[1] < 0 || pendantBottom(i, items) >= HEAD_TOP) continue
    const r = PENDANT_RADIUS[i.type] ?? 0.2
    out.push({ id: i.id, kind: 'furniture', cx: i.at[0], cz: i.at[2], hw: r, hd: r, rotation: 0, top: i.at[1] })
  }
  return out
}

export function walkObstacles(items: DecorItem[]): Obstacle[] {
  return [...shellObstacles(walkable), ...furnitureObstacles(items), ...lowPendants(items)]
}

export function insideFlat(x: number, z: number): boolean {
  return x >= BOUNDS.x0 && x <= BOUNDS.x1 && z >= BOUNDS.z0 && z <= BOUNDS.z1
}

/** Moves the disc out of every obstacle it touches (a few passes settle corners). */
export function resolve(p: Vec2, obstacles: Obstacle[], radius = BODY_RADIUS): Vec2 {
  let q: Vec2 = [p[0], p[1]]
  for (let k = 0; k < ITERATIONS; k++) {
    let moved = false
    for (const o of obstacles) {
      const r = pushOut(o, q, radius)
      if (r) {
        q = r
        moved = true
      }
    }
    if (!moved) break
  }
  q[0] = Math.min(BOUNDS.x1 - radius, Math.max(BOUNDS.x0 + radius, q[0]))
  q[1] = Math.min(BOUNDS.z1 - radius, Math.max(BOUNDS.z0 + radius, q[1]))
  return q
}

/**
 * Walks from `p` by `delta`, sliding along whatever is in the way. Long moves
 * are split into short steps so a fast frame cannot tunnel through a partition.
 */
export function walk(p: Vec2, delta: Vec2, obstacles: Obstacle[], radius = BODY_RADIUS): Vec2 {
  const len = Math.hypot(delta[0], delta[1])
  const n = Math.max(1, Math.ceil(len / STEP))
  let q: Vec2 = [p[0], p[1]]
  for (let i = 0; i < n; i++) q = resolve([q[0] + delta[0] / n, q[1] + delta[1] / n], obstacles, radius)
  return q
}
