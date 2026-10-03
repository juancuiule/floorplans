import type { Plan, RemovalDef } from './plan'
import { area, boundsOf, contains, edgesOf, isRectilinear, rectangles, rectPoints, simplify } from './polygon'
import type { MaterialDef, ObjectType, Opening, Rect, SceneObject, Vec2, Vec3, Wall } from './types'

// A floor plan drawn in the editor (src/pages/floorplan/), and how it becomes a
// plan. The sketch is what a person draws: rooms as right-angled polygons on a
// grid, doors and windows clicked onto walls, a few fittings, over an optional
// reference image of the floor plan. Walls, floors, ceilings, wall
// roles and which partitions can come out are worked out from it, so the plan
// stays consistent however the rooms move. The sketch is kept in the plan file
// (`sketch`), so a plan drawn here can be opened in the editor again.
//
// Rooms are drawn on wall centerlines: two rooms that share an edge share the
// wall along it. Every edge runs along x or z; meters throughout.

export type RoomKind = 'living' | 'bedroom' | 'kitchen' | 'bath' | 'hall' | 'balcony'

export interface SketchRoom {
  id: string
  name: string
  kind: RoomKind
  /** Corners on wall centerlines, in order; every edge runs along x or z. */
  points: Vec2[]
}

export type OpeningKind = 'door' | 'window' | 'glassDoor' | 'passage'

export interface SketchOpening {
  id: string
  kind: OpeningKind
  /** A point on the wall: the opening's center. */
  at: Vec2
  width: number
}

export type FittingType = 'toilet' | 'basin' | 'showerTray' | 'counter' | 'kitchenSink' | 'cooktop'

export interface SketchFitting {
  id: string
  type: FittingType
  /** Footprint center on the floor. */
  at: Vec2
  /** Degrees around y; 0 faces +z. */
  rotation: number
}

/** An image of the floor plan under the drawing, to trace. */
export interface ReferenceImage {
  /** Where the image is served from (the space's references, server/api.ts). */
  url: string
  /** Its size in pixels. */
  width: number
  height: number
  /** Plan position of its top-left corner. */
  origin: Vec2
  /** Meters per image pixel: set by measuring a known length on it. */
  scale: number
  opacity: number
  hidden?: boolean
}

export interface Sketch {
  version: 2
  rooms: SketchRoom[]
  openings: SketchOpening[]
  fittings: SketchFitting[]
  /** Floor to ceiling, meters. */
  height: number
  reference?: ReferenceImage
}

export interface PlanMeta {
  id: string
  name: string
  location: { label: string; lat: number; lon: number; tz: number }
}

export const ROOM_KINDS: { id: RoomKind; label: string }[] = [
  { id: 'living', label: 'Living' },
  { id: 'bedroom', label: 'Bedroom' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'bath', label: 'Bathroom' },
  { id: 'hall', label: 'Hall' },
  { id: 'balcony', label: 'Balcony' },
]

/** Default sizes of fittings, [w, h, d], and how high they sit (sinks and cooktops go on a counter). */
export const FITTINGS: Record<FittingType, { label: string; size: Vec3; y: number }> = {
  toilet: { label: 'Toilet', size: [0.38, 0.4, 0.68], y: 0 },
  basin: { label: 'Basin', size: [0.46, 0.86, 0.38], y: 0 },
  showerTray: { label: 'Shower', size: [0.8, 0.06, 0.8], y: 0 },
  counter: { label: 'Counter', size: [1.8, 0.9, 0.6], y: 0 },
  kitchenSink: { label: 'Sink', size: [0.45, 0.18, 0.38], y: 0.9 },
  cooktop: { label: 'Cooktop', size: [0.3, 0.01, 0.5], y: 0.9 },
}

export const EXTERIOR_T = 0.2
export const INTERIOR_T = 0.1
const DOOR_H = 2.05
const EPS = 1e-6

export const emptySketch = (): Sketch => ({ version: 2, rooms: [], openings: [], fittings: [], height: 2.6 })

