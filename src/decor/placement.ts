import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { DecorItem, Facing, FurnitureItem } from '../model/decor'
import type { Vec3 } from '../model/types'
import { activeBulges, activeCeilings, activeWalls, onStructure } from '../project/structure'
import { LAMPS, PLANTS, type Mount } from './catalog'
import { FURNITURE } from './furnitureCatalog'

export interface SurfaceHit {
  point: THREE.Vector3
  /** World-space face normal. */
  normal: THREE.Vector3
  kind: 'wall' | 'up' | 'down'
  host?: string
}

const tmpNormal = new THREE.Vector3()

/** Reads the surface under the pointer; null when the hit mesh is hidden (a faded wall). */
export function readHit(e: ThreeEvent<PointerEvent | MouseEvent>): SurfaceHit | null {
  return readIntersection(e)
}

/** Same as readHit, for any raycast intersection. */
export function readIntersection(i: Pick<THREE.Intersection, 'object' | 'face' | 'point'>): SurfaceHit | null {
  const obj = i.object as THREE.Mesh
  const mat = obj.material as THREE.Material | undefined
  if (!obj.visible || (mat && !Array.isArray(mat) && !mat.visible) || !i.face) return null
  tmpNormal.copy(i.face.normal).transformDirection(obj.matrixWorld)
  let host: string | undefined
  let decor = false
  for (let o: THREE.Object3D | null = obj; o; o = o.parent) {
    decor ||= !!o.userData.decorId
    if (o.userData.host) {
      host = o.userData.host as string
      break
    }
  }
  const kind = tmpNormal.y > 0.7 ? 'up' : tmpNormal.y < -0.7 ? 'down' : Math.abs(tmpNormal.y) < 0.3 ? 'wall' : null
  if (!kind) return null
  // The top of a wall-hung piece (a floating shelf, a rail table) is somewhere to
  // set things down, unlike the top of the wall it hangs on.
  if (kind === 'up' && decor) host = undefined
  return { point: i.point.clone(), normal: tmpNormal.clone(), kind, host }
}

/** Outward unit normal of a facing, in plan (x, z). */
export function facingVector(f: Facing): [number, number] {
  return f === 'x+' ? [1, 0] : f === 'x-' ? [-1, 0] : f === 'z+' ? [0, 1] : [0, -1]
}

export function facingOf(n: THREE.Vector3): Facing {
  if (Math.abs(n.x) >= Math.abs(n.z)) return n.x >= 0 ? 'x+' : 'x-'
  return n.z >= 0 ? 'z+' : 'z-'
}

export const facingRotation: Record<Facing, number> = {
  'z+': 0,
  'x+': Math.PI / 2,
  'z-': Math.PI,
  'x-': -Math.PI / 2,
}

/** Horizontal unit vector along the wall for a facing (the item's local +x). */
export function alongWall(f: Facing): [number, number] {
  const r = facingRotation[f]
  return [Math.cos(r), -Math.sin(r)]
}

export function ceilingAt(x: number, z: number): number {
  for (const c of activeCeilings()) {
    const [x0, z0, x1, z1] = c.rect
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return c.height
  }
  return 2.6
}

export function mountOf(item: DecorItem): Mount {
  if (item.kind === 'artwork') return 'wall'
  if (item.kind === 'plant') return PLANTS[item.species].mount
  if (item.kind === 'furniture') return FURNITURE[item.type].mount
  return LAMPS[item.type].mount
}

/** Small furniture that stands on counters, desks and shelves (mugs, a mixer, speakers). */
export function isTabletop(item: DecorItem): boolean {
  return item.kind === 'furniture' && FURNITURE[item.type].tabletop === true
}

/** Floor furniture: it slides along the floor under other decor and never climbs onto it. */
export function slidesOnFloor(item: DecorItem): boolean {
  return item.kind === 'furniture' && FURNITURE[item.type].mount === 'surface' && !isTabletop(item)
}

const round = (v: number) => Math.round(v * 100) / 100
/**
 * Heights are kept to the millimeter: a surface is where it is (a balcony floor
 * at 6 mm, a cooktop 6 mm over the counter), and rounding it to the centimeter
 * leaves things floating over it or sunk into it.
 */
