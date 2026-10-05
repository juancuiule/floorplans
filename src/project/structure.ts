import { create } from 'zustand'
import { DEFAULT_STRUCTURE, removableWalls, type RemovableWall, type Structure } from '../model/structure'
import type { Bulge, Ceiling, MaterialId, Rect, Shell, Vec3, Wall } from '../model/types'
import type { RemovalDef } from '../model/plan'
import { plan, shell } from '.'
import { CEILING_TOP } from './derived'

/** The open plan's partitions that a layout can take out, in plan order. */
export const REMOVABLE_WALLS = removableWalls(plan)
const isRemovableWall = (id: string): id is RemovableWall => REMOVABLE_WALLS.includes(id)

// The shell as the open layout has it: shell.ts minus the partitions the owner
// took out (src/model/structure.ts), with what they carried (tiles, doors,
// accent paint, the passage header) and the fixes their absence needs (floor
// under the old wall, a bulkhead at the edge of the dropped ceiling).
//
// Everything that reads walls (rendering, walk collision, wall snapping,
// overlap and clearance checks, the measure tool) goes through activeShell().

type AccentPanel = Shell['accentPanels'][number]

export interface FloorFill {
  id: string
  rect: Rect
  material: MaterialId
}

type Removal = RemovalDef

/** What each removable partition takes with it, from the plan (plans/*.plan.json). */
export const REMOVALS: Record<RemovableWall, Removal> = plan.walls.removable ?? {}

/** Every wall in the plan, for the Room tab's list and diagram. */
export const WALL_LABELS: Record<string, string> = {
  ...Object.fromEntries(shell.walls.map((w) => [w.id, w.id])),
  ...plan.walls.labels,
  ...Object.fromEntries(Object.entries(REMOVALS).map(([id, r]) => [id, r.label])),
}

/** Height of the slab above the dropped ceiling, where the entry ceiling goes when raised. */
export const SLAB_CEILING = plan.droppedCeiling?.raiseTo ?? CEILING_TOP
const DROPPED = plan.droppedCeiling?.id
const BULKHEAD_WALL = plan.droppedCeiling?.bulkheadWall
/** Drywall edge that closes the dropped ceiling where the hall–main wall was. */
const BULKHEAD_T = 0.02

export interface ActiveShell {
  structure: Structure
  /** Walls standing on the floor (a partly removed wall is shortened, same id). */
  walls: Wall[]
  bulges: Bulge[]
  accentPanels: AccentPanel[]
  ceilings: Ceiling[]
  /** Hanging pieces with no floor footprint (the bulkhead at the edge of the dropped ceiling). Render only. */
  soffits: Wall[]
  floorFills: FloorFill[]
  /** Per wall id: its bulges and accent panels (stable arrays, for memoized rendering). */
  parts: Map<string, { bulges: Bulge[]; accents: AccentPanel[] }>
  /** Plan rectangles where a removed wall (or part of one) stood. */
  ghosts: { wall: RemovableWall; rect: Rect }[]
}

const isAlongZ = (w: Wall) => Math.abs(w.a[0] - w.b[0]) < 1e-6

/** Range [lo, hi] along the wall's axis (z for walls along z, x otherwise) of the stretch s0–s1. */
function axisRange(w: Wall, s0: number, s1: number): [number, number] {
  const i = isAlongZ(w) ? 1 : 0
  const dir = Math.sign(w.b[i] - w.a[i]) || 1
  const p = w.a[i] + dir * s0
  const q = w.a[i] + dir * s1
  return [Math.min(p, q), Math.max(p, q)]
}

/** A box clipped to the stretch of the wall that stays, or null when nothing is left. */
function clipBox<T extends { min: Vec3; max: Vec3 }>(box: T, w: Wall, keep: [number, number]): T | null {
  const [lo, hi] = axisRange(w, keep[0], keep[1])
  const k = isAlongZ(w) ? 2 : 0
  const min = [...box.min] as Vec3
  const max = [...box.max] as Vec3
  min[k] = Math.max(min[k], lo)
  max[k] = Math.min(max[k], hi)
  if (max[k] - min[k] < 1e-6) return null
  return min[k] === box.min[k] && max[k] === box.max[k] ? box : { ...box, min, max }
}

function wallRect(w: Wall, s0: number, s1: number): Rect {
  const [lo, hi] = axisRange(w, s0, s1)
  const t = w.thickness / 2
  const mm = (v: number) => Math.round(v * 1000) / 1000
  const r: Rect = isAlongZ(w) ? [w.a[0] - t, lo, w.a[0] + t, hi] : [lo, w.a[1] - t, hi, w.a[1] + t]
  return r.map(mm) as Rect
}

