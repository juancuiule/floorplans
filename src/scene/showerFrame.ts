import * as THREE from 'three'
import type { Bulge, SceneObject, Vec3 } from '../model/types'

/** Where the tiled walls around a tray are, in the tray's frame. */
export interface ShowerFrame {
  /** Open side (the tray's −x edge). */
  x0: number
  /** Tile face of the back wall. */
  back: number
  /** Tile faces (or the tray's edges where there is no wall) on either side. */
  z0: number
  z1: number
  /** Which sides have a tiled wall. */
  wallZ0: boolean
  wallZ1: boolean
  /** Top of the tray. */
  top: number
}

/** A tile within this far inside a tray edge (or just beyond it) lines that edge. */
const EDGE_REACH = 0.05

/**
 * The tray's frame from the plan: each tile bulge is taken into the tray's local
 * frame (it may be turned), and the nearest tile face lining each edge is where
 * that wall's fittings mount.
 */
export function showerFrame(tray: SceneObject, bulges: Bulge[]): ShowerFrame {
  const [w, h, d] = tray.size ?? [0.75, 0.06, 0.7]
  const toLocal = new THREE.Matrix4()
    .compose(
      new THREE.Vector3(...tray.position),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(tray.rotation ?? 0)),
      new THREE.Vector3(1, 1, 1),
    )
    .invert()
  const tiles = bulges
    .filter((b) => b.material === 'tile')
    .map((b) => new THREE.Box3(new THREE.Vector3(...b.min), new THREE.Vector3(...b.max)).applyMatrix4(toLocal))
    // Only tiles standing over the tray's height band.
    .filter((b) => b.min.y < h + 1 && b.max.y > h + 0.5)
  const overlaps = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > 0.1
  let back: number | null = null
  let z0: number | null = null
  let z1: number | null = null
  for (const b of tiles) {
    if (overlaps(b.min.z, b.max.z, -d / 2, d / 2) && b.min.x > w / 2 - EDGE_REACH && b.min.x < w / 2 + 0.001)
      back = Math.min(back ?? Infinity, b.min.x)
    if (overlaps(b.min.x, b.max.x, -w / 2, w / 2)) {
      if (b.max.z < -d / 2 + EDGE_REACH && b.max.z > -d / 2 - 0.001) z0 = Math.max(z0 ?? -Infinity, b.max.z)
      if (b.min.z > d / 2 - EDGE_REACH && b.min.z < d / 2 + 0.001) z1 = Math.min(z1 ?? Infinity, b.min.z)
    }
  }
  return {
    x0: -w / 2,
    back: back ?? w / 2,
    z0: z0 ?? -d / 2,
    z1: z1 ?? d / 2,
    wallZ0: z0 !== null,
    wallZ1: z1 !== null,
    top: h,
  }
}

/** Radius, thickness and height (top) of the corner shelf. */
export const SHELF = { r: 0.2, t: 0.012, top: 1.3 }
/** Keeps the shelf's cut faces a hair off the tiles (no z-fighting). */
const SHELF_GAP = 0.0005

/**
 * The corner shelf: a quarter disc with its two straight edges on the back and
 * side tiles, curving out into the shower (toward −x and away from the side
 * wall). It goes in the z0 corner when that side is tiled, else the z1 one.
 */
export function cornerShelf(f: ShowerFrame): {
  geometry: THREE.CylinderGeometry
  position: Vec3
  side: 1 | -1
  cornerZ: number
} {
  const side = f.wallZ0 || !f.wallZ1 ? 1 : -1
  const cornerZ = side === 1 ? f.z0 : f.z1
  // Cylinder vertices sit at (r·sin θ, r·cos θ): θ in [3π/2, 2π] is the x ≤ 0, z ≥ 0 quarter, [π, 3π/2] the x ≤ 0, z ≤ 0 one.
  const geometry = new THREE.CylinderGeometry(
    SHELF.r,
    SHELF.r,
    SHELF.t,
    24,
    1,
    false,
    side === 1 ? (3 * Math.PI) / 2 : Math.PI,
    Math.PI / 2,
  )
  return {
    geometry,
    position: [f.back - SHELF_GAP, SHELF.top - SHELF.t / 2, cornerZ + side * SHELF_GAP],
    side,
    cornerZ,
  }
}
