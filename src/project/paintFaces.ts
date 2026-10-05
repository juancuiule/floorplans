import { wallFrame } from '../geometry/walls'
import type { Finishes } from '../model/finishes'
import type { Room, Wall } from '../model/types'
import { plan } from './plan'

// Paintable wall faces: each side of each wall, split by the room it faces.
// A long wall that runs past the hall and the main room is two faces on that
// side, so each room can have its own color. Faces that look outside the flat
// (the outer face of a party wall) are left out.
//
// Face id: `<wall>:<side>:<room>`, side '+' or '-' along wallFrame(wall).n.

export interface PaintFace {
  id: string
  wall: string
  /** +1: the face on the side of wallFrame(wall).n; −1 the other. */
  side: 1 | -1
  /** Stretch of the wall it covers, as distance from wall.a. */
  s0: number
  s1: number
  room: string
  roomName: string
}

/** How far in front of a face to look for the room it faces. */
const PROBE = 0.06
/** Faces shorter than this (a sliver past a corner) are not worth a row. */
const MIN_LENGTH = 0.15

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'room'

/** Rooms that share a name (the bathroom drawn as two rectangles) paint as one. */
function roomKey(r: Room) {
  return slug(r.name)
}

export function paintFaces(walls: Wall[], rooms: Room[] = plan.shell.rooms): PaintFace[] {
  const out: PaintFace[] = []
  for (const w of walls) {
    const f = wallFrame(w)
    const alongX = Math.abs(f.u[1]) < 1e-6
    const alongZ = Math.abs(f.u[0]) < 1e-6
    if (!alongX && !alongZ) continue
    for (const side of [1, -1] as const) {
      // The line just in front of this face, in plan.
      const off = side * (w.thickness / 2 + PROBE)
      const px = w.a[0] + f.n[0] * off
      const pz = w.a[1] + f.n[1] * off
      const ranges = new Map<string, { name: string; s0: number; s1: number }>()
      for (const r of rooms) {
        const [x0, z0, x1, z1] = r.rect
        let lo: number, hi: number
        if (alongX) {
          if (pz < z0 || pz > z1) continue
          ;[lo, hi] = [x0, x1]
        } else {
          if (px < x0 || px > x1) continue
          ;[lo, hi] = [z0, z1]
        }
        // Room span along the axis -> distance from wall.a, clipped to the wall.
        const a = alongX ? w.a[0] : w.a[1]
        const dir = alongX ? f.u[0] : f.u[1]
        let s0 = (lo - a) * dir
        let s1 = (hi - a) * dir
        if (s0 > s1) [s0, s1] = [s1, s0]
        s0 = Math.max(0, s0)
        s1 = Math.min(f.length, s1)
        if (s1 - s0 < MIN_LENGTH) continue
        const key = roomKey(r)
        const cur = ranges.get(key)
        ranges.set(
          key,
          cur ? { name: r.name, s0: Math.min(cur.s0, s0), s1: Math.max(cur.s1, s1) } : { name: r.name, s0, s1 },
        )
      }
      for (const [room, { name, s0, s1 }] of ranges) {
        out.push({ id: `${w.id}:${side > 0 ? '+' : '-'}:${room}`, wall: w.id, side, s0, s1, room, roomName: name })
      }
    }
  }
  return out
}

/** The face under a point on a wall's surface, from the normal of the hit. */
export function faceAt(
  faces: PaintFace[],
  walls: Wall[],
  wallId: string,
  x: number,
  z: number,
  normal: [number, number],
): PaintFace | null {
  const w = walls.find((v) => v.id === wallId)
  if (!w) return null
  const f = wallFrame(w)
  const side = normal[0] * f.n[0] + normal[1] * f.n[1] >= 0 ? 1 : -1
  const s = (x - w.a[0]) * f.u[0] + (z - w.a[1]) * f.u[1]
  return faces.find((p) => p.wall === wallId && p.side === side && s >= p.s0 - 0.02 && s <= p.s1 + 0.02) ?? null
}

/** Old layouts: the single accent wall becomes a painted face (the one its accent panel was on). */
export function migrateAccent(f: Finishes, faces: PaintFace[], walls: Wall[]): Finishes {
  if (f.accentWall === 'none') return f
  const panel = plan.shell.accentPanels.find((a) => a.wall === f.accentWall)
  const w = walls.find((v) => v.id === f.accentWall)
  let paint = f.paint
  if (panel && w) {
    const cx = (panel.min[0] + panel.max[0]) / 2
    const cz = (panel.min[2] + panel.max[2]) / 2
    const fr = wallFrame(w)
    const side = (cx - w.a[0]) * fr.n[0] + (cz - w.a[1]) * fr.n[1] >= 0 ? 1 : -1
    const face = faceAt(faces, walls, w.id, cx, cz, [fr.n[0] * side, fr.n[1] * side])
    if (face && !paint[face.id]) paint = { ...paint, [face.id]: f.accentColor }
  }
  return { ...f, accentWall: 'none', paint }
}

/** A face's name in the UI: its room, then its wall. */
export function faceLabel(face: PaintFace, wallLabels: Record<string, string>): string {
  return wallLabels[face.wall] ?? face.wall
}
