import type { DecorItem } from '../model/decor'
import type { Vec3 } from '../model/types'
import type { Guides } from './edit'
import {
  backedBox,
  boxIn,
  FLOOR_FRAME,
  frameDelta,
  framePoint,
  isWallItem,
  onPlane,
  unionBox,
  wallFrameOf,
  type Box,
  type Frame,
} from './extent'
import { mountOf } from './placement'

// Smart guides (Figma-like) for a moving item or selection: its edges and center
// snap to the edges and centers of other items in the same frame (a wall plane,
// or the floor plan), to equal gaps along a row, and, for artwork, to the
// gallery line. Everything here is 2D math in frame coordinates.

/** How close (m) an edge or center must come to a target to snap. */
export const GUIDE_TOL = 0.03
/** Center height artwork is pulled to (the "gallery line"), and how strongly. */
export const GALLERY_LINE = 1.5
export const GALLERY_TOL = 0.05

export interface GuideLine {
  a: [number, number]
  b: [number, number]
  kind: 'align' | 'gallery' | 'spacing'
}

export interface GuideLabel {
  at: [number, number]
  text: string
  kind: 'gallery' | 'spacing'
}

export interface SnapResult {
  du: number
  dv: number
  lines: GuideLine[]
  labels: GuideLabel[]
}

export interface SnapOpts {
  tol?: number
  /** Do not snap along u (or v): the item is pinned that way, e.g. backed onto a wall. */
  lockU?: boolean
  lockV?: boolean
  /** A soft target for the center along v, weaker than other items. */
  magnetV?: number | null
  magnetTol?: number
}

type Axis = 'u' | 'v'
type Span = [number, number]
const span = (b: Box, a: Axis): Span => (a === 'u' ? [b.u0, b.u1] : [b.v0, b.v1])
const other = (a: Axis): Axis => (a === 'u' ? 'v' : 'u')
const anchors = ([lo, hi]: Span) => [lo, (lo + hi) / 2, hi]
const overlaps = (a: Span, b: Span) => Math.min(a[1], b[1]) - Math.max(a[0], b[0]) > 0.001
const EPS = 5e-4
/** Gaps this close (m) count as equal. */
const SAME_GAP = 0.002

/** Smallest move that lines up one of the moving span's edges or center with a target's. */
function bestAlign(m: Span, targets: Span[], tol: number): number | null {
  let best: number | null = null
  for (const t of targets) {
    for (const tv of anchors(t)) {
      for (const a of anchors(m)) {
        const d = tv - a
        if (Math.abs(d) <= tol && (best === null || Math.abs(d) < Math.abs(best))) best = d
      }
    }
  }
  return best
}

/** Items in the moving box's row (overlapping it across `axis`), sorted along `axis`. */
function rowOf(moving: Box, others: Box[], axis: Axis): Span[] {
  const c = span(moving, other(axis))
  return others
    .filter((b) => overlaps(span(b, other(axis)), c))
    .map((b) => span(b, axis))
    .sort((p, q) => p[0] - q[0])
}

function gapsOf(row: Span[]): number[] {
  const out: number[] = []
  for (let i = 1; i < row.length; i++) {
    const g = row[i][0] - row[i - 1][1]
    if (g > 0.005) out.push(g)
  }
  return out
}

/** Smallest move that makes a gap to a neighbor equal an existing gap, or centers between two. */
function bestSpacing(moving: Box, others: Box[], axis: Axis, tol: number): number | null {
  const m = span(moving, axis)
  const row = rowOf(moving, others, axis)
  if (row.length === 0) return null
  const gaps = gapsOf(row)
  let left: Span | null = null
  let right: Span | null = null
  for (const s of row) {
    if (s[1] <= m[0] + tol && (!left || s[1] > left[1])) left = s
    if (s[0] >= m[1] - tol && (!right || s[0] < right[0])) right = s
  }
  const cands: number[] = []
  for (const g of gaps) {
    if (left) cands.push(left[1] + g - m[0])
    if (right) cands.push(right[0] - g - m[1])
  }
  if (left && right) {
    const free = right[0] - left[1] - (m[1] - m[0])
    if (free > 0) cands.push(left[1] + free / 2 - m[0])
  }
  let best: number | null = null
  for (const d of cands) if (Math.abs(d) <= tol && (best === null || Math.abs(d) < Math.abs(best))) best = d
  return best
}

