import type { DecorFile, DecorItem, Facing } from '../model/decor'
import type { Finishes } from '../model/finishes'
import type { Plan } from '../model/plan'
import type { Rect, Vec2, Wall } from '../model/types'
import { wallFrame } from '../geometry/walls'
import { paintFaces, type PaintFace } from '../project/paintFaces'

// A layout made for one plan, fitted to another: the same apartment drawn
// again (traced in the floor plan editor, say), whose walls are not exactly
// where they were. Positions are mapped from the old plan's inside to the new
// one's, so what stood against a wall still does; things hung on walls move
// onto the nearest wall of the new plan facing the same way; paint follows the
// wall faces. Taking walls out is undone, as the walls are new.

/** How far a wall item may be from a wall of the new plan and still go onto it. */
const REACH = 0.6

/** `file` (a layout of `from`) with everything moved to fit `to`. */
export function fitLayout(file: DecorFile, from: Plan, to: Plan): DecorFile {
  const map = boxMap(insideOf(from), insideOf(to))
  const items = file.items.map((item) => fitItem(item, from, to, map))
  const finishes = file.finishes && fitFinishes(file.finishes, from, to, map)
  return { ...file, plan: to.id, items, ...(finishes ? { finishes } : {}) }
}

type Map2 = (p: Vec2) => Vec2

/** The inside of a plan: between the inner faces of its outer walls. */
function insideOf(plan: Plan): Rect {
  const outer = plan.shell.walls.filter((w) => w.kind === 'exterior')
  const xs = outer.filter((w) => w.a[0] === w.b[0]).map((w) => w.a[0])
  const zs = outer.filter((w) => w.a[1] === w.b[1]).map((w) => w.a[1])
  const t = (outer[0]?.thickness ?? 0) / 2
  if (xs.length < 2 || zs.length < 2) {
    const r = plan.shell.rooms.map((x) => x.rect)
    return [
      Math.min(...r.map((x) => x[0])),
      Math.min(...r.map((x) => x[1])),
      Math.max(...r.map((x) => x[2])),
      Math.max(...r.map((x) => x[3])),
    ]
  }
  return [Math.min(...xs) + t, Math.min(...zs) + t, Math.max(...xs) - t, Math.max(...zs) - t]
}

/** The stretch that takes one box onto another, axis by axis. */
function boxMap(a: Rect, b: Rect): Map2 {
  const k = (i: 0 | 1) => {
    const span = a[i + 2] - a[i]
    return span > 0 ? (b[i + 2] - b[i]) / span : 1
  }
  const [kx, kz] = [k(0), k(1)]
  return ([x, z]) => [round(b[0] + (x - a[0]) * kx), round(b[1] + (z - a[1]) * kz)]
}

const round = (v: number) => Math.round(v * 1000) / 1000

/** The coordinate of a wall face along its normal axis: x for a wall along z, z for one along x. */
function faceLine(w: Wall, facing: Facing): number {
  const half = w.thickness / 2
  return facing === 'x+'
    ? w.a[0] + half
    : facing === 'x-'
      ? w.a[0] - half
      : facing === 'z+'
        ? w.a[1] + half
        : w.a[1] - half
}

/** Whether a wall can hold something facing this way: it must run across that direction. */
const runsAcross = (w: Wall, facing: Facing) => (facing[0] === 'x' ? w.a[0] === w.b[0] : w.a[1] === w.b[1])

/** The wall of `plan` facing `facing` whose face is nearest `p`, alongside it. */
function nearestWall(plan: Plan, facing: Facing, p: Vec2): Wall | undefined {
  const across = facing[0] === 'x' ? 0 : 1
  const along = 1 - across
  let best: { w: Wall; d: number } | undefined
  for (const w of plan.shell.walls) {
    if (!runsAcross(w, facing)) continue
    const [lo, hi] = [Math.min(w.a[along], w.b[along]), Math.max(w.a[along], w.b[along])]
    if (p[along] < lo - 0.05 || p[along] > hi + 0.05) continue
    const d = Math.abs(faceLine(w, facing) - p[across])
    if (d <= REACH && (!best || d < best.d)) best = { w, d }
  }
  return best?.w
}

function fitItem(item: DecorItem, from: Plan, to: Plan, map: Map2): DecorItem {
  const [x, y, z] = item.at
  const [mx, mz] = map([x, z])
  const facing = 'facing' in item ? item.facing : undefined
  if (!facing || !('host' in item && item.host)) return { ...item, at: [mx, y, mz] }
  // Hung on a wall: keep its distance off the old face, on the new wall's face.
  const across = facing[0] === 'x' ? 0 : 2
  const old = from.shell.walls.find((w) => w.id === item.host)
  const off = old ? item.at[across] - faceLine(old, facing) : 0
  const wall = nearestWall(to, facing, [mx, mz])
  if (!wall) {
    const { host: _host, ...rest } = item
    return { ...rest, at: [mx, y, mz] } as DecorItem
  }
  const face = round(faceLine(wall, facing) + off)
  return { ...item, host: wall.id, at: across === 0 ? [face, y, mz] : [mx, y, face] } as DecorItem
}

/** Finishes with per-face paint moved onto the new plan's faces; walls taken out come back. */
function fitFinishes(f: Partial<Finishes>, from: Plan, to: Plan, map: Map2): Partial<Finishes> {
  const { structure: _structure, paint, ...rest } = f
  if (!paint) return rest
  const oldFaces = new Map(paintFaces(from.shell.walls, from.shell.rooms).map((x) => [x.id, x]))
  const newFaces = paintFaces(to.shell.walls, to.shell.rooms)
  const out: Record<string, string> = {}
  for (const [id, color] of Object.entries(paint)) {
    const face = oldFaces.get(id)
    const wall = face && from.shell.walls.find((w) => w.id === face.wall)
    if (!face || !wall) continue
    const hit = matchFace(face, wall, to, newFaces, map)
    if (hit) out[hit.id] = color
  }
  return { ...rest, paint: out }
}

/** The face of the new plan where an old face's middle lands, looking the same way. */
function matchFace(face: PaintFace, wall: Wall, to: Plan, faces: PaintFace[], map: Map2): PaintFace | undefined {
  const f = wallFrame(wall)
  const s = (face.s0 + face.s1) / 2
  const mid = map([wall.a[0] + f.u[0] * s, wall.a[1] + f.u[1] * s])
  const look: Vec2 = [f.n[0] * face.side, f.n[1] * face.side]
  let best: { face: PaintFace; d: number } | undefined
  for (const c of faces) {
    const w = to.shell.walls.find((x) => x.id === c.wall)!
    const g = wallFrame(w)
    const cl: Vec2 = [g.n[0] * c.side, g.n[1] * c.side]
    if (Math.abs(cl[0] - look[0]) > 1e-6 || Math.abs(cl[1] - look[1]) > 1e-6) continue
    // Distance off the wall's line, and how far along it the point falls.
    const rel: Vec2 = [mid[0] - w.a[0], mid[1] - w.a[1]]
    const along = rel[0] * g.u[0] + rel[1] * g.u[1]
    const off = Math.abs(rel[0] * g.n[0] + rel[1] * g.n[1])
    if (along < c.s0 - 0.05 || along > c.s1 + 0.05 || off > REACH) continue
    if (!best || off < best.d) best = { face: c, d: off }
  }
  return best?.face
}
