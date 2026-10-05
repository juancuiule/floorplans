import { useEffect, useMemo } from 'react'
import type { PlantItem } from '../../model/decor'
import { buildPlant, POT_SIZES } from './plantGeometry'
import { MATS, potMaterial } from './plantMaterials'

/** A potted (or hanging) plant in local space, base at the origin. */
export function Plant({ item }: { item: PlantItem }) {
  // A standard clay pot size scales the whole plant so the pot has that diameter.
  const clay = item.potSize !== undefined && item.potSize !== 'auto'
  const pot = clay ? 'clay' : item.pot
  const fit = clay ? Number(item.potSize) / 200 / POT_SIZES[item.species].r : 1
  const seed = item.seed ?? item.id
  const model = useMemo(
    () => buildPlant(item.species, pot, seed, { count: item.count, spread: item.spread }),
    [item.species, pot, seed, item.count, item.spread],
  )
  useEffect(() => () => model.parts.forEach((p) => p.geometry.dispose()), [model])
  return (
    <group scale={item.scale * fit}>
      {model.parts.map((p) => (
        <mesh
          key={p.mat}
          geometry={p.geometry}
          material={p.mat === 'pot' ? potMaterial(pot) : MATS[p.mat]}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  )
}
