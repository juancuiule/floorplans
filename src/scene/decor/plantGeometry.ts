import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { COLLECTION_SPECIES } from '../../decor/catalog'
import type { PlantSpecies, PotStyle } from '../../model/decor'

// Procedural, stylized plants. Every species builds a handful of merged
// geometries (one per material) so a plant costs only a few draw calls.

export type PlantMat =
  | 'leaf'
  | 'leafDark'
  | 'leafLight'
  | 'leafSilver'
  | 'succulent'
  | 'jade'
  | 'variegated'
  | 'crotonRed'
  | 'crotonYellow'
  | 'stem'
  | 'trunk'
  | 'soil'
  | 'flower'
  | 'cactus'
  | 'pot'
  | 'saucer'
  | 'cord'

export interface PlantPart {
  mat: PlantMat
  geometry: THREE.BufferGeometry
}

export interface PlantModel {
  parts: PlantPart[]
  /** Approximate height, for the panel. */
  height: number
}

// ---------- helpers ----------

export function seeded(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

type Rand = () => number
const range = (r: Rand, a: number, b: number) => a + (b - a) * r()
const UP = new THREE.Vector3(0, 1, 0)

class Bucket {
  private map = new Map<PlantMat, THREE.BufferGeometry[]>()
  add(mat: PlantMat, g: THREE.BufferGeometry) {
    const list = this.map.get(mat) ?? []
    // Normalize attributes so everything merges.
    const clean = g.index ? g.toNonIndexed() : g
    if (!clean.getAttribute('uv'))
      clean.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(clean.getAttribute('position').count * 2), 2))
    list.push(clean)
    this.map.set(mat, list)
  }
  parts(): PlantPart[] {
    return [...this.map].map(([mat, list]) => ({ mat, geometry: mergeGeometries(list)! }))
  }
}

type LeafKind = 'oval' | 'lance' | 'heart' | 'split' | 'blade' | 'serrated'

/** A flat leaf pointing +y from its base at the origin, facing +z, bent by `curl`. */
function leaf(kind: LeafKind, len: number, wid: number, curl: number, fold = 0.25): THREE.BufferGeometry {
  const N = 14
  const right: THREE.Vector2[] = []
  for (let i = 0; i <= N; i++) {
    const t = i / N
    let r: number
    switch (kind) {
      case 'blade':
        r = (wid / 2) * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1)), 0.4) * (1 - t * 0.6)
        break
      case 'lance':
        r = (wid / 2) * Math.sin(Math.PI * t) * (1 - t * 0.3)
        break
      case 'heart':
      case 'split':
        r = (wid / 2) * Math.sin(Math.PI * Math.pow(t, 0.75)) * (1.05 - t * 0.35)
        if (kind === 'split' && i > 1 && i < N - 1 && i % 3 === 1) r *= 0.35
        break
      case 'serrated':
        r = (wid / 2) * Math.sin(Math.PI * t) * (i % 2 ? 0.55 : 1)
        break
      default:
        r = (wid / 2) * Math.sin(Math.PI * Math.pow(t, 0.9))
    }
    right.push(new THREE.Vector2(r, t * len))
  }
  const shape = new THREE.Shape()
  const baseNotch = kind === 'heart' || kind === 'split' ? len * 0.08 : 0
  shape.moveTo(0, baseNotch)
  for (const p of right) shape.lineTo(p.x, p.y)
  for (let i = right.length - 2; i >= 0; i--) shape.lineTo(-right[i].x, right[i].y)
  shape.lineTo(0, baseNotch)
  const g = new THREE.ShapeGeometry(shape, 2)
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const t = y / len
    // Bend toward +z along the length (droop when the leaf is pitched out) and fold along the midrib.
    pos.setZ(i, curl * len * t * t + fold * Math.abs(x))
  }
  g.computeVertexNormals()
  return g
}

