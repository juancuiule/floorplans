import * as THREE from 'three'

const cache = new Map<string, THREE.MeshStandardMaterial>()

/** One cached material per color + finish, shared by every piece. */
export function mat(
  color: string,
  kind: 'wood' | 'metal' | 'fabric' | 'gloss' | 'matte' = 'wood',
): THREE.MeshStandardMaterial {
  const key = `${color}|${kind}`
  let m = cache.get(key)
  if (!m) {
    const props: Record<typeof kind, THREE.MeshStandardMaterialParameters> = {
      wood: { roughness: 0.7 },
      metal: { roughness: 0.4, metalness: 0.6 },
      fabric: { roughness: 0.95 },
      gloss: { roughness: 0.2 },
      matte: { roughness: 0.85 },
    }
    m = new THREE.MeshStandardMaterial({ color, ...props[kind] })
    cache.set(key, m)
  }
  return m
}

/** Clear plastic or glass: see-through and glossy. Not cached, so share the result. */
export const transparent = (color: string, opacity: number) =>
  new THREE.MeshStandardMaterial({ color, transparent: true, opacity, roughness: 0.1, depthWrite: false })
