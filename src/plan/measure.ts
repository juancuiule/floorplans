import { ceilingAt } from '../decor/placement'
import type { DecorItem } from '../model/decor'
import type { Vec3 } from '../model/types'
import { furnitureObstacles, shellObstacles, type Obstacle, type OpeningRule } from './obstacles'

/** Snap distance for the measure tool. */
export const SNAP = 0.05

/** An axis-aligned edge line in plan: the plane `axis = coord`, over [min, max] of the other axis. */
export interface EdgeLine {
  axis: 'x' | 'z'
  coord: number
  min: number
  max: number
}

/** Doors and the passage leave gaps (their jambs snap); glass counts as a wall face. */
const gapsAtDoors: OpeningRule = (o) => o.kind !== 'window'

/** Edge lines of every axis-aligned solid: wall faces and jambs, columns, fittings, furniture sides. */
export function edgeLines(items: DecorItem[]): { lines: EdgeLine[]; tops: Obstacle[] } {
  const solids = [...shellObstacles(gapsAtDoors), ...furnitureObstacles(items)]
  const lines: EdgeLine[] = []
  for (const r of solids) {
    const q = ((Math.round(r.rotation) % 180) + 180) % 180
    if (q !== 0 && q !== 90) continue
    const [hx, hz] = q === 0 ? [r.hw, r.hd] : [r.hd, r.hw]
    lines.push(
      { axis: 'x', coord: r.cx - hx, min: r.cz - hz, max: r.cz + hz },
      { axis: 'x', coord: r.cx + hx, min: r.cz - hz, max: r.cz + hz },
      { axis: 'z', coord: r.cz - hz, min: r.cx - hx, max: r.cx + hx },
      { axis: 'z', coord: r.cz + hz, min: r.cx - hx, max: r.cx + hx },
    )
  }
  return { lines, tops: solids }
}

export interface Snapped {
  point: Vec3
  /** Which coordinates were pulled onto an edge (or onto an earlier endpoint). */
  snapped: boolean
}

/**
 * Pulls a picked point onto nearby edges: x and z each onto the nearest edge
 * line within `tol` (both at once lands on a corner), y onto the floor, the
 * ceiling or a solid's top. Earlier endpoints win over everything.
 */
export function snapPoint(
  p: Vec3,
  lines: EdgeLine[],
  opts: { tops?: Obstacle[]; points?: Vec3[]; tol?: number } = {},
): Snapped {
  const tol = opts.tol ?? SNAP
  for (const q of opts.points ?? []) {
    if (Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < tol) return { point: [...q], snapped: true }
  }
  const out: Vec3 = [p[0], p[1], p[2]]
  let snapped = false
  for (const axis of ['x', 'z'] as const) {
    const i = axis === 'x' ? 0 : 2
    const j = axis === 'x' ? 2 : 0
    let best: number | null = null
    for (const l of lines) {
      if (l.axis !== axis || p[j] < l.min - tol || p[j] > l.max + tol) continue
      const d = Math.abs(p[i] - l.coord)
      if (d < tol && (best === null || d < Math.abs(p[i] - best))) best = l.coord
    }
    if (best !== null) {
      out[i] = Math.round(best * 1000) / 1000
      snapped = true
    }
  }
  const ys = [0, ceilingAt(p[0], p[2]), ...(opts.tops ?? []).filter((o) => o.top < 2.3).map((o) => o.top)]
  let by: number | null = null
  for (const y of ys) if (Math.abs(p[1] - y) < tol && (by === null || Math.abs(p[1] - y) < Math.abs(p[1] - by))) by = y
  if (by !== null) {
    out[1] = by
    snapped = true
  }
  return { point: out, snapped }
}

/** Keeps only the largest of the three offsets from `a`: a measurement straight along x, y or z. */
export function axisLock(a: Vec3, b: Vec3): Vec3 {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const k = [0, 1, 2].reduce((m, i) => (Math.abs(d[i]) > Math.abs(d[m]) ? i : m), 0)
  const out: Vec3 = [a[0], a[1], a[2]]
  out[k] = b[k]
  return out
}

export const distance = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])

/** "235 cm" */
export const formatCm = (m: number) => `${Math.round(m * 100)} cm`