/** A sketch as stored, read: version 1 drew rooms as rectangles (`rect`), which become polygons. */
export function readSketch(
  raw:
    | Sketch
    | (Omit<Sketch, 'version' | 'rooms'> & { version: 1; rooms: (Omit<SketchRoom, 'points'> & { rect: Rect })[] }),
): Sketch {
  if (raw.version === 2) return raw
  return { ...raw, version: 2, rooms: raw.rooms.map(({ rect, ...r }) => ({ ...r, points: rectPoints(rect) })) }
}

const indoor = (r: SketchRoom | undefined) => !!r && r.kind !== 'balcony'
const round = (v: number) => Math.round(v * 1000) / 1000

/** What lies on each side of a stretch of room edge. */
interface Run {
  /** 'x': the edge runs along x at z = line; 'z': along z at x = line. */
  axis: 'x' | 'z'
  line: number
  from: number
  to: number
  /** Room on the lower side (z < line or x < line), and on the upper side. */
  lo?: SketchRoom
  hi?: SketchRoom
}

/** Every room edge, cut where other edges start or end, with the rooms on either side. */
function edgeRuns(rooms: SketchRoom[]): Run[] {
  const runs: Run[] = []
  for (const axis of ['x', 'z'] as const) {
    // Edges along x sit at a z and span a range of x; edges along z the other way round.
    const lines = new Map<number, { from: number; to: number; room: SketchRoom; side: 'lo' | 'hi' }[]>()
    for (const room of rooms) {
      for (const [p, q] of edgesOf(room.points)) {
        const alongX = Math.abs(p[1] - q[1]) < EPS
        if ((axis === 'x') !== alongX) continue
        const line = round(alongX ? p[1] : p[0])
        const [from, to] = alongX
          ? [Math.min(p[0], q[0]), Math.max(p[0], q[0])]
          : [Math.min(p[1], q[1]), Math.max(p[1], q[1])]
        // Which side of the edge the room is on: probe just past its middle.
        const mid = (from + to) / 2
        const probe: Vec2 = alongX ? [mid, line + 0.001] : [line + 0.001, mid]
        const side = contains(room.points, probe) ? 'hi' : 'lo'
        lines.set(line, [...(lines.get(line) ?? []), { from, to, room, side }])
      }
    }
    for (const [line, edges] of lines) {
      const cuts = [...new Set(edges.flatMap((e) => [round(e.from), round(e.to)]))].sort((p, q) => p - q)
      for (let i = 0; i < cuts.length - 1; i++) {
        const [from, to] = [cuts[i], cuts[i + 1]]
        const mid = (from + to) / 2
        const at = edges.filter((e) => e.from <= mid && e.to >= mid)
        if (!at.length) continue
        runs.push({
          axis,
          line,
          from,
          to,
          lo: at.find((e) => e.side === 'lo')?.room,
          hi: at.find((e) => e.side === 'hi')?.room,
        })
      }
    }
  }
  return runs
}

type WallSort = 'exterior' | 'interior' | 'railing' | 'none'

function sortOf(run: Run): WallSort {
  const [a, b] = [run.lo, run.hi]
  if (indoor(a) && indoor(b)) return a === b ? 'none' : 'interior'
  if (indoor(a) || indoor(b)) return 'exterior'
  if (a || b) return a && b ? 'none' : 'railing'
  return 'none'
}

interface Segment {
  axis: 'x' | 'z'
  line: number
  from: number
  to: number
  sort: 'exterior' | 'interior' | 'railing'
  rooms: SketchRoom[]
}

/** Runs joined into straight segments: exterior walls and railings run on; partitions stop where their rooms change. */
function segments(rooms: SketchRoom[]): Segment[] {
  const runs = edgeRuns(rooms)
    .map((r) => ({ ...r, sort: sortOf(r) }))
    .filter((r): r is Run & { sort: Segment['sort'] } => r.sort !== 'none')
    .sort((p, q) => p.axis.localeCompare(q.axis) || p.line - q.line || p.from - q.from)
  const out: Segment[] = []
  for (const r of runs) {
    const rs = [r.lo, r.hi].filter((x): x is SketchRoom => !!x)
    const last = out.at(-1)
    const samePair = (s: Segment) => s.rooms.length === rs.length && s.rooms.every((x) => rs.includes(x))
    if (
      last &&
      last.axis === r.axis &&
      last.line === r.line &&
      Math.abs(last.to - r.from) < EPS &&
      last.sort === r.sort &&
      (r.sort !== 'interior' || samePair(last))
    ) {
      last.to = r.to
      for (const x of rs) if (!last.rooms.includes(x)) last.rooms.push(x)
    } else out.push({ axis: r.axis, line: r.line, from: r.from, to: r.to, sort: r.sort, rooms: rs })
  }
  return out
}

