import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Upholstery geometry: pillows and cushions with smooth, rounded edges.

const softCache = new Map<string, THREE.BufferGeometry>()

/** Smooth normals across a box's face seams; keeps a (flat) uv so it batches with plain boxes. */
function smoothed(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.deleteAttribute('normal')
  g.deleteAttribute('uv')
  const out = mergeVertices(g, 1e-4)
  g.dispose()
  out.clearGroups()
  out.computeVertexNormals()
  out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(out.getAttribute('position').count * 2), 2))
  return out
}

/**
 * A plump pillow, w × h, t thick in the middle and thinning to a seam at the
 * edges, with slightly pinched corners. Centered on the origin, faces ±z.
 * Cached per size (shared, never disposed: a handful of sizes).
 */
export function pillowGeometry(w: number, h: number, t: number): THREE.BufferGeometry {
  const key = `p${w.toFixed(3)}|${h.toFixed(3)}|${t.toFixed(3)}`
  let g = softCache.get(key)
  if (g) return g
  const box = new THREE.BoxGeometry(1, 1, 1, 14, 14, 2)
  const pos = box.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) * 2
    const v = pos.getY(i) * 2
    const puff = Math.pow(Math.max(0, (1 - u * u) * (1 - v * v)), 0.45)
    pos.setXYZ(
      i,
      pos.getX(i) * (1 - 0.07 * v * v) * w,
      pos.getY(i) * (1 - 0.07 * u * u) * h,
      pos.getZ(i) * t * Math.max(0.12, puff),
    )
  }
  g = smoothed(box)
  softCache.set(key, g)
  return g
}

/**
 * An upholstered slab: w × h × d with rounded corners in plan and a soft
 * rounded edge, bottom on y = 0, centered on x and z. Cached per size.
 */
export function cushionGeometry(w: number, h: number, d: number, radius = 0.05): THREE.BufferGeometry {
  const key = `c${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${radius.toFixed(3)}`
  let g = softCache.get(key)
  if (g) return g
  const bevel = Math.min(h * 0.4, 0.02)
  const hw = w / 2 - bevel
  const hd = d / 2 - bevel
  const r = Math.max(0.001, Math.min(radius, hw, hd))
  const s = new THREE.Shape()
  s.moveTo(-hw + r, -hd)
  s.lineTo(hw - r, -hd)
  s.absarc(hw - r, -hd + r, r, -Math.PI / 2, 0, false)
  s.lineTo(hw, hd - r)
  s.absarc(hw - r, hd - r, r, 0, Math.PI / 2, false)
  s.lineTo(-hw + r, hd)
  s.absarc(-hw + r, hd - r, r, Math.PI / 2, Math.PI, false)
  s.lineTo(-hw, -hd + r)
  s.absarc(-hw + r, -hd + r, r, Math.PI, Math.PI * 1.5, false)
  const e = new THREE.ExtrudeGeometry(s, {
    depth: h - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 8,
  })
  // Shape in XY, extruded along z: lay it flat with the extrusion going up.
  e.rotateX(-Math.PI / 2)
  e.translate(0, bevel, 0)
  g = smoothed(e)
  softCache.set(key, g)
  return g
}
