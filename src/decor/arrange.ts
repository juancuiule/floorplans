import type { ArtworkItem, DecorItem } from '../model/decor'
import type { Vec3 } from '../model/types'
import {
  boxIn,
  frameDelta,
  isWallItem,
  onPlane,
  translated,
  unionBox,
  wallDepth,
  wallFrameOf,
  type Box,
  type Frame,
} from './extent'
import { alongWall, mountOf } from './placement'

// Moving, aligning and arranging several items at once. Pure: every function
// returns patches by id, which the store applies as one undo step.

export type Patches = Record<string, Partial<DecorItem>>

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vmiddle' | 'bottom'

/**
 * The frame a selection is arranged in: its wall (all on walls facing the same
 * way), or the floor plan seen from the camera (`right`/`away`: plan axes).
 * Null for a mix of walls and floor.
 */
export function selectionFrame(
  items: DecorItem[],
  axes: { right: [number, number]; away: [number, number] } = { right: [1, 0], away: [0, -1] },
): Frame | null {
  if (!items.length) return null
  if (items.every(isWallItem)) {
    const f = wallFrameOf(items[0])
    return f.kind === 'wall' && items.every((i) => 'facing' in i && i.facing === f.facing) ? f : null
  }
  if (items.some(isWallItem)) return null
  return { kind: 'floor', u: axes.right, v: axes.away }
}

const moveBy = (item: DecorItem, frame: Frame, du: number, dv: number): Partial<DecorItem> => ({
  at: translated(item.at, frameDelta(frame, du, dv)),
})

/**
 * What moves as one: each whole group in the selection, when there are at least
 * two such units; otherwise (one group, or loose items) every item on its own.
 */
export function unitsOf(items: DecorItem[], all: DecorItem[] = items): DecorItem[][] {
  const ids = new Set(items.map((i) => i.id))
  const byGroup = new Map<string, DecorItem[]>()
  const units: DecorItem[][] = []
  for (const i of items) {
    const g = i.groupId
    const whole = g && all.filter((o) => o.groupId === g).every((o) => ids.has(o.id))
    if (g && whole) {
      const u = byGroup.get(g)
      if (u) u.push(i)
      else {
        const nu = [i]
        byGroup.set(g, nu)
        units.push(nu)
      }
    } else units.push([i])
  }
  return units.length >= 2 ? units : items.map((i) => [i])
}

function unitBoxes(units: DecorItem[][], frame: Frame): { unit: DecorItem[]; box: Box }[] {
  return units.map((unit) => ({ unit, box: unionBox(unit.map((i) => boxIn(i, frame))) }))
}

function patchUnit(out: Patches, unit: DecorItem[], frame: Frame, du: number, dv: number) {
  if (Math.abs(du) < 1e-6 && Math.abs(dv) < 1e-6) return
  for (const i of unit) out[i.id] = moveBy(i, frame, du, dv)
}

/** Lines up the selection on its bounds: left/right/center along u, top/bottom/middle along v. */
export function align(items: DecorItem[], frame: Frame, mode: AlignMode, all: DecorItem[] = items): Patches {
  const ub = unitBoxes(unitsOf(items, all), frame)
  if (ub.length < 2) return {}
  const b = unionBox(ub.map((x) => x.box))
  const out: Patches = {}
  for (const { unit, box } of ub) {
    let du = 0
    let dv = 0
    if (mode === 'left') du = b.u0 - box.u0
    else if (mode === 'right') du = b.u1 - box.u1
    else if (mode === 'hcenter') du = (b.u0 + b.u1) / 2 - (box.u0 + box.u1) / 2
    else if (mode === 'top') dv = b.v1 - box.v1
    else if (mode === 'bottom') dv = b.v0 - box.v0
    else dv = (b.v0 + b.v1) / 2 - (box.v0 + box.v1) / 2
    patchUnit(out, unit, frame, du, dv)
  }
  return out
}

