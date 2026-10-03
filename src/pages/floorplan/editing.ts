import { boundsOf, contains, edgesOf, overlaps, simplify } from '../../model/polygon'
import type { OpeningKind, ReferenceImage, Sketch, SketchRoom } from '../../model/sketch'
import type { Rect, Vec2 } from '../../model/types'

// The floor plan editor's geometry: snapping, drawing and reshaping right-angled
// rooms, hit tests and checks, kept apart from the components so they can be
// tested on their own. Meters, plan axes.

/** What a click on the drawing does. */
export type Tool = 'select' | 'room' | OpeningKind | 'fitting' | 'reference' | 'calibrate'
/** The selected room, opening or fitting. */
export type Selection = { kind: 'room' | 'opening' | 'fitting'; id: string } | null

/** Default opening widths, meters. */
export const OPENING_WIDTH: Record<OpeningKind, number> = { door: 0.9, window: 1.2, glassDoor: 2, passage: 1 }

/** The drawing grid. */
export const GRID = 0.05
/** How close an edge must be to pull a dragged point onto it. */
const EDGE_SNAP = 0.15
/** Smallest room side. */
export const MIN_SIDE = 0.6
const EPS = 1e-6

export const round = (v: number) => Math.round(v * 1000) / 1000
export const toGrid = (v: number) => round(Math.round(v / GRID) * GRID)

/**
 * Snaps a coordinate: to the nearest of `lines` (other rooms' corners) when one
 * is close, so rooms meet exactly and share their wall; otherwise to the grid.
 */
export function snap(v: number, lines: number[]): number {
  let best: number | null = null
  for (const l of lines)
    if (Math.abs(l - v) <= EDGE_SNAP && (best === null || Math.abs(l - v) < Math.abs(best - v))) best = l
  return best ?? toGrid(v)
}

/** Snaps a point on both axes. */
export const snapPoint = (p: Vec2, lines: { x: number[]; z: number[] }): Vec2 => [
  snap(p[0], lines.x),
  snap(p[1], lines.z),
]

/** The x and z of every room's corners, except one room's own. */
export function edgeLines(rooms: SketchRoom[], except?: string): { x: number[]; z: number[] } {
  const pts = rooms.filter((r) => r.id !== except).flatMap((r) => r.points)
  return { x: pts.map((p) => p[0]), z: pts.map((p) => p[1]) }
}

/** The corners of a rectangle dragged from one corner to another, at least MIN_SIDE a side. */
export function rectFrom(a: Vec2, b: Vec2): Vec2[] {
  const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])]
  const [z0, z1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])]
  const [X1, Z1] = [round(Math.max(x1, x0 + MIN_SIDE)), round(Math.max(z1, z0 + MIN_SIDE))]
  return [
    [x0, z0],
    [X1, z0],
    [X1, Z1],
    [x0, Z1],
  ]
}

/** The next corner while drawing: square to the last one (straight across or straight up the plan). */
export function squareTo(last: Vec2, p: Vec2): Vec2 {
  return Math.abs(p[0] - last[0]) >= Math.abs(p[1] - last[1]) ? [p[0], last[1]] : [last[0], p[1]]
}

/**
 * Closes a drawn outline: if the last corner does not line up with the first,
 * the corner that squares them is added. Points in the middle of a straight run
 * are dropped. Null when what is left is not a room.
 */
export function closeOutline(points: Vec2[]): Vec2[] | null {
  if (points.length < 2) return null
  const first = points[0]
  const last = points[points.length - 1]
  const pts = [...points]
  if (Math.abs(first[0] - last[0]) > EPS && Math.abs(first[1] - last[1]) > EPS) pts.push([first[0], last[1]])
  const out = simplify(pts)
  return out.length >= 4 ? out : null
}

/**
 * Moves corner `i` to `to`, keeping the room right-angled: the corners before
 * and after it follow along the edge they share with it.
 */
export function moveCorner(points: Vec2[], i: number, to: Vec2): Vec2[] {
  const n = points.length
  const out = points.map((p) => [...p] as Vec2)
  const from = points[i]
  for (const j of [(i + n - 1) % n, (i + 1) % n]) {
    // A horizontal edge (same z) keeps sharing z with the moved corner; a vertical one, x.
    if (Math.abs(points[j][1] - from[1]) < EPS) out[j][1] = to[1]
    else out[j][0] = to[0]
  }
  out[i] = [...to]
  return out
}

