import { useEffect, useMemo, useRef } from 'react'
import { plan } from '../project/plan'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { wallFrame, wallPieces } from '../geometry/walls'
import { project } from '../project'
import { shadowOnly } from './shadows'

// The building around the unit, for the sun only. Dollhouse mode cuts away
// the walls facing the camera and hides the ceilings when you look from
// above, which would let the sun in through the roof and the side walls.
// These shadow-only casters keep direct light to the one real opening, the
// balcony door, whatever the view.

const SLAB = 0.25
/** The party walls run out to the balcony's edge (assumed: typical for Buenos Aires balconies). */
const BALCONY_SIDE_WALLS = true

function buildGeometry(): THREE.BufferGeometry {
  const { walls, ceilings, rooms } = project.shell
  const parts: THREE.BufferGeometry[] = []
  const box = (size: [number, number, number], at: [number, number, number], rotY = 0) => {
    const g = new THREE.BoxGeometry(...size)
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(rotY).setPosition(...at))
    parts.push(g)
  }

  for (const w of walls) {
    if (w.kind !== 'exterior') continue
    const f = wallFrame(w)
    for (const p of wallPieces(w, 0)) {
      const s = (p.s0 + p.s1) / 2
      box(
        [p.s1 - p.s0, p.y1 - p.y0, w.thickness],
        [f.origin[0] + f.u[0] * s, (p.y0 + p.y1) / 2, f.origin[1] + f.u[1] * s],
        f.rotY,
      )
    }
  }

  // One slab over everything, balcony included (the unit above has one too).
  let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const r of [...rooms.map((r) => r.rect), ...ceilings.map((c) => c.rect)]) {
    x0 = Math.min(x0, r[0])
    z0 = Math.min(z0, r[1])
    x1 = Math.max(x1, r[2])
    z1 = Math.max(z1, r[3])
  }
  for (const w of walls) {
    for (const [x, z] of [w.a, w.b]) {
      x0 = Math.min(x0, x - w.thickness / 2)
      z0 = Math.min(z0, z - w.thickness / 2)
      x1 = Math.max(x1, x + w.thickness / 2)
      z1 = Math.max(z1, z + w.thickness / 2)
    }
  }
  const top = Math.max(...ceilings.map((c) => c.height), ...walls.map((w) => w.height))
  box([x1 - x0, SLAB, z1 - z0], [(x0 + x1) / 2, top + 0.02 + SLAB / 2, (z0 + z1) / 2])

  if (BALCONY_SIDE_WALLS) {
    const balcony = rooms.find((r) => r.id === 'balcony')
    const facade = walls.find((w) => plan.walls.roles?.[w.id] === 'facade')
    if (balcony && facade) {
      const start = facade.a[0] + facade.thickness / 2
      const len = balcony.rect[2] - start
      for (const side of walls.filter((w) => plan.walls.roles?.[w.id] === 'party')) {
        box([len, side.height, side.thickness], [start + len / 2, side.height / 2, side.a[1]])
      }
    }
  }

  const merged = mergeGeometries(parts)!
  parts.forEach((g) => g.dispose())
  return merged
}

export function SunOccluders() {
  const ref = useRef<THREE.Mesh>(null)
  const geometry = useMemo(() => buildGeometry(), [])
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide }),
    [],
  )
  useEffect(() => {
    const mesh = ref.current!
    shadowOnly.add(mesh)
    return () => {
      shadowOnly.delete(mesh)
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])
  return <mesh ref={ref} geometry={geometry} material={material} castShadow visible={false} frustumCulled={false} />
}