/** Places a leaf so its length runs along `dir` and its face looks toward `faceHint`. */
function orient(g: THREE.BufferGeometry, origin: THREE.Vector3, dir: THREE.Vector3, faceHint: THREE.Vector3) {
  const y = dir.clone().normalize()
  let x = new THREE.Vector3().crossVectors(y, faceHint)
  if (x.lengthSq() < 1e-6) x = new THREE.Vector3().crossVectors(y, new THREE.Vector3(1, 0, 0))
  x.normalize()
  const z = new THREE.Vector3().crossVectors(x, y).normalize()
  const m = new THREE.Matrix4().makeBasis(x, y, z).setPosition(origin)
  return g.applyMatrix4(m)
}

/** A cylinder between two points. */
function rod(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1 = r0, seg = 6) {
  const len = a.distanceTo(b)
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, true)
  g.translate(0, len / 2, 0)
  const q = new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize())
  g.applyQuaternion(q)
  g.translate(a.x, a.y, a.z)
  return g
}

function tube(points: THREE.Vector3[], r: number, seg = 16) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), seg, r, 6, false)
}

/** Direction pitched `pitch` radians from vertical toward yaw `yaw`. */
function dirFrom(yaw: number, pitch: number) {
  return new THREE.Vector3(Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), Math.cos(yaw) * Math.sin(pitch))
}

// ---------- pots ----------

export interface PotSize {
  r: number
  h: number
}

export const POT_SIZES: Record<PlantSpecies, PotSize> = {
  monstera: { r: 0.17, h: 0.3 },
  fiddle: { r: 0.17, h: 0.32 },
  snake: { r: 0.12, h: 0.24 },
  palm: { r: 0.2, h: 0.34 },
  fern: { r: 0.15, h: 0.24 },
  olive: { r: 0.24, h: 0.4 },
  cactus: { r: 0.11, h: 0.18 },
  lavender: { r: 0.35, h: 0.22 },
  pothos: { r: 0.12, h: 0.14 },
  succulent: { r: 0.045, h: 0.042 },
  herbs: { r: 0.06, h: 0.055 },
  aloe: { r: 0.06, h: 0.055 },
  haworthia: { r: 0.04, h: 0.038 },
  jade: { r: 0.11, h: 0.11 },
  burro: { r: 0.06, h: 0.055 },
  rubber: { r: 0.17, h: 0.3 },
  croton: { r: 0.13, h: 0.2 },
  spider: { r: 0.11, h: 0.14 },
  collection: { r: 0.06, h: 0.055 },
  windowBox: { r: 0.3, h: 0.16 },
}