const roomLabel = (r: SketchRoom) => r.name || ROOM_KINDS.find((k) => k.id === r.kind)!.label

/** The rooms of a sketch as a plan: walls, openings, floors, ceilings, fittings and wall rules. */
export function planFromSketch(sketch: Sketch, meta: PlanMeta): Plan {
  const rooms = sketch.rooms
  const inside = rooms.filter((r) => r.kind !== 'balcony')
  if (!inside.length) throw new Error('A plan needs at least one room that is not a balcony')
  const odd = rooms.find((r) => !isRectilinear(r.points))
  if (odd) throw new Error(`${roomLabel(odd)}: every wall must run straight across or up the plan`)
  // Each room as rectangles, largest first: floors, ceilings and rooms in 3D are rectangles.
  const pieces = new Map(rooms.map((r) => [r, rectangles(simplify(r.points))]))
  const h = sketch.height
  const segs = segments(rooms)

  // Walls, with ids by role and position so they read well in the UI.
  const walls: Wall[] = []
  const labels: Record<string, string> = {}
  const removable: Record<string, RemovalDef> = {}
  const railings: SceneObject[] = []
  let ext = 0
  let int = 0
  for (const s of segs) {
    const along = (v: number): Vec2 => (s.axis === 'x' ? [v, s.line] : [s.line, v])
    if (s.sort === 'railing') {
      const [px, pz] = along((s.from + s.to) / 2)
      railings.push({
        id: `railing-${railings.length + 1}`,
        type: 'railing',
        position: [round(px), 0, round(pz)],
        rotation: s.axis === 'z' ? 90 : 0,
        size: [round(s.to - s.from), 1.05, 0.02],
      })
      continue
    }
    const exterior = s.sort === 'exterior'
    const t = exterior ? EXTERIOR_T : INTERIOR_T
    // Exterior walls run on past their ends to close the corners.
    const pad = exterior ? t / 2 : 0
    const p0 = along(s.from - pad)
    const p1 = along(s.to + pad)
    const id = exterior ? `outer-${++ext}` : `wall-${++int}`
    walls.push({
      id,
      a: [round(p0[0]), round(p0[1])],
      b: [round(p1[0]), round(p1[1])],
      thickness: t,
      height: h,
      kind: exterior ? 'exterior' : 'interior',
      material: 'plaster',
    })
    const names = s.rooms.map(roomLabel)
    labels[id] = exterior ? `${s.rooms.filter(indoor).map(roomLabel).join(', ')} wall` : names.join(' ↔ ')
    if (!exterior)
      removable[id] = {
        label: names.join(' ↔ '),
        note: '',
        floors: [{ rect: strip(s, t), material: floorOf(s.rooms[0]) }],
      }
  }

  // Openings go on the wall they sit on, measured from its a end.
  for (const o of sketch.openings) {
    const wall = walls.find((w) => onWall(w, o.at))
    if (!wall) continue
    const along =
      wall.a[0] === wall.b[0] ? o.at[1] - Math.min(wall.a[1], wall.b[1]) : o.at[0] - Math.min(wall.a[0], wall.b[0])
    const length = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1])
    const width = Math.min(o.width, length - 0.1)
    const offset = round(Math.max(0.05, Math.min(length - width - 0.05, along - width / 2)))
    ;(wall.openings ??= []).push(openingOf(o, offset, round(width), h))
  }

  // The sun comes in through the facade (the exterior wall with the most glass); windowless outer walls are party walls.
  const glass = (w: Wall) =>
    (w.openings ?? []).filter((o) => o.kind === 'window').reduce((sum, o) => sum + o.width * o.height, 0)
  const outer = walls.filter((w) => w.kind === 'exterior')
  const facade = [...outer].sort((a, b) => glass(b) - glass(a))[0]
  const roles: Record<string, 'facade' | 'party'> = {}
  for (const w of outer) {
    if (w === facade && glass(w) > 0) roles[w.id] = 'facade'
    else if (!w.openings?.length) roles[w.id] = 'party'
  }

  const bounds = union(rooms.map((r) => boundsOf(r.points)))
  const fittings: SceneObject[] = sketch.fittings.map((f) => {
    const spec = FITTINGS[f.type]
    return {
      id: f.id,
      type: f.type as ObjectType,
      position: [round(f.at[0]), spec.y, round(f.at[1])],
      rotation: f.rotation,
      size: spec.size,
    }
  })
  const downlights: SceneObject[] = inside.map((r) => {
    const [x0, z0, x1, z1] = pieces.get(r)![0]
    return { id: `light-${r.id}`, type: 'downlight', position: [round((x0 + x1) / 2), h, round((z0 + z1) / 2)] }
  })
  /** One id per piece of a room: the room's own for the largest. */
  const pieceId = (r: SketchRoom, i: number) => (i === 0 ? r.id : `${r.id}-${i + 1}`)

  const [bx0, bz0, bx1, bz1] = bounds
  return {
    version: 1,
    id: meta.id,
    name: meta.name,
    subtitle: `${(bx1 - bx0).toFixed(2)} × ${(bz1 - bz0).toFixed(2)} m · ${meta.location.label}`,
    location: meta.location,
    materials: MATERIALS,
    shell: {
      walls,
      bulges: [],
      // The label goes on the largest piece; a room that is not a rectangle says its area.
      rooms: rooms.flatMap((r) =>
        pieces.get(r)!.map((rect, i) => ({
          id: pieceId(r, i),
          name: roomLabel(r),
          rect: innerRect(rect, r, segs),
          ...(r.kind === 'bath' || r.kind === 'balcony' ? { floor: floorOf(r) } : {}),
          label: i === 0,
          ...(i === 0 && pieces.get(r)!.length > 1 ? { labelDims: `${area(r.points).toFixed(1)} m²` } : {}),
        })),
      ),
      ceilings: inside.flatMap((r) =>
        pieces.get(r)!.map((rect, i) => ({ id: pieceId(r, i), rect, height: h, material: 'ceiling' })),
      ),
      baseFloors: inside
        .filter((r) => r.kind !== 'bath')
        .flatMap((r) => pieces.get(r)!.map((rect, i) => ({ id: pieceId(r, i), rect, material: floorOf(r) }))),
      accentPanels: [],
      slab: {
        rect: [bx0 - EXTERIOR_T / 2, bz0 - EXTERIOR_T / 2, bx1 + EXTERIOR_T / 2, bz1 + EXTERIOR_T / 2].map(
          round,
        ) as Rect,
        thickness: 0.18,
        material: 'concrete',
      },
    },
    fixtures: [...fittings, ...downlights, ...railings],
    walls: { labels, roles, removable },
    sketch,
  }
}

