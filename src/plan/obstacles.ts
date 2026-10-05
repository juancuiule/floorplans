import { footprintOf, isFloorPiece, type Footprint } from '../decor/placement'
import type { DecorItem } from '../model/decor'
import type { Opening, Vec2, Wall } from '../model/types'
import { project } from '../project'
import { activeBulges, activeWalls, onStructure } from '../project/structure'

// The plan as a set of solid rectangles: wall pieces between openings, columns,
// fixed fittings and floor furniture. Walk mode collides against them, the
// clearance check casts rays at them and the measure tool snaps to their edges.

export interface Obstacle extends Footprint {
  id: string
  kind: 'wall' | 'column' | 'fixture' | 'furniture'
  /** Top of the solid, meters above the floor. */
  top: number
}

/** Decides whether an opening leaves a gap in the plan (true) or counts as solid (false). */
export type OpeningRule = (o: Opening, w: Wall) => boolean

const doorway = (o: Opening) => (o.sill ?? 0) < 0.05 && o.height > 1.5
/** Openings you can walk through: floor-level and door height. The front door leads out of the flat. */
export const walkable: OpeningRule = (o) => doorway(o) && o.id !== 'front-door'
/** Clearances look through doors and the passage, but glass stops them. */
export const passable: OpeningRule = (o) => doorway(o) && o.kind !== 'window'

/** Floor-standing fittings that take up floor area, with a size where the fixture list has none. */
const FIXTURE_SIZE: Partial<Record<string, [number, number, number]>> = {
  toilet: [0.4, 0.8, 0.6],
  basin: [0.46, 0.86, 0.38],
  fridge: [0.6, 1.75, 0.62],
  counter: [1.45, 0.9, 0.6],
  railing: [1, 1.05, 0.02],
}

const cache = new Map<OpeningRule, Obstacle[]>()
// Walls taken out (or put back) in the open layout: rebuild.
onStructure(() => cache.clear())

/** Walls, columns and fixed fittings (everything that is not decor). Removed partitions are left out. */
export function shellObstacles(open: OpeningRule): Obstacle[] {
  const hit = cache.get(open)
  if (hit) return hit
  const out: Obstacle[] = []
  for (const w of activeWalls()) {
    const dx = w.b[0] - w.a[0]
    const dz = w.b[1] - w.a[1]
    const len = Math.hypot(dx, dz)
    const ux = dx / len
    const uz = dz / len
    const gaps = (w.openings ?? [])
      .filter((o) => open(o, w))
      .map((o) => [o.offset, o.offset + o.width] as const)
      .sort((p, q) => p[0] - q[0])
    let s = 0
    const spans: [number, number][] = []
    for (const [g0, g1] of gaps) {
      if (g0 > s) spans.push([s, g0])
      s = Math.max(s, g1)
    }
    if (s < len) spans.push([s, len])
    const rotation = (Math.atan2(-uz, ux) * 180) / Math.PI
    spans.forEach(([s0, s1], i) => {
      const mid = (s0 + s1) / 2
      out.push({
        id: `${w.id}:${i}`,
        kind: 'wall',
        cx: w.a[0] + ux * mid,
        cz: w.a[1] + uz * mid,
        hw: (s1 - s0) / 2,
        hd: w.thickness / 2,
        rotation,
        top: w.height,
      })
    })
  }
  for (const b of activeBulges()) {
    if (b.min[1] > 0.1) continue
    out.push({
      id: b.id,
      kind: 'column',
      cx: (b.min[0] + b.max[0]) / 2,
      cz: (b.min[2] + b.max[2]) / 2,
      hw: (b.max[0] - b.min[0]) / 2,
      hd: (b.max[2] - b.min[2]) / 2,
      rotation: 0,
      top: b.max[1],
    })
  }
  for (const o of project.objects) {
    const size = o.size ?? FIXTURE_SIZE[o.type]
    if (!size || !(o.type in FIXTURE_SIZE) || o.position[1] > 0.05) continue
    out.push({
      id: o.id,
      kind: 'fixture',
      cx: o.position[0],
      cz: o.position[2],
      hw: size[0] / 2,
      hd: size[2] / 2,
      rotation: o.rotation ?? 0,
      top: size[1],
    })
  }
  cache.set(open, out)
  return out
}