export const roundY = (v: number) => Math.round(v * 1000) / 1000 + 0 // (no -0)
/** How close (m) to a piece's usual mounting height the pointer pulls it there. */
const MOUNT_PULL = 0.35
const vec = (p: THREE.Vector3): Vec3 => [round(p.x), roundY(p.y), round(p.z)]

/** The patch that moves `item` to the hit, or null if it cannot go there. */
export function placeAt(
  item: DecorItem,
  hit: SurfaceHit,
  opts: { free?: boolean; report?: { snap: SnapFace[] } } = {},
): Partial<DecorItem> | null {
  if (opts.report) opts.report.snap = []
  const mount = mountOf(item)
  if (mount === 'wall') {
    if (hit.kind !== 'wall') return null
    const at = [round(hit.point.x), round(hit.point.y), round(hit.point.z)] as Vec3
    // Wall furniture is anchored by its bottom edge; center it on the pointer.
    if (item.kind === 'furniture') {
      at[1] = round(Math.max(0, hit.point.y - item.size[1] / 2))
      // Pieces with a usual height (an AC unit) settle there when the pointer is near it.
      const usual = FURNITURE[item.type].mountHeight
      if (usual !== undefined && Math.abs(at[1] - usual) < MOUNT_PULL) at[1] = usual
    }
    return { at, facing: facingOf(hit.normal), host: hit.host } as Partial<DecorItem>
  }
  if (mount === 'surface') {
    // The top of a wall (a dollhouse stub, a column) is not somewhere to set things down.
    if (hit.kind !== 'up' || hit.host) return null
    if (item.kind === 'furniture' && !opts.free && SNAPS.has(item.type) && hit.point.y < 0.05) {
      const snapped = snapToWalls(hit.point.x, hit.point.z, item)
      if (snapped && opts.report) opts.report.snap = snapped.faces
      if (snapped)
        return { at: [snapped.x, roundY(hit.point.y), snapped.z], rotation: snapped.rotation } as Partial<FurnitureItem>
    }
    return { at: vec(hit.point) }
  }
  const p = hit.point
  return { at: [round(p.x), ceilingAt(p.x, p.z), round(p.z)] }
}

// ---------- wall snapping for floor furniture ----------

/** Pieces that belong against a wall. Tables, chairs and rugs stay free. */
const SNAPS = new Set<FurnitureItem['type']>([
  'platformBed',
  'murphyBed',
  'daybed',
  'sofa',
  'standingDesk',
  'bookshelf',
  'wardrobe',
  'sideboard',
  'blockShelf',
  'loftBed',
  'windowBench',
  'balconyBench',
  'planterWall',
  'fridge',
])
const SNAP_REACH = 0.45
const GAP = 0.004

/** A wall face a floor piece was snapped against, and the stretch of it the piece covers. */
export interface SnapFace {
  axis: 'x' | 'z'
  coord: number
  normal: 1 | -1
  /** Extent of the piece along the face. */
  from: number
  to: number
  height: number
}

interface Face {
  /** The face is the plane `axis = coord`. */
  axis: 'x' | 'z'
  coord: number
  /** Which way the face looks along its axis. */
  normal: 1 | -1
  /** Extent along the other horizontal axis. */
  min: number
  max: number
}

let faces: Face[] | null = null
// Walls taken out or put back: wall faces and solids are rebuilt from the active walls.
onStructure(() => {
  faces = null
  solids = null
})
function wallFaces(): Face[] {
  if (faces) return faces
  faces = []
  for (const w of activeWalls()) {
    const alongZ = Math.abs(w.a[0] - w.b[0]) < 1e-6
    const t = w.thickness / 2
    if (alongZ) {
      const [min, max] = [Math.min(w.a[1], w.b[1]), Math.max(w.a[1], w.b[1])]
      faces.push(
        { axis: 'x', coord: w.a[0] + t, normal: 1, min, max },
        { axis: 'x', coord: w.a[0] - t, normal: -1, min, max },
      )
    } else {
      const [min, max] = [Math.min(w.a[0], w.b[0]), Math.max(w.a[0], w.b[0])]
      faces.push(
        { axis: 'z', coord: w.a[1] + t, normal: 1, min, max },
        { axis: 'z', coord: w.a[1] - t, normal: -1, min, max },
      )
    }
  }
  return faces
}