/** Which floor finish zone a room belongs to (the Room tab picks each zone's floor). */
function floorOf(r: SketchRoom): string {
  if (r.kind === 'bath') return 'bathFloor'
  if (r.kind === 'balcony') return 'balconyFloor'
  return r.kind === 'kitchen' || r.kind === 'hall' ? 'floorHall' : 'floorMain'
}

/**
 * A piece of a room's usable floor: the piece less half of each wall along its
 * sides. A side inside the room (where the room was cut into pieces) has none.
 */
function innerRect(rect: Rect, r: SketchRoom, segs: Segment[]): Rect {
  const [x0, z0, x1, z1] = rect
  // Half the wall along a side, when walls of this room cover all of it: a side
  // that is partly open to the rest of the room stays where it is, so faces of
  // the walls along it still find the room.
  const half = (axis: 'x' | 'z', line: number) => {
    const [lo, hi] = axis === 'x' ? [x0, x1] : [z0, z1]
    const along = segs.filter(
      (g) => g.axis === axis && Math.abs(g.line - line) < EPS && g.rooms.includes(r) && g.sort !== 'railing',
    )
    const covered = along.reduce((sum, g) => sum + Math.max(0, Math.min(hi, g.to) - Math.max(lo, g.from)), 0)
    if (covered < hi - lo - EPS) return 0
    return (along.some((g) => g.sort === 'exterior') ? EXTERIOR_T : INTERIOR_T) / 2
  }
  return [x0 + half('z', x0), z0 + half('x', z0), x1 - half('z', x1), z1 - half('x', z1)].map(round) as Rect
}