/** Spreads the selection so the gaps between neighbors are equal; the two ends stay put. */
export function distribute(items: DecorItem[], frame: Frame, axis: 'u' | 'v', all: DecorItem[] = items): Patches {
  const ub = unitBoxes(unitsOf(items, all), frame)
  if (ub.length < 3) return {}
  const lo = (b: Box) => (axis === 'u' ? b.u0 : b.v0)
  const hi = (b: Box) => (axis === 'u' ? b.u1 : b.v1)
  ub.sort((p, q) => lo(p.box) + hi(p.box) - (lo(q.box) + hi(q.box)))
  const start = Math.min(...ub.map((x) => lo(x.box)))
  const end = Math.max(...ub.map((x) => hi(x.box)))
  const sizes = ub.reduce((s, x) => s + hi(x.box) - lo(x.box), 0)
  const gap = (end - start - sizes) / (ub.length - 1)
  const out: Patches = {}
  let cur = start
  for (const { unit, box } of ub) {
    const d = cur - lo(box)
    patchUnit(out, unit, frame, axis === 'u' ? d : 0, axis === 'v' ? d : 0)
    cur += hi(box) - lo(box) + gap
  }
  return out
}

/** Gives every artwork the print size and frame of `source` (centers stay where they are). */
export function matchSize(items: DecorItem[], source: ArtworkItem): Patches {
  const out: Patches = {}
  for (const i of items) {
    if (i.kind !== 'artwork' || i.id === source.id) continue
    out[i.id] = { size: { ...source.size }, frame: { ...source.frame } } as Partial<ArtworkItem>
  }
  return out
}

export interface GalleryOpts {
  layout: 'row' | 'grid'
  /** Space between frames, meters. */
  gap: number
  /** Height of the arrangement's center line, meters. */
  centerV: number
  /** Grid only: columns (default: about square). */
  cols?: number
  /** Where along the wall to center it (default: where the pieces are now). */
  centerU?: number
}

/**
 * Hangs wall pieces as a gallery: one row, or a grid with columns as wide as
 * their widest frame, centered where the selection is now and on `centerV`.
 * Pieces keep their reading order (top to bottom, left to right).
 */
export function hangGallery(items: DecorItem[], frame: Frame, opts: GalleryOpts): Patches {
  if (frame.kind !== 'wall' || items.length < 2) return {}
  const entries = items.map((item) => ({ item, box: boxIn(item, frame) }))
  const all = unionBox(entries.map((e) => e.box))
  const cu = opts.centerU ?? (all.u0 + all.u1) / 2
  const w = (b: Box) => b.u1 - b.u0
  const h = (b: Box) => b.v1 - b.v0
  const cols =
    opts.layout === 'row'
      ? entries.length
      : Math.max(1, opts.cols ?? (entries.length <= 3 ? entries.length : Math.ceil(Math.sqrt(entries.length))))
  // Reading order: rows are pieces whose centers are within 15 cm of height.
  const cv = (b: Box) => (b.v0 + b.v1) / 2
  const cU = (b: Box) => (b.u0 + b.u1) / 2
  if (opts.layout === 'row') entries.sort((p, q) => cU(p.box) - cU(q.box))
  else {
    entries.sort((p, q) => cv(q.box) - cv(p.box))
    const bands: (typeof entries)[] = []
    for (const e of entries) {
      const band = bands[bands.length - 1]
      if (band && cv(band[0].box) - cv(e.box) < 0.15) band.push(e)
      else bands.push([e])
    }
    entries.splice(0, entries.length, ...bands.flatMap((b) => b.sort((p, q) => cU(p.box) - cU(q.box))))
  }
  const rows: (typeof entries)[] = []
  for (let i = 0; i < entries.length; i += cols) rows.push(entries.slice(i, i + cols))
  const colW = Array.from({ length: cols }, (_, c) => Math.max(0, ...rows.map((r) => (r[c] ? w(r[c].box) : 0))))
  const rowH = rows.map((r) => Math.max(...r.map((e) => h(e.box))))
  const totalH = rowH.reduce((s, x) => s + x, 0) + opts.gap * (rows.length - 1)
  const out: Patches = {}
  let top = opts.centerV + totalH / 2
  rows.forEach((row, ri) => {
    const rowW = row.reduce((s, _, c) => s + colW[c], 0) + opts.gap * (row.length - 1)
    let left = cu - rowW / 2
    const mid = top - rowH[ri] / 2
    row.forEach((e, c) => {
      const du = left + colW[c] / 2 - cU(e.box)
      const dv = mid - cv(e.box)
      out[e.item.id] = moveBy(e.item, frame, du, dv)
      left += colW[c] + opts.gap
    })
    top -= rowH[ri] + opts.gap
  })
  return out
}

