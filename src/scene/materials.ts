import * as THREE from 'three'
import { DEFAULT_FINISHES, sameFinishes, type Finishes } from '../model/finishes'
import type { MaterialDef, Vec3 } from '../model/types'
import { project } from '../project'
import { finishDef, isFinishMaterial } from '../project/finishes'
import { patternFor } from './patterns'

export const EDGE_COLOR = '#5f5a52'

/** Real-world [u, v] extent of the largest face of a box, for pattern repeats. */
export function faceDims([sx, sy, sz]: Vec3): [number, number] {
  if (sy <= sx && sy <= sz) return [sx, sz]
  if (sx <= sz) return [sz, sy]
  return [sx, sy]
}

// ---------- finishes ----------
//
// Floors, wall paint and bathroom tiles come from the layout's finishes. Every
// material built for one of those ids is remembered with its surface size, so
// a finish change updates those materials in place (color, roughness, texture)
// instead of rebuilding meshes: same objects, same draw calls.

let finishes: Finishes = DEFAULT_FINISHES

interface Binding {
  id: string
  dims?: [number, number]
  origin: [number, number]
  /** The definition last applied, to skip materials a change does not touch. */
  key: string
}

const bound = new Map<THREE.MeshStandardMaterial, Binding>()
const listeners = new Set<(f: Finishes) => void>()

export const currentFinishes = () => finishes

/** Called after every finishes change (the hex blend overlay listens). */
export function onFinishes(fn: (f: Finishes) => void): () => void {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

type Def = MaterialDef & { hidden?: boolean }

function defOf(id: string): Def {
  if (isFinishMaterial(id)) return finishDef(id, finishes, project.materials)!
  return project.materials[id] ?? { color: '#ff00ff' }
}

/** The pattern texture for a surface: a clone of the shared one, repeated at true scale and offset to `origin` (meters). */
function mapOf(def: MaterialDef, dims: [number, number] | undefined, origin: [number, number]): THREE.Texture | null {
  const pattern = dims ? patternFor(def) : null
  if (!pattern || !dims) return null
  const map = pattern.texture.clone()
  map.repeat.set(dims[0] / pattern.size[0], dims[1] / pattern.size[1])
  map.offset.set(origin[0] / pattern.size[0], origin[1] / pattern.size[1])
  map.needsUpdate = true
  return map
}

/**
 * Applies new finishes to every material built for a finish id. Returns false
 * (and does nothing) when they did not change. Old textures are disposed; the
 * shared canvas stays cached for a quick switch back.
 */
export function setFinishes(next: Finishes): boolean {
  if (sameFinishes(next, finishes)) return false
  finishes = next
  for (const [m, b] of bound) {
    const def = defOf(b.id)
    const key = JSON.stringify(def)
    if (key === b.key) continue
    b.key = key
    const old = m.map
    const map = mapOf(def, b.dims, b.origin)
    // Adding or removing a map changes the shader; swapping one does not.
    if (!old !== !map) m.needsUpdate = true
    m.map = map
    m.color.set(map ? '#ffffff' : def.color)
    m.roughness = def.roughness ?? 0.8
    m.metalness = def.metalness ?? 0
    m.userData.hidden = !!def.hidden
    if (def.hidden) m.visible = false
    else if (m.opacity > 0.005) m.visible = true
    old?.dispose()
  }
  for (const fn of listeners) fn(finishes)
  return true
}

// ---------- materials ----------

/**
 * A fresh material. Pass the surface's real-world `dims` to get its pattern
 * (planks, tiles) repeated at true scale; without dims the plain color is used.
 * `origin` (meters) shifts the pattern, e.g. to line floors up across rooms.
 */
export function makeMaterial(
  id: string,
  dims?: [number, number],
  origin: [number, number] = [0, 0],
): THREE.MeshStandardMaterial {
  const def = defOf(id)
  const opacity = def.opacity ?? 1
  const map = mapOf(def, dims, origin)
  const m = new THREE.MeshStandardMaterial({
    map,
    color: map ? '#ffffff' : def.color,
    roughness: def.roughness ?? 0.8,
    metalness: def.metalness ?? 0,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
    side: opacity < 1 ? THREE.DoubleSide : THREE.FrontSide,
  })
  if (def.emissive) {
    m.emissive = new THREE.Color(def.emissive)
    m.emissiveIntensity = 1.2
  }
  m.userData.baseOpacity = opacity
  if (isFinishMaterial(id)) {
    bound.set(m, { id, dims, origin, key: JSON.stringify(def) })
    m.addEventListener('dispose', () => bound.delete(m))
    if (def.hidden) {
      m.userData.hidden = true
      m.visible = false
    }
  }
  return m
}

export function makeEdgeMaterial(opacity = 0.55): THREE.LineBasicMaterial {
  const m = new THREE.LineBasicMaterial({ color: EDGE_COLOR, transparent: true, opacity })
  m.userData.baseOpacity = opacity
  return m
}

const shared = new Map<string, THREE.MeshStandardMaterial>()

/** Cached material for things that never fade (fixtures, floors). */
export function sharedMaterial(id: string): THREE.MeshStandardMaterial {
  let m = shared.get(id)
  if (!m) {
    m = makeMaterial(id)
    shared.set(id, m)
  }
  return m
}

let sharedEdges: THREE.LineBasicMaterial | undefined
export function sharedEdgeMaterial(): THREE.LineBasicMaterial {
  sharedEdges ??= makeEdgeMaterial(0.45)
  return sharedEdges
}

/** Sets a fade factor (0–1) on materials that remember their base opacity. Hidden ones (an unused accent wall) stay hidden. */
export function applyFade(mats: Iterable<THREE.Material>, alpha: number) {
  for (const m of mats) {
    const base = (m.userData.baseOpacity as number | undefined) ?? 1
    const o = base * alpha
    const transparent = o < 0.999
    if (m.transparent !== transparent) {
      m.transparent = transparent
      m.needsUpdate = true
    }
    m.opacity = o
    m.depthWrite = !transparent
    m.visible = o > 0.005 && !m.userData.hidden
  }
}
