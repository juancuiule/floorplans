import { useMemo } from 'react'
import * as THREE from 'three'
import type { Vec3 } from '../../../model/types'
import { Box } from '../../Box'
import { sharedEdgeMaterial } from '../../materials'
import { seeded } from '../plantGeometry'
import { pillowGeometry } from './softGeometry'
import { mat } from './furnitureMaterials'

// Shared building blocks for the furniture models.

/** Plywood / panel thickness. */
export const T = 0.018

interface BProps {
  s: Vec3
  p: Vec3
  m: THREE.Material
  r?: Vec3
  edges?: boolean
  shadow?: boolean
}

/** An outlined box: size, position, material. */
export function B({ s, p, m, r, edges = true, shadow = true }: BProps) {
  return (
    <Box
      size={s}
      position={p}
      rotation={r}
      material={m}
      edgeMaterial={edges ? sharedEdgeMaterial() : undefined}
      castShadow={shadow}
    />
  )
}

/** A cylinder between two points (legs, rods, rails). */
export function Rod({
  a,
  b,
  radius,
  m,
  segments = 10,
}: {
  a: Vec3
  b: Vec3
  radius: number
  m: THREE.Material
  segments?: number
}) {
  const { position, quaternion, length } = useMemo(() => {
    const va = new THREE.Vector3(...a)
    const vb = new THREE.Vector3(...b)
    const dir = vb.clone().sub(va)
    return {
      length: dir.length(),
      position: va.clone().add(vb).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()),
    }
  }, [a, b])
  return (
    <mesh position={position} quaternion={quaternion} material={m} castShadow>
      <cylinderGeometry args={[radius, radius, length, segments]} />
    </mesh>
  )
}

const BOOK_COLORS = [
  '#b34a3c',
  '#e2d4b7',
  '#2f4d6b',
  '#d7a13a',
  '#3f6b4f',
  '#f1ede4',
  '#6b3d57',
  '#1f2326',
  '#c97b4a',
  '#8aa3b8',
  '#e8e2d3',
  '#5a4632',
]

/**
 * A row of books filling a cell of the given size, standing on y = 0 and
 * centered on x, spines toward +z. Merged into one geometry with vertex colors.
 */
function booksGeometry(w: number, h: number, d: number, seed: string): THREE.BufferGeometry | null {
  const r = seeded(seed)
  const parts: THREE.BufferGeometry[] = []
  let x = -w / 2 + 0.01
  const end = w / 2 - 0.01 - (r() > 0.5 ? w * 0.3 : 0.02)
  while (x < end) {
    const bw = 0.015 + r() * 0.03
    if (x + bw > end) break
    const bh = Math.min(h - 0.02, h * (0.62 + r() * 0.33))
    const bd = Math.min(d - 0.02, 0.15 + r() * 0.08)
    const g = new THREE.BoxGeometry(bw, bh, bd).toNonIndexed()
    g.translate(x + bw / 2, bh / 2, d / 2 - bd / 2 - 0.01)
    const c = new THREE.Color(BOOK_COLORS[Math.floor(r() * BOOK_COLORS.length)])
    const colors = new Float32Array(g.getAttribute('position').count * 3)
    for (let i = 0; i < colors.length; i += 3) c.toArray(colors, i)
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    parts.push(g)
    x += bw + (r() > 0.9 ? 0.02 : 0.001)
  }
  if (!parts.length) return null
  const out = mergeBoxes(parts)
  parts.forEach((p) => p.dispose())
  return out
}

function mergeBoxes(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const total = parts.reduce((n, p) => n + p.getAttribute('position').count, 0)
  const out = new THREE.BufferGeometry()
  for (const name of ['position', 'normal', 'color'] as const) {
    const arr = new Float32Array(total * 3)
    let o = 0
    for (const p of parts) {
      const a = p.getAttribute(name).array as Float32Array
      arr.set(a, o)
      o += a.length
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3))
  }
  return out
}

const bookMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })

export function Books({ w, h, d, seed, p }: { w: number; h: number; d: number; seed: string; p: Vec3 }) {
  const geometry = useMemo(() => booksGeometry(w, h, d, seed), [w, h, d, seed])
  if (!geometry) return null
  return <mesh geometry={geometry} material={bookMaterial} position={p} castShadow receiveShadow />
}

/** A soft pillow (see pillowGeometry): position, rotation, material. */
export function Pillow({ s, p, r, m }: { s: Vec3; p: Vec3; r?: Vec3; m: THREE.Material }) {
  return (
    <mesh geometry={pillowGeometry(s[0], s[1], s[2])} position={p} rotation={r} material={m} castShadow receiveShadow />
  )
}

/** Dark oval finger-pull cut into a door. */
export function FingerHole({ p, vertical = true }: { p: Vec3; vertical?: boolean }) {
  return (
    <mesh
      position={p}
      rotation={[Math.PI / 2, 0, 0]}
      scale={vertical ? [1, 1, 2.2] : [2.2, 1, 1]}
      material={mat('#1b1714', 'matte')}
    >
      <cylinderGeometry args={[0.012, 0.012, 0.004, 16]} />
    </mesh>
  )
}