const shift = (b: Box, du: number, dv: number): Box => ({ u0: b.u0 + du, u1: b.u1 + du, v0: b.v0 + dv, v1: b.v1 + dv })

/** Where to put a point on `axis` and the cross axis, as frame (u, v). */
const pt = (axis: Axis, along: number, across: number): [number, number] =>
  axis === 'u' ? [along, across] : [across, along]

export const cmLabel = (m: number) => `${Math.round(m * 1000) / 10} cm`

/**
 * Snaps a moving box to the others. Returns the move (du, dv) and the guide lines
 * and spacing marks to draw, in frame coordinates.
 */
export function snapBox(moving: Box, others: Box[], opts: SnapOpts = {}): SnapResult {
  const tol = opts.tol ?? GUIDE_TOL
  const delta = { u: 0, v: 0 }
  let magnet = false
  for (const axis of ['u', 'v'] as Axis[]) {
    if ((axis === 'u' && opts.lockU) || (axis === 'v' && opts.lockV)) continue
    const a = bestAlign(
      span(moving, axis),
      others.map((b) => span(b, axis)),
      tol,
    )
    const s = bestSpacing(moving, others, axis, tol)
    // Lining up wins a tie with spacing.
    let d = a !== null && (s === null || Math.abs(a) <= Math.abs(s) + 1e-6) ? a : s
    if (d === null && axis === 'v' && opts.magnetV != null) {
      const [lo, hi] = span(moving, 'v')
      const off = opts.magnetV - (lo + hi) / 2
      if (Math.abs(off) <= (opts.magnetTol ?? GALLERY_TOL)) {
        d = off
        magnet = true
      }
    }
    if (d !== null) delta[axis] = d
  }

  const m = shift(moving, delta.u, delta.v)
  const lines: GuideLine[] = []
  const labels: GuideLabel[] = []

  // Alignment lines: one per shared coordinate, spanning every box that shares it.
  for (const axis of ['u', 'v'] as Axis[]) {
    const x = other(axis)
    const found = new Map<number, Span>()
    for (const b of others) {
      for (const t of anchors(span(b, axis))) {
        for (const a of anchors(span(m, axis))) {
          if (Math.abs(a - t) > EPS) continue
          const key = Math.round(a * 1000)
          const cur = found.get(key) ?? span(m, x)
          const bs = span(b, x)
          found.set(key, [Math.min(cur[0], bs[0]), Math.max(cur[1], bs[1])])
        }
      }
    }
    for (const [key, [lo, hi]] of found)
      lines.push({ a: pt(axis, key / 1000, lo), b: pt(axis, key / 1000, hi), kind: 'align' })
  }

  if (opts.magnetV != null && (magnet || Math.abs((m.v0 + m.v1) / 2 - opts.magnetV) < EPS)) {
    const pad = 0.35
    lines.push({ a: [m.u0 - pad, opts.magnetV], b: [m.u1 + pad, opts.magnetV], kind: 'gallery' })
    labels.push({ at: [m.u1 + pad, opts.magnetV], text: `${Math.round(opts.magnetV * 100)} cm`, kind: 'gallery' })
  }

  // Equal spacing: every gap in the row that matches one of the moving box's gaps.
  for (const axis of ['u', 'v'] as Axis[]) {
    const x = other(axis)
    const row = [...others.filter((b) => overlaps(span(b, x), span(m, x))), m].sort(
      (p, q) => span(p, axis)[0] - span(q, axis)[0],
    )
    const idx = row.indexOf(m)
    const pairs: { lo: Box; hi: Box; g: number }[] = []
    for (let i = 1; i < row.length; i++) {
      const g = span(row[i], axis)[0] - span(row[i - 1], axis)[1]
      if (g > 0.005) pairs.push({ lo: row[i - 1], hi: row[i], g })
    }
    const mine = pairs.filter((p) => p.lo === m || p.hi === m).map((p) => p.g)
    if (idx < 0 || mine.length === 0) continue
    const shown = new Set<(typeof pairs)[number]>()
    for (const g of mine) {
      const same = pairs.filter((p) => Math.abs(p.g - g) < SAME_GAP)
      if (same.length >= 2) same.forEach((p) => shown.add(p))
    }
    for (const p of shown) {
      const [c0, c1] = [Math.max(span(p.lo, x)[0], span(p.hi, x)[0]), Math.min(span(p.lo, x)[1], span(p.hi, x)[1])]
      const c = (c0 + c1) / 2
      const from = span(p.lo, axis)[1]
      const to = span(p.hi, axis)[0]
      const tick = 0.025
      lines.push({ a: pt(axis, from, c), b: pt(axis, to, c), kind: 'spacing' })
      lines.push({ a: pt(axis, from, c - tick), b: pt(axis, from, c + tick), kind: 'spacing' })
      lines.push({ a: pt(axis, to, c - tick), b: pt(axis, to, c + tick), kind: 'spacing' })
      labels.push({ at: pt(axis, (from + to) / 2, c), text: cmLabel(p.g), kind: 'spacing' })
    }
  }

  return { du: delta.u, dv: delta.v, lines, labels }
}