/**
 * Backs the piece onto the nearest wall face within reach, turns it to face the
 * room, then slides it out of any perpendicular wall it would cut into.
 */
export function snapToWalls(
  x: number,
  z: number,
  item: FurnitureItem,
): { x: number; z: number; rotation: number; faces: SnapFace[] } | null {
  const [w, , d] = item.size
  let best: { face: Face; dist: number } | null = null
  for (const f of wallFaces()) {
    const along = f.axis === 'x' ? z : x
    if (along < f.min - 0.05 || along > f.max + 0.05) continue
    const dist = ((f.axis === 'x' ? x : z) - f.coord) * f.normal
    if (dist < -0.05 || dist > d / 2 + SNAP_REACH) continue
    if (!best || dist < best.dist) best = { face: f, dist }
  }
  if (!best) return null
  const f = best.face
  const off = f.coord + f.normal * (d / 2 + GAP)
  let nx = f.axis === 'x' ? off : x
  let nz = f.axis === 'z' ? off : z
  // Piece's local +z points along the face normal: rotation = atan2(nx, nz) in degrees.
  const rotation = f.axis === 'x' ? (f.normal === 1 ? 90 : 270) : f.normal === 1 ? 0 : 180

  // Perpendicular walls: keep the piece's sides clear of them (fits into corners).
  // Only faces the piece's center is in front of count, and only the nearest one on
  // each side: a face beyond a partition is hidden behind that partition's own face.
  const perp = f.axis === 'x' ? 'z' : 'x'
  const touched: { g: Face; fixed: number }[] = []
  const depthMin = Math.min(f.coord, off + f.normal * (d / 2))
  const depthMax = Math.max(f.coord, off + f.normal * (d / 2))
  const center = perp === 'x' ? nx : nz
  const nearest: Partial<Record<1 | -1, Face>> = {}
  for (const g of wallFaces()) {
    if (g.axis !== perp) continue
    // Must really share the piece's depth band, not just touch it within the gap.
    if (g.max <= depthMin + 0.01 || g.min >= depthMax - 0.01) continue
    if ((center - g.coord) * g.normal < 0) continue
    const cur = nearest[g.normal]
    if (!cur || (center - g.coord) * g.normal < (center - cur.coord) * cur.normal) nearest[g.normal] = g
  }
  let side: { g: Face; fixed: number; gap: number } | null = null
  for (const g of [nearest[1], nearest[-1]]) {
    if (!g) continue
    const gap = (center - g.coord) * g.normal - w / 2
    if (gap < -w / 2 || gap > 0.25) continue
    if (!side || gap < side.gap) side = { g, fixed: g.coord + g.normal * (w / 2 + GAP), gap }
  }
  if (side) {
    if (perp === 'x') nx = side.fixed
    else nz = side.fixed
    touched.push(side)
  }
  const h = item.size[1]
  const alongC = f.axis === 'x' ? nz : nx
  const snapFaces: SnapFace[] = [
    { axis: f.axis, coord: f.coord, normal: f.normal, from: alongC - w / 2, to: alongC + w / 2, height: h },
  ]
  for (const { g } of touched) {
    snapFaces.push({
      axis: g.axis,
      coord: g.coord,
      normal: g.normal,
      from: Math.min(f.coord, off + f.normal * (d / 2)),
      to: Math.max(f.coord, off + f.normal * (d / 2)),
      height: h,
    })
  }
  return { x: round(nx), z: round(nz), rotation, faces: snapFaces }
}

// ---------- footprints and overlap warnings ----------

/** A rectangle on the floor plan: center, half extents along the piece's own x and z, and its turn. */
export interface Footprint {
  cx: number
  cz: number
  hw: number
  hd: number
  /** Degrees around y, same convention as item.rotation. */
  rotation: number
}

/** Floor furniture that takes up floor area (rugs lie under things, so they are left out). */
export function isFloorPiece(item: DecorItem): item is FurnitureItem {
  return (
    item.kind === 'furniture' &&
    FURNITURE[item.type].mount === 'surface' &&
    item.type !== 'rug' &&
    item.at[1] < 0.3 &&
    item.at[1] > -1
  )
}