/** Floor furniture as obstacles (rugs lie flat and are left out). */
export function furnitureObstacles(items: DecorItem[], skipId?: string | null): Obstacle[] {
  const out: Obstacle[] = []
  for (const i of items) {
    if (i.id === skipId || !isFloorPiece(i)) continue
    out.push({ id: i.id, kind: 'furniture', ...footprintOf(i), top: i.at[1] + i.size[1] })
  }
  return out
}

// ---------- rectangle math ----------

const DEG = Math.PI / 180

/** The rectangle's local axes in plan: local +x and local +z as (x, z). */
export function axesOf(r: Footprint): { ux: Vec2; uz: Vec2 } {
  const a = r.rotation * DEG
  return { ux: [Math.cos(a), -Math.sin(a)], uz: [Math.sin(a), Math.cos(a)] }
}

function toLocal(r: Footprint, x: number, z: number): Vec2 {
  const { ux, uz } = axesOf(r)
  const dx = x - r.cx
  const dz = z - r.cz
  return [dx * ux[0] + dz * ux[1], dx * uz[0] + dz * uz[1]]
}

function toWorld(r: Footprint, lx: number, lz: number): Vec2 {
  const { ux, uz } = axesOf(r)
  return [r.cx + lx * ux[0] + lz * uz[0], r.cz + lx * ux[1] + lz * uz[1]]
}

/** Distance from a plan point to a rectangle (0 inside). */
export function distanceTo(r: Footprint, x: number, z: number): number {
  const [lx, lz] = toLocal(r, x, z)
  return Math.hypot(Math.max(0, Math.abs(lx) - r.hw), Math.max(0, Math.abs(lz) - r.hd))
}

/**
 * Pushes a disc of radius `radius` centered at p out of the rectangle.
 * Returns the corrected center, or null if the disc does not touch it.
 */
export function pushOut(r: Footprint, p: Vec2, radius: number): Vec2 | null {
  let [lx, lz] = toLocal(r, p[0], p[1])
  const qx = Math.max(-r.hw, Math.min(r.hw, lx))
  const qz = Math.max(-r.hd, Math.min(r.hd, lz))
  const ex = lx - qx
  const ez = lz - qz
  const d = Math.hypot(ex, ez)
  if (d >= radius) return null
  if (d > 1e-9) {
    lx = qx + (ex / d) * radius
    lz = qz + (ez / d) * radius
  } else if (r.hw - Math.abs(lx) < r.hd - Math.abs(lz)) {
    // Center inside: leave through the nearest side.
    lx = (lx < 0 ? -1 : 1) * (r.hw + radius)
  } else {
    lz = (lz < 0 ? -1 : 1) * (r.hd + radius)
  }
  return toWorld(r, lx, lz)
}

/** Distance along a plan ray (unit direction) to where it enters the rectangle; 0 if it starts inside, Infinity if it misses. */
export function rayHit(r: Footprint, o: Vec2, dir: Vec2): number {
  const [ox, oz] = toLocal(r, o[0], o[1])
  const { ux, uz } = axesOf(r)
  const dx = dir[0] * ux[0] + dir[1] * ux[1]
  const dz = dir[0] * uz[0] + dir[1] * uz[1]
  let t0 = -Infinity
  let t1 = Infinity
  for (const [p, d, h] of [
    [ox, dx, r.hw],
    [oz, dz, r.hd],
  ]) {
    if (Math.abs(d) < 1e-12) {
      if (p < -h || p > h) return Infinity
      continue
    }
    let a = (-h - p) / d
    let b = (h - p) / d
    if (a > b) [a, b] = [b, a]
    t0 = Math.max(t0, a)
    t1 = Math.min(t1, b)
    if (t0 > t1) return Infinity
  }
  if (t1 < 0) return Infinity
  return Math.max(0, t0)
}