// ---------- drag context ----------

/** What a drag snaps to, gathered once when it starts. */
export interface GuideCtx {
  wall: DecorItem[]
  floor: DecorItem[]
  cache: Map<string, Box[]>
}

const placed = (i: DecorItem) => i.at[1] > -50

export function buildGuideCtx(items: DecorItem[], exclude: Set<string>): GuideCtx {
  const rest = items.filter((i) => !exclude.has(i.id) && placed(i))
  return {
    wall: rest.filter(isWallItem),
    floor: rest.filter((i) => !isWallItem(i) && mountOf(i) === 'surface'),
    cache: new Map(),
  }
}

/** Frame a moving item snaps in: its wall plane, or the floor plan. Ceiling pieces have none. */
export function frameFor(item: DecorItem): Frame | null {
  if (isWallItem(item)) return wallFrameOf(item)
  if (mountOf(item) === 'surface') return FLOOR_FRAME
  return null
}

function targets(ctx: GuideCtx, frame: Frame): Box[] {
  const key = frame.kind === 'wall' ? `${frame.facing}:${frame.d.toFixed(2)}` : 'floor'
  let boxes = ctx.cache.get(key)
  if (!boxes) {
    if (frame.kind === 'wall') {
      // Pieces on this wall, and furniture standing against it (center the art over the sofa).
      boxes = ctx.wall.filter((i) => onPlane(i, frame)).map((i) => boxIn(i, frame))
      for (const i of ctx.floor) {
        const b = backedBox(i, frame)
        if (b) boxes.push(b)
      }
    } else boxes = ctx.floor.map((i) => boxIn(i, frame))
    ctx.cache.set(key, boxes)
  }
  return boxes
}

/** Guide lines and labels of a snap, in world space, ready to draw. */
export function worldGuides(g: GuideMove): Guides | null {
  const { lines, labels } = g.result
  if (!lines.length) return null
  const out: Guides = { align: [], gallery: [], spacing: [], labels: [] }
  for (const l of lines)
    out[l.kind].push(framePoint(g.frame, l.a[0], l.a[1], g.lift), framePoint(g.frame, l.b[0], l.b[1], g.lift))
  for (const l of labels)
    out.labels.push({ at: framePoint(g.frame, l.at[0], l.at[1], g.lift), text: l.text, kind: l.kind })
  return out
}

export interface GuideMove {
  delta: Vec3
  frame: Frame
  result: SnapResult
  /** Height the floor guides are drawn at. */
  lift: number
}

/**
 * Snaps a moving selection (already moved to follow the pointer) by its combined
 * box on the lead's frame.
 */
export function guideMove(
  ctx: GuideCtx,
  lead: DecorItem,
  members: DecorItem[],
  opts: { lockU?: boolean; lockV?: boolean } = {},
): GuideMove | null {
  const frame = frameFor(lead)
  if (!frame) return null
  const inFrame = members.filter((i) =>
    frame.kind === 'wall' ? onPlane(i, frame) : !isWallItem(i) && mountOf(i) === 'surface',
  )
  if (!inFrame.length) return null
  const box = unionBox(inFrame.map((i) => boxIn(i, frame)))
  const magnetV = frame.kind === 'wall' && inFrame.every((i) => i.kind === 'artwork') ? GALLERY_LINE : null
  const result = snapBox(box, targets(ctx, frame), { ...opts, magnetV })
  return {
    delta: frameDelta(frame, result.du, result.dv),
    frame,
    result,
    lift: frame.kind === 'wall' ? 0.006 : lead.at[1] + 0.012,
  }
}
