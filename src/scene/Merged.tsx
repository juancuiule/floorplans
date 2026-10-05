import { invalidate, type ThreeElements } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Static batching: after each render, the meshes and outline segments under
 * this group are merged into one mesh per material (and one LineSegments per
 * edge material), baked in this group's local space. The originals stay in
 * the tree (React owns them) but are hidden and ignored by raycasting, so
 * pointer events land on the merged meshes, which keep the parent chain
 * (decorId, host) the handlers look for.
 *
 * Rules for children:
 * - Anything that moves on its own (useFrame) must be marked
 *   `userData={{ noMerge: true }}` or wrapped in its own nested <Merged>.
 * - Mesh changes must come from a render of this component's parent (the
 *   merge re-runs on every render of <Merged>, never in between).
 * Materials are shared with the originals, so fading them still works.
 */
export function Merged({ children, ...props }: ThreeElements['group']) {
  const ref = useRef<THREE.Group>(null)
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const undo = mergeStatic(root)
    invalidate()
    return undo
  })
  return (
    <group ref={ref} {...props} userData={{ ...props.userData, mergeRoot: true }}>
      {children}
    </group>
  )
}

const noRaycast = () => {}

interface Bucket {
  kind: 'mesh' | 'lines'
  material: THREE.Material
  castShadow: boolean
  receiveShadow: boolean
  renderOrder: number
  parts: { object: THREE.Mesh | THREE.LineSegments; matrix: THREE.Matrix4 }[]
}

function attributeKey(g: THREE.BufferGeometry): string {
  return (
    Object.keys(g.attributes)
      .sort()
      .map((n) => `${n}${g.attributes[n].itemSize}`)
      .join(',') + (g.index ? ':i' : ':n')
  )
}

function collect(node: THREE.Object3D, parent: THREE.Matrix4, root: THREE.Object3D, buckets: Map<string, Bucket>) {
  if (node !== root) {
    const u = node.userData
    if (u.noMerge || u.mergeRoot || u.mergedOutput || !node.visible) return
  }
  node.updateMatrix()
  const matrix = node === root ? new THREE.Matrix4() : parent.clone().multiply(node.matrix)
  const o = node as THREE.Mesh | THREE.LineSegments
  const geometry = o.geometry as THREE.BufferGeometry | undefined
  const material = o.material
  const mergeable =
    geometry?.attributes.position &&
    material &&
    !Array.isArray(material) &&
    !Object.keys(geometry.morphAttributes).length &&
    ((o as THREE.Mesh).isMesh
      ? !(o as THREE.InstancedMesh).isInstancedMesh && !(o as THREE.SkinnedMesh).isSkinnedMesh
      : (o as THREE.LineSegments).isLineSegments) &&
    // Mirrored transforms would flip the triangle winding.
    matrix.determinant() > 0
  if (mergeable) {
    const kind = (o as THREE.Mesh).isMesh ? 'mesh' : 'lines'
    const key = `${kind}|${material.uuid}|${o.castShadow}|${o.receiveShadow}|${o.renderOrder}|${attributeKey(geometry)}`
    let b = buckets.get(key)
    if (!b)
      buckets.set(
        key,
        (b = {
          kind,
          material,
          castShadow: o.castShadow,
          receiveShadow: o.receiveShadow,
          renderOrder: o.renderOrder,
          parts: [],
        }),
      )
    b.parts.push({ object: o, matrix })
  }
  for (const child of node.children) collect(child, matrix, root, buckets)
}

/** Merges the static content of `root`; returns a function that undoes it. */
function mergeStatic(root: THREE.Object3D): () => void {
  const buckets = new Map<string, Bucket>()
  collect(root, new THREE.Matrix4(), root, buckets)
  const outputs: THREE.Object3D[] = []
  const hidden: THREE.Object3D[] = []
  for (const b of buckets.values()) {
    if (b.parts.length < 2) continue
    const geometries = b.parts.map(({ object, matrix }) => {
      const g = new THREE.BufferGeometry()
      // applyMatrix4 transforms in place: work on copies of the attributes it touches.
      for (const [name, attr] of Object.entries(object.geometry.attributes))
        g.setAttribute(name, name === 'position' || name === 'normal' || name === 'tangent' ? attr.clone() : attr)
      if (object.geometry.index) g.setIndex(object.geometry.index)
      return g.applyMatrix4(matrix)
    })
    const merged = mergeGeometries(geometries, false)
    geometries.forEach((g) => g.dispose())
    if (!merged) continue
    merged.computeBoundingSphere()
    const out = b.kind === 'mesh' ? new THREE.Mesh(merged, b.material) : new THREE.LineSegments(merged, b.material)
    out.castShadow = b.castShadow
    out.receiveShadow = b.receiveShadow
    out.renderOrder = b.renderOrder
    out.userData.mergedOutput = true
    outputs.push(out)
    for (const { object } of b.parts) {
      object.visible = false
      object.raycast = noRaycast
      hidden.push(object)
    }
  }
  for (const out of outputs) root.add(out)
  return () => {
    for (const out of outputs) {
      root.remove(out)
      ;(out as THREE.Mesh).geometry.dispose()
    }
    for (const o of hidden) {
      o.visible = true
      delete (o as Partial<THREE.Mesh>).raycast
    }
  }
}
