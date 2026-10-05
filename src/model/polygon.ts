import type { Rect, Vec2 } from './types'

// Plan polygons: a room drawn in the floor plan editor is a list of corners
// (src/model/sketch.ts). Rooms have right-angled corners, every edge along x or
// z, so a room can always be cut into rectangles: that is how the 3D app gets
// its floors, ceilings and rooms (src/model/types.ts), which are rectangles.

const EPS = 1e-6

/** The corners of a rectangle, in order. */
export const rectPoints = ([x0, z0, x1, z1]: Rect): Vec2[] => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
]

/** Each edge as [from, to], the last one closing the polygon. */
export const edgesOf = (points: Vec2[]): [Vec2, Vec2][] => points.map((p, i) => [p, points[(i + 1) % points.length]])

/** Area, in square meters (positive whichever way the corners run). */
export function area(points: Vec2[]): number {
  let twice = 0
  for (const [a, b] of edgesOf(points)) twice += a[0] * b[1] - b[0] * a[1]
  return Math.abs(twice) / 2
}

export function boundsOf(points: Vec2[]): Rect {
  const xs = points.map((p) => p[0])
  const zs = points.map((p) => p[1])
  return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)]
}

/** Whether a point is inside (edges count as outside; probe off an edge to ask about a side). */
export function contains(points: Vec2[], [x, z]: Vec2): boolean {
  let inside = false
  for (const [a, b] of edgesOf(points)) {
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

/** Every edge runs along x or z, and there are at least four corners. */
export function isRectilinear(points: Vec2[]): boolean {
  return (
    points.length >= 4 && edgesOf(points).every(([a, b]) => Math.abs(a[0] - b[0]) < EPS !== Math.abs(a[1] - b[1]) < EPS)
  )
}

/** Drops corners that are not corners: repeated points, and points in the middle of a straight run. */
export function simplify(points: Vec2[]): Vec2[] {
  let pts = points.filter((p, i) => {
    const q = points[(i + 1) % points.length]
    return Math.abs(p[0] - q[0]) > EPS || Math.abs(p[1] - q[1]) > EPS
  })
  let changed = true
  while (changed && pts.length > 3) {
    changed = false
    for (let i = 0; i < pts.length; i++) {
      const [a, b, c] = [pts[(i + pts.length - 1) % pts.length], pts[i], pts[(i + 1) % pts.length]]
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
      if (Math.abs(cross) < EPS) {
        pts = pts.filter((_, j) => j !== i)
        changed = true
        break
      }
    }
  }
  return pts
}

/**
 * A right-angled polygon as rectangles that tile it exactly: cut into slabs
 * between the corners' x positions, each slab into the z ranges inside the
 * polygon, then neighboring slabs with the same ranges joined back together.
 * The largest rectangle comes first.
 */
export function rectangles(points: Vec2[]): Rect[] {
  const xs = [...new Set(points.map((p) => p[0]))].sort((a, b) => a - b)
  const zs = [...new Set(points.map((p) => p[1]))].sort((a, b) => a - b)
  const out: Rect[] = []
  let open: Rect[] = []
  for (let i = 0; i < xs.length - 1; i++) {
    const [x0, x1] = [xs[i], xs[i + 1]]
    const mx = (x0 + x1) / 2
    // The z ranges inside the polygon across this slab.
    const ranges: [number, number][] = []
    for (let j = 0; j < zs.length - 1; j++) {
      if (!contains(points, [mx, (zs[j] + zs[j + 1]) / 2])) continue
      const last = ranges.at(-1)
      if (last && Math.abs(last[1] - zs[j]) < EPS) last[1] = zs[j + 1]
      else ranges.push([zs[j], zs[j + 1]])
    }
    const next: Rect[] = []
    for (const [z0, z1] of ranges) {
      const cont = open.find((r) => Math.abs(r[1] - z0) < EPS && Math.abs(r[3] - z1) < EPS)
      if (cont) {
        cont[2] = x1
        next.push(cont)
      } else next.push([x0, z0, x1, z1])
    }
    for (const r of open) if (!next.includes(r)) out.push(r)
    open = next
  }
  out.push(...open)
  const size = (r: Rect) => (r[2] - r[0]) * (r[3] - r[1])
  return out.sort((a, b) => size(b) - size(a))
}

/** Rooms that overlap: share floor, not just an edge. */
export function overlaps(a: Vec2[], b: Vec2[]): boolean {
  for (const r of rectangles(a))
    for (const s of rectangles(b)) {
      const w = Math.min(r[2], s[2]) - Math.max(r[0], s[0])
      const h = Math.min(r[3], s[3]) - Math.max(r[1], s[1])
      if (w > EPS && h > EPS) return true
    }
  return false
}