function pot(b: Bucket, style: PotStyle, { r, h }: PotSize, box = false) {
  if (box) {
    const g = new THREE.BoxGeometry(r * 2, h, 0.22)
    g.translate(0, h / 2, 0)
    b.add('pot', g)
    const soil = new THREE.BoxGeometry(r * 2 - 0.03, 0.01, 0.19)
    soil.translate(0, h - 0.02, 0)
    b.add('soil', soil)
    return
  }
  const profile: THREE.Vector2[] = []
  if (style === 'clay') {
    // The standard flower pot: straight taper, a rim band, on a matching saucer.
    profile.push(
      new THREE.Vector2(0, 0),
      new THREE.Vector2(r * 0.72, 0),
      new THREE.Vector2(r * 0.9, h * 0.8),
      new THREE.Vector2(r, h * 0.8),
      new THREE.Vector2(r, h),
      new THREE.Vector2(r * 0.9, h),
      new THREE.Vector2(r * 0.87, h * 0.88),
    )
    const saucer = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(r * 0.9, 0),
        new THREE.Vector2(r * 1.02, h * 0.14),
        new THREE.Vector2(r * 0.96, h * 0.14),
        new THREE.Vector2(r * 0.86, h * 0.03),
        new THREE.Vector2(0, h * 0.03),
      ],
      28,
    )
    saucer.translate(0, -h * 0.03, 0)
    b.add('saucer', saucer)
  } else if (style === 'terracotta') {
    profile.push(
      new THREE.Vector2(0, 0),
      new THREE.Vector2(r * 0.72, 0),
      new THREE.Vector2(r * 0.9, h * 0.8),
      new THREE.Vector2(r * 1.02, h * 0.8),
      new THREE.Vector2(r * 1.02, h),
      new THREE.Vector2(r * 0.9, h),
      new THREE.Vector2(r * 0.86, h * 0.86),
    )
  } else if (style === 'basket') {
    profile.push(
      new THREE.Vector2(0, 0),
      new THREE.Vector2(r * 0.85, 0),
      new THREE.Vector2(r, h * 0.92),
      new THREE.Vector2(r * 1.02, h),
      new THREE.Vector2(r * 0.95, h),
    )
  } else if (style === 'ceramic') {
    profile.push(
      new THREE.Vector2(0, 0),
      new THREE.Vector2(r * 0.7, 0),
      new THREE.Vector2(r * 0.98, h * 0.35),
      new THREE.Vector2(r, h * 0.75),
      new THREE.Vector2(r * 0.92, h),
      new THREE.Vector2(r * 0.86, h),
    )
  } else {
    profile.push(
      new THREE.Vector2(0, 0),
      new THREE.Vector2(r, 0),
      new THREE.Vector2(r, h),
      new THREE.Vector2(r * 0.9, h),
    )
  }
  b.add('pot', new THREE.LatheGeometry(profile, 28))
  const soil = new THREE.CircleGeometry(r * 0.88, 24)
  soil.rotateX(-Math.PI / 2)
  soil.translate(0, h - 0.025, 0)
  b.add('soil', soil)
}

// ---------- species ----------

