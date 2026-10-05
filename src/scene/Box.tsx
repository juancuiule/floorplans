import { useMemo } from 'react'
import * as THREE from 'three'
import type { Vec3 } from '../model/types'

interface BoxProps {
  size: Vec3
  position?: Vec3
  rotation?: Vec3
  material: THREE.Material
  edgeMaterial?: THREE.Material
  castShadow?: boolean
  receiveShadow?: boolean
  userData?: Record<string, unknown>
}

/** A box mesh with crisp outline edges: the basic building block of the model. */
export function Box({
  size,
  position,
  rotation,
  material,
  edgeMaterial,
  castShadow = true,
  receiveShadow = true,
  userData,
}: BoxProps) {
  const [w, h, d] = size
  const geometry = useMemo(() => new THREE.BoxGeometry(w, h, d), [w, h, d])
  const edges = useMemo(() => (edgeMaterial ? new THREE.EdgesGeometry(geometry) : null), [geometry, edgeMaterial])
  return (
    <group position={position} rotation={rotation} userData={userData}>
      <mesh geometry={geometry} material={material} castShadow={castShadow} receiveShadow={receiveShadow} />
      {edges && edgeMaterial && <lineSegments geometry={edges} material={edgeMaterial} />}
    </group>
  )
}