export function footprintOf(item: FurnitureItem): Footprint {
  return { cx: item.at[0], cz: item.at[2], hw: item.size[0] / 2, hd: item.size[2] / 2, rotation: item.rotation }
}

function corners(f: Footprint): [number, number][] {
  const r = THREE.MathUtils.degToRad(f.rotation)
  // Local +x -> (cos, -sin), local +z -> (sin, cos) in plan (x, z).
  const ux: [number, number] = [Math.cos(r), -Math.sin(r)]
  const uz: [number, number] = [Math.sin(r), Math.cos(r)]
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, b]) => [f.cx + ux[0] * f.hw * a + uz[0] * f.hd * b, f.cz + ux[1] * f.hw * a + uz[1] * f.hd * b])
}

/** Separating-axis test for two plan rectangles; touching (within `tol`) does not count. */
export function rectsOverlap(a: Footprint, b: Footprint, tol = 0.01): boolean {
  const ca = corners(a)
  const cb = corners(b)
  for (const poly of [ca, cb]) {
    for (let i = 0; i < 2; i++) {
      const [x0, z0] = poly[i]
      const [x1, z1] = poly[i + 1]
      const len = Math.hypot(x1 - x0, z1 - z0) || 1
      const ax = -(z1 - z0) / len
      const az = (x1 - x0) / len
      let amin = Infinity
      let amax = -Infinity
      let bmin = Infinity
      let bmax = -Infinity
      for (const [x, z] of ca) {
        const p = x * ax + z * az
        amin = Math.min(amin, p)
        amax = Math.max(amax, p)
      }
      for (const [x, z] of cb) {
        const p = x * ax + z * az
        bmin = Math.min(bmin, p)
        bmax = Math.max(bmax, p)
      }
      if (amax - tol <= bmin || bmax - tol <= amin) return false
    }
  }
  return true
}

let solids: Footprint[] | null = null
/** Walls (minus door-height openings at the floor) and floor-level columns as plan rectangles. */
function solidRects(): Footprint[] {
  if (solids) return solids
  solids = []
  for (const w of activeWalls()) {
    const dx = w.b[0] - w.a[0]
    const dz = w.b[1] - w.a[1]
    const len = Math.hypot(dx, dz)
    const ux = dx / len
    const uz = dz / len
    // Pieces of the wall between floor-level openings.
    const gaps = (w.openings ?? [])
      .filter((o) => (o.sill ?? 0) < 0.05 && o.height > 1.5)
      .map((o) => [o.offset, o.offset + o.width] as const)
    gaps.sort((p, q) => p[0] - q[0])
    let s = 0
    const spans: [number, number][] = []
    for (const [g0, g1] of gaps) {
      if (g0 > s) spans.push([s, g0])
      s = Math.max(s, g1)
    }
    if (s < len) spans.push([s, len])
    for (const [s0, s1] of spans) {
      const mid = (s0 + s1) / 2
      // rotation so that the rect's local x runs along the wall.
      const rotation = THREE.MathUtils.radToDeg(Math.atan2(-uz, ux))
      solids.push({ cx: w.a[0] + ux * mid, cz: w.a[1] + uz * mid, hw: (s1 - s0) / 2, hd: w.thickness / 2, rotation })
    }
  }
  for (const b of activeBulges()) {
    const sx = b.max[0] - b.min[0]
    const sz = b.max[2] - b.min[2]
    if (b.min[1] > 0.1 || Math.min(sx, sz) < 0.05) continue
    solids.push({ cx: (b.min[0] + b.max[0]) / 2, cz: (b.min[2] + b.max[2]) / 2, hw: sx / 2, hd: sz / 2, rotation: 0 })
  }
  return solids
}

export interface Collision {
  /** Other floor pieces this one overlaps. */
  overlaps: string[]
  /** The piece cuts into a wall or column. */
  wall: boolean
}

export function collisionsOf(item: DecorItem, items: DecorItem[]): Collision {
  if (!isFloorPiece(item)) return { overlaps: [], wall: false }
  const fp = footprintOf(item)
  const overlaps = items
    .filter((o) => o.id !== item.id && isFloorPiece(o) && rectsOverlap(fp, footprintOf(o)))
    .map((o) => o.id)
  const wall = solidRects().some((r) => rectsOverlap(fp, r, 0.015))
  return { overlaps, wall }
}
