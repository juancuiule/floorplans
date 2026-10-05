import * as THREE from 'three'
import type { DecorItem } from '../model/decor'
import { editRefs } from './edit'
import { isTabletop, mountOf, roundY } from './placement'

// Where a surface item comes to rest: the highest surface under its footprint.
//
// The pointer picks the surface (a counter, a desk, a shelf), but the item
// itself lands where its center ends up after the grab offset, and a piece
// spans more than the one point under the pointer. So the height is read
// again straight under the piece: the highest up-facing face below it, looking
// past edge lines, hidden objects (the originals of merged meshes), editor
// helpers and the pieces being moved.

/** How far above the surface under the pointer a piece may step up (a cooktop, a tray's lip). */
export const REST_STEP = 0.05
/** Fraction of the half-extents where the footprint's corner samples sit. */
const CORNER = 0.8

export interface RestOpts {
  /** Decor to look past: the pieces being moved. */
  skipIds?: Set<string>
  /** Look past all decor (floor furniture slides under other pieces). */
  skipDecor?: boolean
}

/** Plan points to probe under an item: its center, and for furniture the corners of its footprint (inset). */
export function restPoints(item: DecorItem, x = item.at[0], z = item.at[2]): [number, number][] {
  const pts: [number, number][] = [[x, z]]
  if (item.kind !== 'furniture') return pts
  const hw = (item.size[0] / 2) * CORNER
  const hd = (item.size[2] / 2) * CORNER
  const r = THREE.MathUtils.degToRad(item.rotation)
  // Local +x -> (cos, -sin), local +z -> (sin, cos) in plan (x, z).
  const ux = [Math.cos(r), -Math.sin(r)]
  const uz = [Math.sin(r), Math.cos(r)]
  for (const [a, b] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ])
    pts.push([x + ux[0] * hw * a + uz[0] * hd * b, z + ux[1] * hw * a + uz[1] * hd * b])
  return pts
}

function decorIdOf(o: THREE.Object3D | null): string | null {
  for (; o; o = o.parent) if (o.userData.decorId) return o.userData.decorId as string
  return null
}

/** Architecture a piece cannot stand on: the top of a wall or a column (it has a host, and is not decor). */
function isWallTop(o: THREE.Object3D | null): boolean {
  for (; o; o = o.parent) {
    if (o.userData.decorId) return false
    if (o.userData.host) return true
  }
  return false
}

function drawn(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible || p.userData.editHelper) return false
  const m = (o as THREE.Mesh).material
  const mats = Array.isArray(m) ? m : m ? [m] : []
  // Shadow-only stand-ins (sun occluders) draw no color.
  return mats.length === 0 || mats.some((x) => x.visible && x.colorWrite !== false)
}

const rc = new THREE.Raycaster()
const origin = new THREE.Vector3()
const down = new THREE.Vector3(0, -1, 0)
const n = new THREE.Vector3()

/** Height of the first up-facing surface straight below (x, from, z), or null. */
export function surfaceBelow(
  root: THREE.Object3D,
  x: number,
  z: number,
  from: number,
  opts: RestOpts = {},
): number | null {
  rc.set(origin.set(x, from, z), down)
  rc.near = 0
  rc.far = from + 1
  for (const i of rc.intersectObject(root, true)) {
    const o = i.object
    if (!i.face || !(o as THREE.Mesh).isMesh || !drawn(o)) continue
    const id = decorIdOf(o)
    if (id && (opts.skipDecor || opts.skipIds?.has(id))) continue
    n.copy(i.face.normal).transformDirection(o.matrixWorld)
    // The underside of something (or a steep face): keep looking down.
    if (n.y < 0.7) continue
    if (isWallTop(o)) return null
    return i.point.y
  }
  return null
}

/**
 * Height an item comes to rest at around (x, z): the highest surface under its
 * footprint, no higher than `from`. Null when nothing is under it.
 */
export function restHeight(
  root: THREE.Object3D,
  item: DecorItem,
  x: number,
  z: number,
  from: number,
  opts: RestOpts = {},
): number | null {
  // World matrices are those of the last render (the pieces that moved since are skipped).
  let best: number | null = null
  for (const [px, pz] of restPoints(item, x, z)) {
    const y = surfaceBelow(root, px, pz, from, opts)
    if (y !== null && (best === null || y > best)) best = y
  }
  return best === null ? null : roundY(best)
}

/**
 * Settles surface items moved without the pointer (arrow keys, align, the rest
 * of a dragged selection) onto whatever is under their new spot. A set that
 * holds a piece others can stand on (a desk with its lamp) moves rigidly.
 */
export function settleMoved<T extends DecorItem>(moved: T[], root: THREE.Object3D | null = editRefs.sceneRoot): T[] {
  if (!root || moved.some((m) => m.kind === 'furniture' && !isTabletop(m))) return moved
  const skipIds = new Set(moved.map((m) => m.id))
  return moved.map((m) => {
    if (mountOf(m) !== 'surface' || m.at[1] < -1) return m
    const y = restHeight(root, m, m.at[0], m.at[2], m.at[1] + REST_STEP, { skipIds })
    return y === null || y === m.at[1] ? m : ({ ...m, at: [m.at[0], y, m.at[2]] } as T)
  })
}