export function buildPlant(
  species: PlantSpecies,
  potStyle: PotStyle,
  seed: string,
  opts: { count?: number; spread?: number } = {},
): PlantModel {
  const r = seeded(seed + species)
  const b = new Bucket()
  const ps = POT_SIZES[species]
  const soilY = ps.h - 0.025
  let height = 1

  switch (species) {
    case 'monstera': {
      pot(b, potStyle, ps)
      const count = 9
      for (let i = 0; i < count; i++) {
        const yaw = (i / count) * Math.PI * 2 + range(r, -0.3, 0.3)
        const pitch = range(r, 0.2, 0.75)
        const L = range(r, 0.35, 0.7)
        const base = new THREE.Vector3(range(r, -0.04, 0.04), soilY, range(r, -0.04, 0.04))
        const tip = base.clone().addScaledVector(dirFrom(yaw, pitch), L)
        b.add('stem', rod(base, tip, 0.009, 0.006))
        const out = dirFrom(yaw, Math.min(1.45, pitch + range(r, 0.6, 0.9)))
        const size = range(r, 0.26, 0.36)
        b.add(r() > 0.5 ? 'leafDark' : 'leaf', orient(leaf('split', size, size * 0.95, 0.25, 0.12), tip, out, UP))
      }
      height = 0.95
      break
    }

    case 'fiddle': {
      pot(b, potStyle, ps)
      const top = 1.25
      const lean = new THREE.Vector3(range(r, -0.05, 0.05), 0, range(r, -0.05, 0.05))
      const trunkTop = new THREE.Vector3(0, top, 0).add(lean)
      b.add('trunk', rod(new THREE.Vector3(0, soilY, 0), trunkTop, 0.022, 0.012, 8))
      const count = 24
      for (let i = 0; i < count; i++) {
        const t = 0.35 + (i / count) * 0.65
        const at = new THREE.Vector3(0, soilY, 0).lerp(trunkTop, t)
        const yaw = i * 2.4
        const pitch = range(r, 0.7, 1.25) - t * 0.3
        const size = range(r, 0.22, 0.3) * (1.1 - t * 0.3)
        b.add(
          r() > 0.4 ? 'leafDark' : 'leaf',
          orient(leaf('oval', size, size * 0.72, 0.15, 0.1), at, dirFrom(yaw, pitch), UP),
        )
      }
      height = 1.45
      break
    }

    case 'snake': {
      pot(b, potStyle, ps)
      const count = 13
      for (let i = 0; i < count; i++) {
        const yaw = range(r, 0, Math.PI * 2)
        const base = new THREE.Vector3(Math.sin(yaw) * range(r, 0, 0.07), soilY, Math.cos(yaw) * range(r, 0, 0.07))
        const L = range(r, 0.4, 0.75)
        const face = new THREE.Vector3(Math.sin(yaw + 1.5), 0, Math.cos(yaw + 1.5))
        b.add(
          r() > 0.35 ? 'leafDark' : 'leafLight',
          orient(leaf('blade', L, range(r, 0.05, 0.08), 0.04, 0.35), base, dirFrom(yaw, range(r, 0.03, 0.22)), face),
        )
      }
      height = 0.75
      break
    }

    case 'palm': {
      pot(b, potStyle, ps)
      const stems = 7
      for (let i = 0; i < stems; i++) {
        const yaw = (i / stems) * Math.PI * 2 + range(r, -0.3, 0.3)
        let pitch = range(r, 0.15, 0.45)
        const L = range(r, 0.8, 1.15)
        const steps = 12
        const pts: THREE.Vector3[] = [new THREE.Vector3(range(r, -0.03, 0.03), soilY, range(r, -0.03, 0.03))]
        const dirs: THREE.Vector3[] = []
        for (let s = 0; s < steps; s++) {
          const d = dirFrom(yaw, pitch)
          dirs.push(d)
          pts.push(pts[pts.length - 1].clone().addScaledVector(d, L / steps))
          pitch += 0.11
        }
        b.add('stem', tube(pts, 0.006, 20))
        const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
        for (let s = 3; s < steps; s++) {
          const scale = 1 - Math.abs(s - steps * 0.55) / steps
          for (const sgn of [1, -1]) {
            const dir = side
              .clone()
              .multiplyScalar(sgn)
              .addScaledVector(dirs[s], 0.5)
              .add(new THREE.Vector3(0, -0.35, 0))
            b.add('leaf', orient(leaf('lance', 0.22 * scale + 0.05, 0.028, 0.25, 0.3), pts[s], dir, UP))
          }
        }
      }
      height = 1.2
      break
    }

    case 'fern': {
      pot(b, potStyle, ps)
      const count = 24
      for (let i = 0; i < count; i++) {
        const yaw = range(r, 0, Math.PI * 2)
        const pitch = range(r, 0.35, 1.15)
        const base = new THREE.Vector3(range(r, -0.03, 0.03), soilY, range(r, -0.03, 0.03))
        b.add(
          r() > 0.5 ? 'leafLight' : 'leaf',
          orient(
            leaf('serrated', range(r, 0.38, 0.55), range(r, 0.09, 0.13), 0.55, 0.15),
            base,
            dirFrom(yaw, pitch),
            UP,
          ),
        )
      }
      height = 0.5
      break
    }

    case 'olive': {
      pot(b, potStyle, ps)
      const pts = [new THREE.Vector3(0, soilY, 0)]
      for (let i = 1; i <= 5; i++)
        pts.push(new THREE.Vector3(range(r, -0.05, 0.05), soilY + i * 0.2, range(r, -0.05, 0.05)))
      b.add('trunk', tube(pts, 0.03, 24))
      const crown = pts[pts.length - 1]
      const blobs = 10
      for (let i = 0; i < blobs; i++) {
        const yaw = range(r, 0, Math.PI * 2)
        const d = range(r, 0.08, 0.3)
        const c = crown.clone().add(new THREE.Vector3(Math.sin(yaw) * d, range(r, -0.05, 0.35), Math.cos(yaw) * d))
        b.add('trunk', rod(crown.clone().setY(crown.y - 0.15), c, 0.012, 0.006))
        const g = new THREE.IcosahedronGeometry(range(r, 0.12, 0.2), 1)
        g.scale(1, 0.75, 1)
        g.translate(c.x, c.y, c.z)
        b.add(r() > 0.35 ? 'leafSilver' : 'leaf', g)
      }
      height = 1.5
      break
    }

    case 'cactus': {
      pot(b, potStyle, ps)
      const body = new THREE.CapsuleGeometry(0.055, 0.42, 6, 12)
      body.translate(0, soilY + 0.26, 0)
      b.add('cactus', body)
      for (const [side, y, len] of [
        [1, 0.28, 0.16],
        [-1, 0.36, 0.12],
      ]) {
        const elbow = new THREE.CapsuleGeometry(0.035, 0.07, 4, 10)
        elbow.rotateZ(Math.PI / 2)
        elbow.translate(side * 0.08, soilY + y, 0)
        b.add('cactus', elbow)
        const arm = new THREE.CapsuleGeometry(0.035, len, 4, 10)
        arm.translate(side * 0.12, soilY + y + len / 2 + 0.02, 0)
        b.add('cactus', arm)
      }
      height = 0.62
      break
    }

    case 'lavender': {
      pot(b, potStyle, ps, true)
      for (let i = 0; i < 16; i++) {
        const g = new THREE.IcosahedronGeometry(range(r, 0.05, 0.08), 0)
        g.scale(1, 0.7, 1)
        g.translate(range(r, -0.3, 0.3), soilY + 0.04, range(r, -0.06, 0.06))
        b.add('leafSilver', g)
      }
      for (let i = 0; i < 70; i++) {
        const base = new THREE.Vector3(range(r, -0.31, 0.31), soilY, range(r, -0.07, 0.07))
        const tip = base.clone().addScaledVector(dirFrom(range(r, 0, 6.28), range(r, 0, 0.3)), range(r, 0.25, 0.42))
        b.add('stem', rod(base, tip, 0.003, 0.002, 4))
        const spike = new THREE.CapsuleGeometry(0.009, 0.06, 2, 5)
        spike.translate(tip.x, tip.y + 0.03, tip.z)
        b.add('flower', spike)
      }
      height = 0.6
      break
    }

    case 'succulent': {
      pot(b, potStyle, ps)
      // Echeveria: rings of fat leaves opening outward, tighter toward the center.
      const rings = [
        { n: 5, pitch: 0.35, len: 0.022 },
        { n: 8, pitch: 0.75, len: 0.032 },
        { n: 11, pitch: 1.15, len: 0.04 },
        { n: 13, pitch: 1.4, len: 0.042 },
      ]
      rings.forEach((ring, k) => {
        for (let i = 0; i < ring.n; i++) {
          const yaw = (i / ring.n) * Math.PI * 2 + k * 0.4
          const base = new THREE.Vector3(0, soilY + 0.008 - k * 0.002, 0)
          b.add(
            'succulent',
            orient(leaf('oval', ring.len, ring.len * 0.65, -0.25, 0.3), base, dirFrom(yaw, ring.pitch), UP),
          )
        }
      })
      height = 0.07
      break
    }

    case 'herbs': {
      pot(b, potStyle, ps)
      for (let i = 0; i < 7; i++) {
        const yaw = range(r, 0, Math.PI * 2)
        const base = new THREE.Vector3(Math.sin(yaw) * range(r, 0, 0.03), soilY, Math.cos(yaw) * range(r, 0, 0.03))
        const tip = base.clone().addScaledVector(dirFrom(yaw, range(r, 0.05, 0.35)), range(r, 0.1, 0.18))
        b.add('stem', rod(base, tip, 0.0025, 0.0018, 4))
        for (let k = 1; k <= 4; k++) {
          const at = base.clone().lerp(tip, k / 4)
          for (const side of [0, Math.PI]) {
            const a = yaw + side + k * 1.57
            b.add(
              'leafLight',
              orient(leaf('oval', range(r, 0.03, 0.045), 0.026, 0.2, 0.25), at, dirFrom(a, range(r, 0.9, 1.3)), UP),
            )
          }
        }
      }
      height = 0.25
      break
    }

    case 'aloe': {
      pot(b, potStyle, ps)
      for (let i = 0; i < 14; i++) {
        const yaw = (i / 14) * Math.PI * 2 + range(r, -0.2, 0.2)
        const base = new THREE.Vector3(0, soilY + 0.005, 0)
        const pitch = i % 2 ? range(r, 0.25, 0.5) : range(r, 0.6, 0.95)
        b.add('succulent', orient(leaf('lance', range(r, 0.12, 0.2), 0.035, 0.12, 0.45), base, dirFrom(yaw, pitch), UP))
      }
      height = 0.22
      break
    }

    case 'haworthia': {
      pot(b, potStyle, ps)
      for (let i = 0; i < 16; i++) {
        const yaw = i * 2.4
        const pitch = 0.15 + (i / 16) * 0.7
        b.add(
          'leafDark',
          orient(
            leaf('lance', 0.04 + (i / 16) * 0.02, 0.014, 0.1, 0.4),
            new THREE.Vector3(0, soilY + 0.004, 0),
            dirFrom(yaw, pitch),
            UP,
          ),
        )
      }
      height = 0.08
      break
    }

    case 'jade': {
      pot(b, potStyle, ps)
      const base = new THREE.Vector3(0, soilY, 0)
      for (let i = 0; i < 4; i++) {
        const yaw = (i / 4) * Math.PI * 2 + range(r, -0.4, 0.4)
        const mid = base.clone().addScaledVector(dirFrom(yaw, range(r, 0.15, 0.4)), range(r, 0.1, 0.16))
        b.add('trunk', rod(base, mid, 0.012, 0.009, 6))
        for (let k = 0; k < 3; k++) {
          const tip = mid
            .clone()
            .addScaledVector(dirFrom(yaw + range(r, -1, 1), range(r, 0.3, 0.9)), range(r, 0.07, 0.14))
          b.add('trunk', rod(mid, tip, 0.007, 0.004, 5))
          for (let l = 0; l < 6; l++) {
            const dir = dirFrom(range(r, 0, Math.PI * 2), range(r, 0.3, 1.2))
            const g = new THREE.SphereGeometry(1, 8, 6)
            g.scale(0.018, 0.006, 0.028)
            // Point the fat leaf along dir.
            g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir))
            const at = tip.clone().addScaledVector(dir, 0.022)
            g.translate(at.x, at.y, at.z)
            b.add('jade', g)
          }
        }
      }
      height = 0.4
      break
    }

    case 'burro': {
      pot(b, potStyle, ps)
      trailingStrands(b, r, ps.r, soilY, 9, [0.12, 0.35])
      height = 0.3
      break
    }

    case 'rubber': {
      pot(b, potStyle, ps)
      for (let s = 0; s < 2; s++) {
        const top = new THREE.Vector3(range(r, -0.08, 0.08), range(r, 0.8, 1.05), range(r, -0.08, 0.08))
        const base = new THREE.Vector3(range(r, -0.03, 0.03), soilY, range(r, -0.03, 0.03))
        b.add('trunk', rod(base, top, 0.012, 0.008, 6))
        for (let i = 0; i < 9; i++) {
          const t = 0.3 + (i / 9) * 0.7
          const at = base.clone().lerp(top, t)
          const size = range(r, 0.2, 0.28)
          b.add(
            i % 3 === 0 ? 'variegated' : 'leafDark',
            orient(leaf('oval', size, size * 0.5, 0.12, 0.08), at, dirFrom(i * 2.3 + s, range(r, 0.8, 1.2)), UP),
          )
        }
      }
      height = 1.05
      break
    }

    case 'croton': {
      pot(b, potStyle, ps)
      for (let i = 0; i < 22; i++) {
        const yaw = range(r, 0, Math.PI * 2)
        const base = new THREE.Vector3(range(r, -0.03, 0.03), soilY + range(r, 0, 0.18), range(r, -0.03, 0.03))
        const mat: PlantMat = r() > 0.55 ? 'crotonRed' : r() > 0.4 ? 'crotonYellow' : 'leafDark'
        b.add(
          mat,
          orient(
            leaf('lance', range(r, 0.16, 0.24), range(r, 0.05, 0.07), 0.2, 0.15),
            base,
            dirFrom(yaw, range(r, 0.4, 1.2)),
            UP,
          ),
        )
      }
      b.add('trunk', rod(new THREE.Vector3(0, soilY, 0), new THREE.Vector3(0, soilY + 0.2, 0), 0.008, 0.005, 5))
      height = 0.5
      break
    }

    case 'spider': {
      pot(b, potStyle, ps)
      for (let i = 0; i < 28; i++) {
        const yaw = range(r, 0, Math.PI * 2)
        b.add(
          i % 3 ? 'leafLight' : 'variegated',
          orient(
            leaf('blade', range(r, 0.25, 0.4), 0.018, 0.9, 0.2),
            new THREE.Vector3(0, soilY, 0),
            dirFrom(yaw, range(r, 0.3, 0.9)),
            UP,
          ),
        )
      }
      height = 0.35
      break
    }

    case 'collection': {
      // A strip of small clay pots, front row first, then a second row behind.
      const width = opts.spread ?? 0.8
      const count = opts.count ?? 8
      let x = -width / 2
      let z = 0
      for (let i = 0; i < count; i++) {
        const pick = COLLECTION_SPECIES[Math.floor(r() * COLLECTION_SPECIES.length)]
        const d = pick.sizes[Math.floor(r() * pick.sizes.length)]
        if (x + d > width / 2) {
          x = -width / 2 + 0.04
          z -= 0.13
        }
        const sub = buildPlant(pick.species, 'clay', `${seed}-${i}`)
        const f = d / 2 / POT_SIZES[pick.species].r
        for (const part of sub.parts) {
          const g = part.geometry.clone()
          g.rotateY(r() * Math.PI * 2)
          g.scale(f, f, f)
          g.translate(x + d / 2, 0, z)
          b.add(part.mat, g)
          part.geometry.dispose()
        }
        x += d + 0.012
      }
      height = 0.2
      break
    }

    case 'windowBox': {
      // Wall planter: origin on the wall, centered vertically, box sticking out along +z.
      const inner = new Bucket()
      pot(inner, potStyle, ps, true)
      const top = ps.h - 0.02
      for (let i = 0; i < 7; i++) {
        const sub = buildPlant(i % 2 ? 'succulent' : 'haworthia', 'clay', `${seed}-${i}`)
        for (const part of sub.parts) {
          if (part.mat === 'pot' || part.mat === 'saucer' || part.mat === 'soil') continue
          const g = part.geometry.clone().scale(1.4, 1.4, 1.4)
          g.translate(-ps.r + 0.06 + i * ((ps.r * 2 - 0.12) / 6), top - 0.05, range(r, -0.05, 0.03))
          inner.add(part.mat, g)
        }
      }
      // Burro's tail spilling over the front edge.
      for (let i = 0; i < 10; i++) {
        const x = -ps.r + 0.04 + i * ((ps.r * 2 - 0.08) / 9)
        beadStrand(
          inner,
          r,
          new THREE.Vector3(x, top, 0.1),
          new THREE.Vector3(range(r, -0.1, 0.1), 0, 1),
          range(r, 0.2, 0.55),
        )
      }
      for (const part of inner.parts()) {
        part.geometry.translate(0, -ps.h / 2, 0.12)
        b.add(part.mat, part.geometry)
      }
      // Two steel brackets under the box.
      for (const sx of [-1, 1]) {
        const g = new THREE.BoxGeometry(0.02, 0.012, 0.22)
        g.translate(sx * (ps.r - 0.08), -ps.h / 2 - 0.006, 0.11)
        b.add('cord', g)
      }
      height = 0.6
      break
    }

    case 'pothos': {
      // Local origin is the ceiling hook; everything hangs below it.
      const drop = 0.62
      const potY = -drop - ps.h
      const potParts = new Bucket()
      pot(potParts, potStyle, ps)
      for (const part of potParts.parts()) {
        part.geometry.translate(0, potY, 0)
        b.add(part.mat, part.geometry)
      }
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2
        b.add(
          'cord',
          rod(
            new THREE.Vector3(Math.sin(a) * ps.r * 0.95, potY + ps.h, Math.cos(a) * ps.r * 0.95),
            new THREE.Vector3(0, 0, 0),
            0.003,
            0.003,
            4,
          ),
        )
      }
      const vines = 8
      for (let i = 0; i < vines; i++) {
        const a = (i / vines) * Math.PI * 2 + range(r, -0.2, 0.2)
        const L = range(r, 0.35, 0.95)
        const start = new THREE.Vector3(Math.sin(a) * ps.r * 0.8, potY + ps.h, Math.cos(a) * ps.r * 0.8)
        const out = new THREE.Vector3(Math.sin(a), 0, Math.cos(a))
        const pts: THREE.Vector3[] = []
        for (let s = 0; s <= 10; s++) {
          const t = s / 10
          // Spill over the rim first, then fall mostly straight down.
          const spread = 0.1 * Math.sin(Math.min(1, t * 3) * Math.PI * 0.5) + 0.03 * t
          pts.push(
            start
              .clone()
              .addScaledVector(out, spread)
              .add(new THREE.Vector3(0, -L * Math.pow(t, 1.4) - 0.02, 0)),
          )
        }
        b.add('stem', tube(pts, 0.003, 14))
        for (let s = 1; s <= 10; s++) {
          const p = pts[s]
          const dir = out
            .clone()
            .multiplyScalar(range(r, -0.2, 1))
            .add(new THREE.Vector3(range(r, -0.6, 0.6), range(r, -0.6, 0.2), range(r, -0.6, 0.6)))
          b.add(
            r() > 0.5 ? 'leafLight' : 'leaf',
            orient(leaf('heart', range(r, 0.06, 0.09), 0.06, 0.2, 0.15), p, dir, out),
          )
        }
      }
      height = 1.4
      break
    }
  }

  return { parts: b.parts(), height }
}