/** Moves edge `i` (from corner i to the next) straight out or in, to `line` (its new z, or x). */
export function moveEdge(points: Vec2[], i: number, line: number): Vec2[] {
  const n = points.length
  const [a, b] = [points[i], points[(i + 1) % n]]
  const alongX = Math.abs(a[1] - b[1]) < EPS
  return points.map((p, k) => (k === i || k === (i + 1) % n ? ((alongX ? [p[0], line] : [line, p[1]]) as Vec2) : p))
}

/** Rooms that overlap another room (sharing an edge is fine; sharing floor is not). */
export function overlapping(rooms: SketchRoom[]): string[] {
  const out = new Set<string>()
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++)
      if (overlaps(rooms[i].points, rooms[j].points)) {
        out.add(rooms[i].id)
        out.add(rooms[j].id)
      }
  return [...out]
}

/** The room under a point; the smallest wins where they nest. */
export function roomAt(rooms: SketchRoom[], p: Vec2): SketchRoom | undefined {
  const size = (r: SketchRoom) => {
    const [x0, z0, x1, z1] = boundsOf(r.points)
    return (x1 - x0) * (z1 - z0)
  }
  return rooms.filter((r) => contains(r.points, p)).sort((a, b) => size(a) - size(b))[0]
}

/**
 * Where an opening of `width` goes for a pointer at `p`: on the nearest room edge
 * within reach, its center slid so the opening stays on that edge. Null when no
 * edge is close.
 */
export function openingSpot(rooms: SketchRoom[], p: Vec2, width: number, reach = 0.4): Vec2 | null {
  let best: { at: Vec2; d: number } | null = null
  for (const r of rooms)
    for (const [a, b] of edgesOf(r.points)) {
      const alongX = Math.abs(a[1] - b[1]) < EPS
      const [lo, hi] = alongX
        ? [Math.min(a[0], b[0]), Math.max(a[0], b[0])]
        : [Math.min(a[1], b[1]), Math.max(a[1], b[1])]
      if (hi - lo < width + 0.1) continue
      const t = alongX ? p[0] : p[1]
      // Distance to the wall itself, and the pointer must be alongside it.
      if (t < lo - reach || t > hi + reach) continue
      const d = alongX ? Math.abs(p[1] - a[1]) : Math.abs(p[0] - a[0])
      const c = Math.min(hi - width / 2 - 0.05, Math.max(lo + width / 2 + 0.05, t))
      const at: Vec2 = alongX ? [toGrid(c), a[1]] : [a[0], toGrid(c)]
      if (d <= reach && (!best || d < best.d)) best = { at, d }
    }
  return best?.at ?? null
}

/** A reference image's extent in plan meters. */
export const referenceRect = (ref: ReferenceImage): Rect => [
  ref.origin[0],
  ref.origin[1],
  ref.origin[0] + ref.width * ref.scale,
  ref.origin[1] + ref.height * ref.scale,
]

/**
 * Sets a reference image's scale from a known length: the points `a` and `b`
 * (plan meters, as the image shows now) are really `meters` apart. Point `a`
 * stays where it is on the drawing.
 */
export function calibrated(ref: ReferenceImage, a: Vec2, b: Vec2, meters: number): ReferenceImage {
  const measured = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (measured < EPS || !(meters > 0)) return ref
  const k = meters / measured
  return {
    ...ref,
    scale: ref.scale * k,
    origin: [a[0] - (a[0] - ref.origin[0]) * k, a[1] - (a[1] - ref.origin[1]) * k],
  }
}

/** The sketch's extent (rooms, and the reference image if shown), for framing the view. */
export function extent(sketch: Sketch): Rect {
  const rects: Rect[] = sketch.rooms.map((r) => boundsOf(r.points))
  if (sketch.reference && !sketch.reference.hidden) rects.push(referenceRect(sketch.reference))
  if (!rects.length) return [0, 0, 8, 6]
  return rects.reduce<Rect>(
    (u, r) => [Math.min(u[0], r[0]), Math.min(u[1], r[1]), Math.max(u[2], r[2]), Math.max(u[3], r[3])],
    [Infinity, Infinity, -Infinity, -Infinity],
  )
}

let counter = 0
/** A fresh id for a room, opening or fitting. */
export const freshId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(counter++).toString(36)}`
