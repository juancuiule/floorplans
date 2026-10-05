import type { ArtworkItem, DecorItem, Facing } from '../model/decor'
import type { Vec3 } from '../model/types'
import { FRAME_STYLES } from './catalog'
import { alongWall, facingVector, mountOf } from './placement'

// Where an item sits in a 2D frame: a wall plane (along the wall, height) or the
// floor plan. Smart guides, align/distribute and "hang as a gallery" all work on
// these boxes and move items by (du, dv) deltas in the same frame.

/** Overall outer size of a framed artwork, for selection bounds and panel readouts. */
export function artworkOuterSize(item: ArtworkItem): [number, number] {
  const style = FRAME_STYLES.find((s) => s.id === item.frame.style) ?? FRAME_STYLES[1]
  const framed = style.id !== 'none' && style.id !== 'canvas'
  const mat = framed ? item.frame.mat : 0
  return [item.size.w + (mat + style.width) * 2, item.size.h + (mat + style.width) * 2]
}

/** An axis-aligned rectangle in frame coordinates. */
export interface Box {
  u0: number
  u1: number
  v0: number
  v1: number
}

/**
 * A 2D frame. On a wall: u runs along the wall (to the right as you face it),
 * v is height, and `d` is the wall plane's offset along its outward normal.
 * On the floor: u and v are plan directions (unit [x, z] vectors).
 */
export type Frame =
  { kind: 'wall'; facing: Facing; d: number } | { kind: 'floor'; u: [number, number]; v: [number, number] }

export const FLOOR_FRAME: Frame = { kind: 'floor', u: [1, 0], v: [0, 1] }

export const isWallItem = (item: DecorItem): boolean => mountOf(item) === 'wall' && 'facing' in item && !!item.facing

/** Offset of an item's wall plane along the wall's outward normal. */
export function wallDepth(item: DecorItem): number {
  const f = ('facing' in item && item.facing) || 'z+'
  const [nx, nz] = facingVector(f)
  return item.at[0] * nx + item.at[2] * nz
}

export function wallFrameOf(item: DecorItem): Frame {
  return { kind: 'wall', facing: ('facing' in item && item.facing) || 'z+', d: wallDepth(item) }
}

/** Same wall plane: same facing, and within a few centimeters of the same depth. */
export function onPlane(item: DecorItem, frame: Frame, tol = 0.06): boolean {
  if (frame.kind !== 'wall') return !isWallItem(item) && mountOf(item) === 'surface'
  return (
    isWallItem(item) && 'facing' in item && item.facing === frame.facing && Math.abs(wallDepth(item) - frame.d) < tol
  )
}

/** Width and height on the wall, and where the box sits relative to `at` (center or bottom). */
function wallExtent(item: DecorItem): { w: number; h: number; bottom: boolean } {
  if (item.kind === 'artwork') {
    const [w, h] = artworkOuterSize(item)
    return { w, h, bottom: false }
  }
  if (item.kind === 'furniture') return { w: item.size[0], h: item.size[1], bottom: true }
  if (item.kind === 'lamp' && item.type === 'string') return { w: item.length ?? 2, h: 0.12, bottom: false }
  // Sconces, EXIT cubes, window boxes: aligned by their mounting point.
  return { w: 0, h: 0, bottom: false }
}

/** Half extents of an item's plan footprint, axis-aligned (rotated pieces use their bounding box). */
function planHalf(item: DecorItem): [number, number] {
  if (item.kind !== 'furniture') return [0, 0]
  const r = (item.rotation * Math.PI) / 180
  const c = Math.abs(Math.cos(r))
  const s = Math.abs(Math.sin(r))
  const hw = item.size[0] / 2
  const hd = item.size[2] / 2
  return [c * hw + s * hd, s * hw + c * hd]
}

const dot = (a: [number, number], x: number, z: number) => a[0] * x + a[1] * z

/** The item's box in a frame. */
export function boxIn(item: DecorItem, frame: Frame): Box {
  if (frame.kind === 'wall') {
    const u = dot(alongWall(frame.facing), item.at[0], item.at[2])
    const { w, h, bottom } = wallExtent(item)
    const v0 = bottom ? item.at[1] : item.at[1] - h / 2
    return { u0: u - w / 2, u1: u + w / 2, v0, v1: v0 + h }
  }
  const [ex, ez] = planHalf(item)
  const [x, z] = [item.at[0], item.at[2]]
  // u and v are axis directions (possibly flipped): project the AABB's extremes.
  const us = [dot(frame.u, x - ex, z - ez), dot(frame.u, x + ex, z + ez)]
  const vs = [dot(frame.v, x - ex, z - ez), dot(frame.v, x + ex, z + ez)]
  return { u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs) }
}

/**
 * A floor piece standing against a wall (a sofa, a sideboard), seen on that
 * wall: its width along the wall and its height. Null when it is not within a
 * few centimeters of the wall. Lets artwork line up with what stands below it.
 */
export function backedBox(item: DecorItem, frame: Frame): Box | null {
  if (frame.kind !== 'wall' || item.kind !== 'furniture' || isWallItem(item) || mountOf(item) !== 'surface') return null
  const [ex, ez] = planHalf(item)
  const [nx, nz] = facingVector(frame.facing)
  const back = item.at[0] * nx + item.at[2] * nz - (Math.abs(nx) * ex + Math.abs(nz) * ez)
  if (back - frame.d > 0.12 || back - frame.d < -0.05) return null
  const a = alongWall(frame.facing)
  const u = dot(a, item.at[0], item.at[2])
  const half = Math.abs(a[0]) * ex + Math.abs(a[1]) * ez
  return { u0: u - half, u1: u + half, v0: item.at[1], v1: item.at[1] + item.size[1] }
}

export function unionBox(boxes: Box[]): Box {
  return {
    u0: Math.min(...boxes.map((b) => b.u0)),
    u1: Math.max(...boxes.map((b) => b.u1)),
    v0: Math.min(...boxes.map((b) => b.v0)),
    v1: Math.max(...boxes.map((b) => b.v1)),
  }
}

/** World-space offset for a (du, dv) move in the frame. */
export function frameDelta(frame: Frame, du: number, dv: number): Vec3 {
  if (frame.kind === 'wall') {
    const [ax, az] = alongWall(frame.facing)
    return [du * ax, dv, du * az]
  }
  return [du * frame.u[0] + dv * frame.v[0], 0, du * frame.u[1] + dv * frame.v[1]]
}

/** World point for frame coordinates; `lift` pushes it off the wall (or sets the floor height). */
export function framePoint(frame: Frame, u: number, v: number, lift: number): Vec3 {
  if (frame.kind === 'wall') {
    const [ax, az] = alongWall(frame.facing)
    const [nx, nz] = facingVector(frame.facing)
    const d = frame.d + lift
    return [u * ax + d * nx, v, u * az + d * nz]
  }
  return [u * frame.u[0] + v * frame.v[0], lift, u * frame.u[1] + v * frame.v[1]]
}

/** Tenth of a millimeter: enough for edges to line up exactly, short in the file. */
const r4 = (v: number) => Math.round(v * 10000) / 10000

export function translated(at: Vec3, d: Vec3): Vec3 {
  return [r4(at[0] + d[0]), r4(at[1] + d[1]), r4(at[2] + d[2])]
}