/** A strand of fat bead leaves falling from `start`, first outward along `out`, then down. */
function beadStrand(b: Bucket, r: Rand, start: THREE.Vector3, out: THREE.Vector3, length: number) {
  const dir = out.clone().setY(0).normalize()
  const steps = Math.round(length / 0.012)
  for (let s = 0; s < steps; s++) {
    const t = s / steps
    const p = start
      .clone()
      .addScaledVector(dir, 0.05 * Math.sin(Math.min(1, t * 4) * Math.PI * 0.5))
      .add(new THREE.Vector3(0, -length * t, 0))
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + s * 0.9
      const g = new THREE.IcosahedronGeometry(0.0075, 0)
      g.scale(1, 1.5, 1)
      g.translate(p.x + Math.cos(a) * 0.008, p.y, p.z + Math.sin(a) * 0.008)
      b.add('succulent', g)
    }
  }
  void r
}

/** Burro's tail strands spilling over the rim of a round pot. */
function trailingStrands(
  b: Bucket,
  r: Rand,
  potR: number,
  soilY: number,
  count: number,
  [minL, maxL]: [number, number],
) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + range(r, -0.2, 0.2)
    const out = new THREE.Vector3(Math.sin(a), 0, Math.cos(a))
    const start = new THREE.Vector3(Math.sin(a) * potR * 0.7, soilY + 0.03, Math.cos(a) * potR * 0.7)
    beadStrand(b, r, start, out, range(r, minL, maxL))
  }
}
