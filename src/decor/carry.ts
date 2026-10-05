import type { DecorItem, FurnitureItem } from '../model/decor'
import { facingRotation, mountOf } from './placement'

// Things standing on a piece of furniture go where it goes. When a piece moves,
// turns or changes size, whatever rests on it (a lamp on the desk, mugs on a
// shelf, a plant on the sideboard) keeps its place on it, and so on up the
// stack (a cup on the tray on the desk).
//
// "Rests on" is read from the data, not the scene: a surface item whose spot
// is inside a furniture footprint, above its base and no higher than its top.

/** How far outside a footprint, or above a top, an item may be and still count as on it. */
const EDGE = 0.01
/** Items this close to a support's top are on the top (and follow it up or down when it changes height). */
const ON_TOP = 0.015

interface Frame {
  x: number
  z: number
  /** Rotation around y, radians. */
  theta: number
  /** Local extents: x in [x0, x1], z in [z0, z1]. */
  x0: number
  x1: number
  z0: number
  z1: number
  base: number
  top: number
}

/** The frame of a piece that can hold things, or null (a ceiling rack, anything that isn't furniture). */
export function supportFrame(item: DecorItem): Frame | null {
  if (item.kind !== 'furniture' || item.at[1] < -1) return null
  const [w, h, d] = item.size
  const mount = mountOf(item)
  if (mount === 'surface')
    return {
      x: item.at[0],
      z: item.at[2],
      theta: rad(item.rotation),
      x0: -w / 2,
      x1: w / 2,
      z0: -d / 2,
      z1: d / 2,
      base: item.at[1],
      top: item.at[1] + h,
    }
  if (mount === 'wall' && item.facing)
    return {
      x: item.at[0],
      z: item.at[2],
      theta: facingRotation[item.facing],
      x0: -w / 2,
      x1: w / 2,
      z0: 0,
      z1: d,
      base: item.at[1],
      top: item.at[1] + h,
    }
  return null
}

const rad = (deg: number) => (deg * Math.PI) / 180

/** Plan point to the frame's local (x, z). */
function toLocal(f: Frame, x: number, z: number): [number, number] {
  const dx = x - f.x
  const dz = z - f.z
  const c = Math.cos(f.theta)
  const s = Math.sin(f.theta)
  // Inverse of local -> plan: x' = x·cos + z·sin, z' = −x·sin + z·cos.
  return [dx * c - dz * s, dx * s + dz * c]
}

function toPlan(f: Frame, lx: number, lz: number): [number, number] {
  const c = Math.cos(f.theta)
  const s = Math.sin(f.theta)
  return [f.x + lx * c + lz * s, f.z - lx * s + lz * c]
}

/** Items that can rest on something: anything standing on a surface. */
const canRide = (i: DecorItem) => i.at[1] > -1 && mountOf(i) === 'surface'

/** The support `item` rests on, among `items`: the one with the highest top under it. */
export function supportOf(item: DecorItem, items: DecorItem[]): DecorItem | null {
  if (!canRide(item)) return null
  let best: { s: DecorItem; top: number } | null = null
  for (const s of items) {
    if (s.id === item.id) continue
    const f = supportFrame(s)
    if (!f) continue
    const y = item.at[1]
    if (y <= f.base + 0.005 || y > f.top + EDGE) continue
    const [lx, lz] = toLocal(f, item.at[0], item.at[2])
    if (lx < f.x0 - EDGE || lx > f.x1 + EDGE || lz < f.z0 - EDGE || lz > f.z1 + EDGE) continue
    if (!best || f.top > best.top) best = { s, top: f.top }
  }
  return best?.s ?? null
}

const r3 = (v: number) => Math.round(v * 1000) / 1000

/** Where a rider ends up when its support goes from `from` to `to`. */
export function carryRider<T extends DecorItem>(rider: T, from: DecorItem, to: DecorItem): T {
  const f = supportFrame(from)!
  const g = supportFrame(to)
  if (!g) return rider
  let [lx, lz] = toLocal(f, rider.at[0], rider.at[2])
  // A smaller piece keeps its load on it.
  lx = Math.min(g.x1, Math.max(g.x0, lx))
  lz = Math.min(g.z1, Math.max(g.z0, lz))
  const [x, z] = toPlan(g, lx, lz)
  const y = Math.abs(rider.at[1] - f.top) < ON_TOP ? g.top : rider.at[1] + (g.base - f.base)
  const next = { ...rider, at: [r3(x), r3(y), r3(z)] } as T
  if ('rotation' in next && typeof next.rotation === 'number') {
    const turn = ((g.theta - f.theta) * 180) / Math.PI
    if (Math.abs(turn) > 1e-6)
      (next as { rotation: number }).rotation = r3((((next.rotation + turn) % 360) + 360) % 360)
  }
  return next
}

/** True when a piece moved, turned or changed size between two versions. */
function frameChanged(a: DecorItem, b: DecorItem): boolean {
  if (a === b) return false
  if (a.at[0] !== b.at[0] || a.at[1] !== b.at[1] || a.at[2] !== b.at[2]) return true
  if ('rotation' in a && 'rotation' in b && a.rotation !== b.rotation) return true
  if ('facing' in a && 'facing' in b && a.facing !== b.facing) return true
  if (a.kind === 'furniture' && b.kind === 'furniture')
    return (a as FurnitureItem).size.some((v, i) => v !== (b as FurnitureItem).size[i])
  return false
}

/**
 * Brings along everything resting on the pieces that changed from `prev` to
 * `next`. Items that changed themselves (moved with the selection, say) are
 * left as they are. Returns `next` untouched when nothing needs carrying.
 */
export function carry(prev: DecorItem[], next: DecorItem[]): DecorItem[] {
  if (prev === next) return next
  const before = new Map(prev.map((i) => [i.id, i]))
  const after = new Map(next.map((i) => [i.id, i]))
  // Supports that changed, in the order to process them.
  const queue: string[] = []
  const changed = new Set<string>()
  for (const [id, b] of after) {
    const a = before.get(id)
    if (!a || !frameChanged(a, b)) continue
    changed.add(id)
    if (supportFrame(a)) queue.push(id)
  }
  if (!queue.length) return next
  // Who rests on whom, as things were before the change.
  const riders = new Map<string, DecorItem[]>()
  for (const i of prev) {
    if (changed.has(i.id) || !after.has(i.id)) continue
    const s = supportOf(i, prev)
    if (s) riders.set(s.id, [...(riders.get(s.id) ?? []), i])
  }
  if (!riders.size) return next
  const out = new Map(after)
  const seen = new Set<string>()
  while (queue.length) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    const from = before.get(id)!
    const to = out.get(id)!
    for (const r of riders.get(id) ?? []) {
      if (changed.has(r.id)) continue
      const moved = carryRider(r, from, to)
      if (moved === r) continue
      out.set(r.id, moved)
      changed.add(r.id)
      if (supportFrame(r)) queue.push(r.id)
    }
  }
  return next.map((i) => out.get(i.id) ?? i)
}