const wallLength = (w: Wall) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1])

const staticParts = new Map(
  shell.walls.map((w) => [
    w.id,
    { bulges: shell.bulges.filter((b) => b.host === w.id), accents: shell.accentPanels.filter((a) => a.wall === w.id) },
  ]),
)

const cache = new Map<string, ActiveShell>()
const keyOf = (s: Structure) => `${s.removedWalls.join(',')}|${s.raiseEntryCeiling ? 1 : 0}`

/** The shell for a structure (memoized: the same structure gives the same objects). */
export function activeShell(s: Structure = currentStructure()): ActiveShell {
  const key = keyOf(s)
  const hit = cache.get(key)
  if (hit) return hit
  const removed = new Set<string>(s.removedWalls)
  const walls: Wall[] = []
  const parts = new Map<string, { bulges: Bulge[]; accents: AccentPanel[] }>()
  const ghosts: ActiveShell['ghosts'] = []
  const soffits: Wall[] = []

  for (const w of shell.walls) {
    const own = staticParts.get(w.id)!
    if (!removed.has(w.id) || !isRemovableWall(w.id)) {
      walls.push(w)
      parts.set(w.id, own)
      continue
    }
    const keep = REMOVALS[w.id].keep
    const len = wallLength(w)
    if (!keep) {
      ghosts.push({ wall: w.id, rect: wallRect(w, 0, len) })
      continue
    }
    // Shortened wall, same id: decor hung on the part that stays keeps its host.
    const [lo, hi] = axisRange(w, keep[0], keep[1])
    const i = isAlongZ(w) ? 1 : 0
    const a = [...w.a] as Wall['a']
    const b = [...w.b] as Wall['b']
    const aLow = w.a[i] <= w.b[i]
    a[i] = aLow ? lo : hi
    b[i] = aLow ? hi : lo
    const openings = (w.openings ?? [])
      .filter((o) => o.offset >= keep[0] && o.offset + o.width <= keep[1])
      .map((o) => ({ ...o, offset: o.offset - keep[0] }))
    walls.push({ ...w, a, b, openings })
    parts.set(w.id, {
      bulges: own.bulges.map((x) => clipBox(x, w, keep)).filter((x): x is Bulge => !!x),
      // Accent paint belongs to the whole face: it goes with the wall.
      accents: [],
    })
    if (keep[0] > 0) ghosts.push({ wall: w.id, rect: wallRect(w, 0, keep[0]) })
    if (keep[1] < len) ghosts.push({ wall: w.id, rect: wallRect(w, keep[1], len) })
  }

  // The dropped ceiling stays (it hides services) unless raised; where the
  // hall–main wall held its edge, a bulkhead closes the step up to the slab.
  const dropped = shell.ceilings.find((c) => c.id === DROPPED)
  const ceilings = shell.ceilings.map((c) =>
    c.id === DROPPED && s.raiseEntryCeiling ? { ...c, height: SLAB_CEILING } : c,
  )
  if (dropped && BULKHEAD_WALL && removed.has(BULKHEAD_WALL) && !s.raiseEntryCeiling) {
    const w = shell.walls.find((x) => x.id === BULKHEAD_WALL)!
    const keep = REMOVALS[BULKHEAD_WALL].keep ?? [0, 0]
    const [lo, hi] = axisRange(w, keep[1], wallLength(w))
    const x = dropped.rect[2] + BULKHEAD_T / 2
    soffits.push({
      id: 'entry-bulkhead',
      a: [x, lo],
      b: [x, hi],
      thickness: BULKHEAD_T,
      height: SLAB_CEILING,
      kind: 'interior',
      material: 'plaster',
      // One opening the whole length, up to the dropped ceiling: only the strip above it is built.
      openings: [{ id: 'bulkhead-gap', kind: 'passage', offset: 0, width: hi - lo, height: dropped.height }],
    })
    parts.set('entry-bulkhead', { bulges: [], accents: [] })
  }

  const floorFills: FloorFill[] = []
  for (const id of s.removedWalls) {
    REMOVALS[id].floors.forEach((f, i) => {
      if (f.with?.every((o) => removed.has(o)) ?? true)
        floorFills.push({ id: `${id}:${i}`, rect: f.rect, material: f.material })
    })
  }

  const out: ActiveShell = {
    structure: s,
    walls,
    bulges: walls.flatMap((w) => parts.get(w.id)!.bulges),
    accentPanels: walls.flatMap((w) => parts.get(w.id)!.accents),
    ceilings,
    soffits,
    floorFills,
    parts,
    ghosts,
  }
  cache.set(key, out)
  return out
}