/** The floor strip under a partition, for when it is taken out. */
function strip(s: Segment, t: number): Rect {
  const [a, b] = [round(s.line - t / 2), round(s.line + t / 2)]
  return s.axis === 'x' ? [s.from, a, s.to, b] : [a, s.from, b, s.to]
}

function onWall(w: Wall, p: Vec2): boolean {
  const vertical = w.a[0] === w.b[0]
  const [lo, hi] = vertical
    ? [Math.min(w.a[1], w.b[1]), Math.max(w.a[1], w.b[1])]
    : [Math.min(w.a[0], w.b[0]), Math.max(w.a[0], w.b[0])]
  const [line, along] = vertical ? [w.a[0], p[1]] : [w.a[1], p[0]]
  const off = vertical ? p[0] : p[1]
  return Math.abs(off - line) <= w.thickness / 2 + 0.05 && along >= lo && along <= hi
}

function openingOf(o: SketchOpening, offset: number, width: number, h: number): Opening {
  const base = { id: o.id, offset, width }
  if (o.kind === 'door')
    return {
      ...base,
      kind: 'door',
      height: DOOR_H,
      leaf: { hinge: 'a', swing: -1, openDeg: 70, material: 'oakDoor', frameMaterial: 'steelFrame' },
    }
  if (o.kind === 'passage') return { ...base, kind: 'passage', height: Math.min(2.2, h) }
  if (o.kind === 'glassDoor')
    return {
      ...base,
      kind: 'window',
      sill: 0,
      height: Math.min(2.2, h - 0.1),
      glazing: { panels: 2, frameMaterial: 'aluminum' },
    }
  return {
    ...base,
    kind: 'window',
    sill: 0.9,
    height: Math.min(1.3, h - 1),
    glazing: { panels: 2, frameMaterial: 'aluminum' },
  }
}

function union(rects: Rect[]): Rect {
  return rects.reduce<Rect>(
    (u, r) => [Math.min(u[0], r[0]), Math.min(u[1], r[1]), Math.max(u[2], r[2]), Math.max(u[3], r[3])],
    [Infinity, Infinity, -Infinity, -Infinity],
  )
}

/** The materials a drawn plan uses: the same palette as the loft example. */
const MATERIALS: Record<string, MaterialDef> = {
  plaster: { color: '#f3f1ec', roughness: 0.95 },
  ceiling: { color: '#f7f6f2', roughness: 0.95 },
  oakFloor: { color: '#e2cba8', roughness: 0.7, pattern: { kind: 'planks', width: 0.19, length: 1.2 } },
  bathFloor: {
    color: '#c4c1bb',
    roughness: 0.6,
    pattern: { kind: 'tiles', width: 0.6, height: 0.6, grout: '#a9a59e' },
  },
  tile: { color: '#f6f6f4', roughness: 0.35, pattern: { kind: 'tiles', width: 0.6, height: 0.3, grout: '#9c9a96' } },
  oakDoor: { color: '#c8a172', roughness: 0.7 },
  steelFrame: { color: '#8c8f92', roughness: 0.5, metalness: 0.3 },
  aluminum: { color: '#eef0f1', roughness: 0.45, metalness: 0.1 },
  glass: { color: '#cfe4ec', roughness: 0.05, opacity: 0.22 },
  concrete: { color: '#c7c3bc', roughness: 1 },
  balconyFloor: {
    color: '#c9c4bb',
    roughness: 0.85,
    pattern: { kind: 'tiles', width: 0.45, height: 0.45, grout: '#aca79e' },
  },
  ceramic: { color: '#fbfbfa', roughness: 0.2 },
  cabinet: { color: '#ebe8e2', roughness: 0.7 },
  countertop: { color: '#d6d2ca', roughness: 0.5 },
  appliance: { color: '#e2e3e4', roughness: 0.35, metalness: 0.2 },
  blackGlass: { color: '#1f2022', roughness: 0.15 },
  steel: { color: '#b9bcbf', roughness: 0.3, metalness: 0.7 },
  downlight: { color: '#ffffff', roughness: 0.5, emissive: '#fff6e0' },
}