/** Turns floor and surface pieces about their common center (a rigid turn of the whole selection). */
export function rotateAround(items: DecorItem[], deg: number): Patches {
  const turn = items.filter((i) => 'rotation' in i && mountOf(i) !== 'wall')
  if (!turn.length) return {}
  const cx = turn.reduce((s, i) => s + i.at[0], 0) / turn.length
  const cz = turn.reduce((s, i) => s + i.at[2], 0) / turn.length
  const r = (deg * Math.PI) / 180
  const [c, s] = [Math.cos(r), Math.sin(r)]
  const out: Patches = {}
  const r3 = (v: number) => Math.round(v * 1000) / 1000
  for (const i of turn) {
    const x = i.at[0] - cx
    const z = i.at[2] - cz
    const at: Vec3 = turn.length > 1 ? [r3(cx + x * c + z * s), i.at[1], r3(cz - x * s + z * c)] : i.at
    const rotation = ((((i as { rotation: number }).rotation + deg) % 360) + 360) % 360
    out[i.id] = { at, rotation } as Partial<DecorItem>
  }
  return out
}

/**
 * Where a follower goes when the lead of a group drag moved from `leadFrom` to
 * `leadTo`. Items on the lead's wall keep their offset in the wall plane (even
 * onto another wall); everything else moves by the lead's plan offset.
 */
export function followLead(leadFrom: DecorItem, leadTo: DecorItem, f: DecorItem): Partial<DecorItem> {
  const d: Vec3 = [leadTo.at[0] - leadFrom.at[0], leadTo.at[1] - leadFrom.at[1], leadTo.at[2] - leadFrom.at[2]]
  if (isWallItem(leadFrom) && isWallItem(leadTo)) {
    const fromFacing = (leadFrom as { facing: NonNullable<ArtworkItem['facing']> }).facing
    const toFacing = (leadTo as { facing: NonNullable<ArtworkItem['facing']> }).facing
    const leadHost = 'host' in leadTo ? leadTo.host : undefined
    if (onPlane(f, wallFrameOf(leadFrom))) {
      // Same wall plane as the lead: keep the offset along the wall and in height.
      const [ax, az] = alongWall(fromFacing)
      const du = (f.at[0] - leadFrom.at[0]) * ax + (f.at[2] - leadFrom.at[2]) * az
      const dv = f.at[1] - leadFrom.at[1]
      const [bx, bz] = alongWall(toFacing)
      const at = translated(leadTo.at, [du * bx, dv, du * bz])
      return { at, facing: toFacing, host: leadHost } as Partial<DecorItem>
    }
    if (isWallItem(f)) {
      // Another wall: slide along it by the lead's move along that wall, and in height.
      if (fromFacing !== toFacing) return {}
      const [ax, az] = alongWall((f as { facing: typeof fromFacing }).facing)
      const along = d[0] * ax + d[2] * az
      return { at: translated(f.at, [along * ax, d[1], along * az]) }
    }
    return fromFacing === toFacing ? { at: translated(f.at, [d[0], 0, d[2]]) } : {}
  }
  if (isWallItem(f)) {
    const [ax, az] = alongWall((f as { facing: NonNullable<ArtworkItem['facing']> }).facing)
    const along = d[0] * ax + d[2] * az
    return { at: translated(f.at, [along * ax, 0, along * az]) }
  }
  return { at: translated(f.at, [d[0], 0, d[2]]) }
}

/** A small offset for copies placed next to their originals: along the wall, or diagonally on the floor. */
export function copyOffset(item: DecorItem, step = 0.1): Vec3 {
  if (isWallItem(item)) {
    const [ax, az] = alongWall((item as { facing: NonNullable<ArtworkItem['facing']> }).facing)
    return [ax * step, 0, az * step]
  }
  return [step, 0, step]
}

/** Keeps a wall piece on the same wall plane as `ref` (used when pasting a set onto a wall). */
export function sameWall(a: DecorItem, b: DecorItem): boolean {
  return (
    isWallItem(a) &&
    isWallItem(b) &&
    'facing' in a &&
    'facing' in b &&
    a.facing === b.facing &&
    Math.abs(wallDepth(a) - wallDepth(b)) < 0.06
  )
}