/** Walls standing in the open layout (shortened where part of a wall stays). */
export const activeWalls = (s?: Structure) => activeShell(s).walls
export const activeBulges = (s?: Structure) => activeShell(s).bulges
export const activeCeilings = (s?: Structure) => activeShell(s).ceilings

/** Where a ceiling fitting at `p` sits: the height of the ceiling over it in this structure. */
export function ceilingFitting(p: Vec3, s?: Structure): Vec3 {
  const [x, , z] = p
  const c = activeShell(s).ceilings.find(({ rect: [x0, z0, x1, z1] }) => x >= x0 && x <= x1 && z >= z0 && z <= z1)
  return c && c.height !== p[1] ? [x, c.height, z] : p
}

/**
 * False when decor hung at plan point (x, z) on wall `host` has lost its wall:
 * the wall was taken out, or that stretch of it was.
 */
export function hostStands(
  host: string | undefined,
  x: number,
  z: number,
  s: Structure = currentStructure(),
  halfWidth = 0,
): boolean {
  if (!host || !isRemovableWall(host) || !s.removedWalls.includes(host)) return true
  const w = activeShell(s).walls.find((v) => v.id === host)
  if (!w) return false
  const [lo, hi] = axisRange(w, 0, wallLength(w))
  const along = isAlongZ(w) ? z : x
  return along - halfWidth >= lo - 0.02 && along + halfWidth <= hi + 0.02
}

/** What lostWallOf needs from a decor item (artwork has size.w, furniture size[0]). */
export interface HungItem {
  at: Vec3
  host?: string
  facing?: string
  size?: Vec3 | { w: number }
}

/**
 * The removed wall a piece of decor was hung on, or null when its wall still
 * stands (or it hangs on none). A piece that runs past the end of the part of
 * a wall that stays counts as lost too.
 */
export function lostWallOf(item: HungItem, s: Structure = currentStructure()): RemovableWall | null {
  const { host } = item
  if (!host || !isRemovableWall(host) || !s.removedWalls.includes(host)) return null
  const w = shell.walls.find((v) => v.id === host)!
  // Its width runs along the wall when it faces across it (not when it sits on an opening's jamb).
  const across = item.facing?.[0] === (isAlongZ(w) ? 'x' : 'z')
  const width = !item.size ? 0 : Array.isArray(item.size) ? item.size[0] : (item.size as { w: number }).w
  return hostStands(host, item.at[0], item.at[2], s, across ? width / 2 : 0) ? null : host
}

// ---------- the open layout's structure ----------
//
// Set from the decor store (Scene's FinishesSync) so plan code that has no
// React context (obstacles, placement) can read it; tests set it directly.

interface StructureState {
  structure: Structure
  /** Dashed outline on the floor where removed walls stood (a viewer preference). */
  ghosts: boolean
  setGhosts: (on: boolean) => void
}

const GHOSTS_KEY = 'monoambiente:wall-ghosts'
function readGhosts() {
  try {
    return localStorage.getItem(GHOSTS_KEY) !== '0'
  } catch {
    return true
  }
}

export const useStructure = create<StructureState>((set) => ({
  structure: DEFAULT_STRUCTURE,
  ghosts: readGhosts(),
  setGhosts: (ghosts) => {
    try {
      localStorage.setItem(GHOSTS_KEY, ghosts ? '1' : '0')
    } catch {
      // Storage blocked: the setting lasts for this session only.
    }
    set({ ghosts })
  },
}))

export const currentStructure = () => useStructure.getState().structure

/** Returns true when the structure changed (walls, obstacles and faces must be rebuilt). */
export function setStructure(next: Structure = DEFAULT_STRUCTURE): boolean {
  if (keyOf(next) === keyOf(currentStructure())) return false
  useStructure.setState({ structure: next })
  return true
}

/** Runs `fn` after every structure change; returns the unsubscribe. */
export function onStructure(fn: (s: Structure) => void): () => void {
  return useStructure.subscribe((st, prev) => {
    if (st.structure !== prev.structure) fn(st.structure)
  })
}

/** The shell of the open layout, re-rendering on structure changes. */
export function useActiveShell(): ActiveShell {
  return activeShell(useStructure((s) => s.structure))
}
