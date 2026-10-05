import { area, boundsOf, contains, edgesOf, isRectilinear, overlaps, simplify } from '../../model/polygon'
import type { OpeningKind, ReferenceImage, Sketch, SketchOpening, SketchRoom } from '../../model/sketch'
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
export const EDGE_SNAP = 0.15
/**
 * The same over a reference image: less, so a point clicked on the far face
 * of a wall is not pulled across it; the gap left is closed in the middle of
 * the wall instead (closeGaps).
 */
export const TRACE_SNAP = 0.05
/** Smallest room side. */
export const MIN_SIDE = 0.6
const EPS = 1e-6

export const round = (v: number) => Math.round(v * 1000) / 1000
export const toGrid = (v: number) => round(Math.round(v / GRID) * GRID)

/**
 * Snaps a coordinate: to the nearest of `lines` (other rooms' corners) when one
 * is close, so rooms meet exactly and share their wall; otherwise to the grid.
 */
export function snap(v: number, lines: number[], reach = EDGE_SNAP): number {
  let best: number | null = null
  for (const l of lines)
    if (Math.abs(l - v) <= reach && (best === null || Math.abs(l - v) < Math.abs(best - v))) best = l
  return best ?? toGrid(v)
}

/** Snaps a point on both axes. */
export const snapPoint = (p: Vec2, lines: { x: number[]; z: number[] }, reach = EDGE_SNAP): Vec2 => [
  snap(p[0], lines.x, reach),
  snap(p[1], lines.z, reach),
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

/** The widest gap between two rooms that is taken for a wall between them. */
export const WALL_GAP = 0.35

/**
 * Closes the gaps room `id` leaves to its neighbors. A plan traced along the
 * inside of its walls leaves a gap as wide as the wall between two rooms: each
 * edge that faces another room's edge across a gap up to `reach` meets it in
 * the middle, where the wall's centerline is, so the two share that wall.
 * Returns all the rooms, the neighbors' edges moved too.
 */
export function closeGaps(rooms: SketchRoom[], id: string, reach = WALL_GAP): SketchRoom[] {
  const out = rooms.map((r) => ({ ...r, points: r.points.map((p) => [...p] as Vec2) }))
  const self = out.find((r) => r.id === id)
  if (!self) return rooms
  for (let i = 0; i < self.points.length; i++) {
    const pts = self.points
    const [a, b] = [pts[i], pts[(i + 1) % pts.length]]
    const alongX = Math.abs(a[1] - b[1]) < EPS
    const line = alongX ? a[1] : a[0]
    const [lo, hi] = span(a, b, alongX)
    // Which way is out of the room: +1 when the room lies on the lower side of the edge.
    const m0 = (lo + hi) / 2
    const dir = contains(pts, alongX ? [m0, line + 0.01] : [line + 0.01, m0]) ? -1 : 1
    // The neighbors' edges facing this one across a gap; the nearest line wins.
    let facing: { room: (typeof out)[number]; j: number; line: number }[] = []
    for (const r of out) {
      if (r === self) continue
      edgesOf(r.points).forEach(([c, d], j) => {
        if (Math.abs(c[1] - d[1]) < EPS !== alongX) return
        const other = alongX ? c[1] : c[0]
        const gap = (other - line) * dir
        if (gap <= EPS || gap > reach) return
        const [clo, chi] = span(c, d, alongX)
        const [slo, shi] = [Math.max(lo, clo), Math.min(hi, chi)]
        if (shi - slo < Math.min(0.3, (hi - lo) / 2)) return
        // The other room must be beyond its edge, facing back across the gap.
        const m = (slo + shi) / 2
        if (!contains(r.points, alongX ? [m, other + 0.01 * dir] : [other + 0.01 * dir, m])) return
        facing.push({ room: r, j, line: other })
      })
    }
    if (!facing.length) continue
    const nearest = facing.reduce((x, y) => (Math.abs(y.line - line) < Math.abs(x.line - line) ? y : x)).line
    facing = facing.filter((f) => Math.abs(f.line - nearest) < EPS)
    const middle = round((line + nearest) / 2)
    // Neighbors come halfway when they can; if one cannot, this room goes all the way to it.
    const theirs = facing.map((f) => ({ f, moved: outward(f.room.points, f.j, middle) }))
    const meet = theirs.every((t) => t.moved) ? middle : nearest
    const mine = outward(pts, i, meet)
    if (!mine) continue
    self.points = mine
    if (meet === middle) for (const t of theirs) t.f.room.points = t.moved!
  }
  return out.map((r) => ({ ...r, points: simplify(r.points) }))
}

/** Edge `i` moved out to `line`, if that is a clean move: still square, grown by exactly the strip it crossed. */
function outward(points: Vec2[], i: number, line: number): Vec2[] | null {
  const [a, b] = [points[i], points[(i + 1) % points.length]]
  const alongX = Math.abs(a[1] - b[1]) < EPS
  const [lo, hi] = span(a, b, alongX)
  const moved = moveEdge(points, i, line)
  const grown = area(moved) - area(points)
  const strip = Math.abs(line - (alongX ? a[1] : a[0])) * (hi - lo)
  return isRectilinear(moved) && Math.abs(grown - strip) < 1e-3 ? moved : null
}

const span = (a: Vec2, b: Vec2, alongX: boolean): [number, number] =>
  alongX ? [Math.min(a[0], b[0]), Math.max(a[0], b[0])] : [Math.min(a[1], b[1]), Math.max(a[1], b[1])]

/** A rectangular room with its far sides moved so it is `width` across x and `depth` along z. */
export function resized(points: Vec2[], width: number, depth: number): Vec2[] {
  const [x0, z0] = boundsOf(points)
  return rectFrom([x0, z0], [round(x0 + width), round(z0 + depth)])
}

/**
 * Room `id` reshaped to `points` (by moving an edge or a corner), with the
 * walls it shares: every other room edge that lay along a moved edge, over
 * part of its length, moves with it, and so on through the rooms beyond, so
 * neighbors stay against each other. Doors and windows on a moved wall go
 * with it. A neighbor that would fold up (an edge shorter than 5 cm) stays put.
 */
export function moveShared(
  rooms: SketchRoom[],
  openings: SketchOpening[],
  id: string,
  points: Vec2[],
): { rooms: SketchRoom[]; openings: SketchOpening[] } {
  const self = rooms.find((r) => r.id === id)
  if (!self) return { rooms, openings }
  /** A wall line that moved: edges along x at z = line (or along z at x = line), over [lo, hi], now at `to`. */
  const moves: { alongX: boolean; line: number; lo: number; hi: number; to: number }[] = []
  const record = (before: Vec2[], after: Vec2[]) =>
    edgesOf(before).forEach(([a, b], i) => {
      const alongX = Math.abs(a[1] - b[1]) < EPS
      const [line, to] = alongX ? [a[1], after[i][1]] : [a[0], after[i][0]]
      if (Math.abs(to - line) > EPS) moves.push({ alongX, line, to, ...spanOf(a, b, alongX) })
    })
  record(self.points, points)
  const moved = new Map<string, Vec2[]>([[id, points]])
  for (let grew = true; grew;) {
    grew = false
    for (const r of rooms) {
      if (moved.has(r.id)) continue
      let pts = r.points
      edgesOf(r.points).forEach(([a, b], j) => {
        const alongX = Math.abs(a[1] - b[1]) < EPS
        const line = alongX ? a[1] : a[0]
        const { lo, hi } = spanOf(a, b, alongX)
        const m = moves.find(
          (m) => m.alongX === alongX && Math.abs(m.line - line) < EPS && Math.min(hi, m.hi) - Math.max(lo, m.lo) > EPS,
        )
        if (m) pts = moveEdge(pts, j, m.to)
      })
      if (pts === r.points || !sound(pts)) continue
      moved.set(r.id, pts)
      record(r.points, pts)
      grew = true
    }
  }
  return {
    rooms: rooms.map((r) => (moved.has(r.id) ? { ...r, points: moved.get(r.id)! } : r)),
    openings: openings.map((o) => {
      const m = moves.find((m) => {
        const [across, along] = m.alongX ? [o.at[1], o.at[0]] : [o.at[0], o.at[1]]
        return Math.abs(across - m.line) < EPS && along >= m.lo - EPS && along <= m.hi + EPS
      })
      if (!m) return o
      return { ...o, at: (m.alongX ? [o.at[0], m.to] : [m.to, o.at[1]]) as Vec2 }
    }),
  }
}

const spanOf = (a: Vec2, b: Vec2, alongX: boolean) => {
  const [lo, hi] = span(a, b, alongX)
  return { lo, hi }
}

/** Still a room: square corners, no edge folded to (almost) nothing. */
const sound = (points: Vec2[]) =>
  isRectilinear(points) && edgesOf(points).every(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]) >= 0.05)

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
