import { invalidate, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { FurnitureItem } from '../../../model/decor'
import { requestShadowUpdate } from '../../shadows'
import { Merged } from '../../Merged'
import { B, Rod } from './common'
import { mat } from './furnitureMaterials'

export function Sofa({ item }: { item: FurnitureItem }) {
  const [w, h, d] = item.size
  const fabric = mat(item.finish.fabric, 'fabric')
  const legs = mat(item.finish.metal, 'metal')
  const legH = 0.12
  const arm = 0.12
  const baseH = 0.16
  const seats = w > 1.8 ? 3 : 2
  const seatW = (w - 2 * arm) / seats
  const seatY = legH + baseH
  return (
    <group>
      {[
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ].map(([sx, sz]) => (
        <Rod
          key={`${sx}${sz}`}
          a={[sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06)]}
          b={[sx * (w / 2 - 0.06), legH, sz * (d / 2 - 0.06)]}
          radius={0.012}
          m={legs}
        />
      ))}
      <B s={[w, baseH, d]} p={[0, legH + baseH / 2, 0]} m={fabric} />
      {[-1, 1].map((sx) => (
        <B key={sx} s={[arm, 0.36, d]} p={[sx * (w / 2 - arm / 2), seatY + 0.18 - 0.1, 0]} m={fabric} />
      ))}
      <B s={[w - 2 * arm, h - seatY + 0.04, 0.16]} p={[0, seatY + (h - seatY) / 2 - 0.04, -d / 2 + 0.08]} m={fabric} />
      {Array.from({ length: seats }, (_, i) => {
        const x = -w / 2 + arm + seatW * (i + 0.5)
        return (
          <group key={i}>
            <B s={[seatW - 0.01, 0.14, d - 0.2]} p={[x, seatY + 0.07, 0.07]} m={fabric} />
            <B s={[seatW - 0.03, 0.4, 0.14]} p={[x, seatY + 0.34, -d / 2 + 0.24]} r={[-0.16, 0, 0]} m={fabric} />
          </group>
        )
      })}
    </group>
  )
}

export function Chair({
  body,
  metal,
  position,
  rotation = 0,
}: {
  body: string
  metal: string
  position?: [number, number, number]
  rotation?: number
}) {
  const wood = mat(body)
  const steel = mat(metal, 'metal')
  const seatY = 0.45
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {[
        [-1, 1],
        [1, 1],
      ].map(([sx]) => (
        <Rod key={`f${sx}`} a={[sx * 0.2, 0, 0.21]} b={[sx * 0.18, seatY, 0.17]} radius={0.009} m={steel} />
      ))}
      {[-1, 1].map((sx) => (
        <Rod key={`b${sx}`} a={[sx * 0.2, 0, -0.22]} b={[sx * 0.18, 0.8, -0.2]} radius={0.009} m={steel} />
      ))}
      <B s={[0.44, 0.014, 0.42]} p={[0, seatY + 0.007, 0]} m={wood} />
      <B s={[0.42, 0.2, 0.014]} p={[0, 0.7, -0.205]} r={[-0.12, 0, 0]} m={wood} />
    </group>
  )
}

export function ChairItem({ item }: { item: FurnitureItem }) {
  return <Chair body={item.finish.body} metal={item.finish.metal} />
}

/** The BKF (Bonet, Kurchan, Ferrari-Hardoy, Buenos Aires 1938): steel rod frame, leather sling. */
export function ButterflyChair({ item }: { item: FurnitureItem }) {
  const steel = mat(item.finish.metal, 'metal')
  const sling = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: item.finish.fabric, roughness: 0.7, side: THREE.DoubleSide })
    return m
  }, [item.finish.fabric])
  const slingGeo = useMemo(() => {
    // u across (-1..1), v front (0) to back (1); the sling pockets low in the middle.
    const U = 16
    const V = 24
    const g = new THREE.PlaneGeometry(1, 1, U, V)
    const pos = g.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) * 2
      const v = pos.getY(i) + 0.5
      const halfW = 0.36 - 0.1 * Math.sin(Math.PI * v)
      const sag = 0.4 * Math.pow(Math.sin(Math.PI * Math.min(1, v * 1.15)), 1.3) * (1 - 0.35 * u * u)
      const y = 0.46 + (0.9 - 0.46) * v - sag
      const z = 0.36 - 0.72 * v + 0.08 * Math.sin(Math.PI * v)
      pos.setXYZ(i, u * halfW, y, z)
    }
    g.computeVertexNormals()
    return g
  }, [])
  const frames = useMemo(
    () =>
      [-1, 1].map((sx) => {
        const pts = [
          [0.35, 0, 0.36],
          [0.38, 0.46, 0.37],
          [0.3, 0.06, 0.0],
          [0.38, 0.9, -0.37],
          [0.34, 0, -0.34],
        ].map(([x, y, z]) => new THREE.Vector3(sx * x, y, z))
        return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.2)
      }),
    [],
  )
  return (
    <group>
      {frames.map((c, i) => (
        <mesh key={i} material={steel} castShadow>
          <tubeGeometry args={[c, 48, 0.008, 8, false]} />
        </mesh>
      ))}
      <mesh geometry={slingGeo} material={sling} castShadow receiveShadow />
    </group>
  )
}

/** Motorized sit/stand desk: the top glides to item.size[1] when it changes. */
export function StandingDesk({ item }: { item: FurnitureItem }) {
  const [w, target, d] = item.size
  const top = mat(item.finish.body)
  const steel = mat(item.finish.metal, 'metal')
  const brass = mat('#b8963e', 'metal')
  const lift = useRef<THREE.Group>(null)
  const uppers = useRef<(THREE.Group | null)[]>([])
  const current = useRef(target)
  const topT = 0.025
  const baseCol = 0.62

  useFrame((_, dt) => {
    const diff = target - current.current
    if (Math.abs(diff) < 0.0005) return
    // Real desks travel ~4 cm/s; this is faster so it is fun to watch.
    // dt is capped: with on-demand rendering the first frame after idling can be seconds long.
    current.current += Math.sign(diff) * Math.min(Math.abs(diff), 0.3 * Math.min(dt, 1 / 30))
    if (lift.current) lift.current.position.y = current.current - target
    const stretch = Math.max(0.05, (current.current - baseCol - topT) / (target - baseCol - topT || 1))
    for (const u of uppers.current) if (u) u.scale.y = stretch
    requestShadowUpdate(1)
    invalidate()
  })

  const legX = w / 2 - 0.12
  const upperLen = Math.max(0.05, target - baseCol - topT)
  return (
    <group>
      {[-1, 1].map((sx, i) => (
        <group key={sx}>
          <B s={[0.07, 0.03, d - 0.06]} p={[sx * legX, 0.015, 0]} m={steel} />
          <B s={[0.08, baseCol - 0.03, 0.06]} p={[sx * legX, 0.03 + (baseCol - 0.03) / 2, 0]} m={steel} />
          <group
            ref={(el) => void (uppers.current[i] = el)}
            position={[sx * legX, baseCol, 0]}
            userData={{ noMerge: true }}
          >
            <B s={[0.065, upperLen, 0.05]} p={[0, upperLen / 2, 0]} m={steel} />
          </group>
        </group>
      ))}
      <group ref={lift}>
        <Merged>
          <B s={[w - 0.3, 0.04, 0.05]} p={[0, target - topT - 0.02, 0]} m={steel} />
          <B s={[w, topT, d]} p={[0, target - topT / 2, 0]} m={top} />
          {/* up/down control under the front edge */}
          <B s={[0.1, 0.02, 0.05]} p={[w / 2 - 0.16, target - topT - 0.01, d / 2 - 0.04]} m={mat('#2a2a2a', 'matte')} />
          {item.options.monitor !== false && (
            <group position={[0, target, 0]}>
              <B s={[0.8, 0.003, 0.33]} p={[0, 0.0015, 0.09]} m={mat('#1e1f21', 'matte')} edges={false} />
              <B s={[0.36, 0.018, 0.12]} p={[0, 0.012, 0.12]} m={mat('#3a3b3e', 'matte')} />
              <B s={[0.06, 0.02, 0.1]} p={[0.3, 0.012, 0.12]} m={mat('#2a2b2e', 'matte')} />
            </group>
          )}
          {item.options.riser !== false && (
            <group position={[0, target, -d / 2 + 0.16]}>
              {[-1, 1].flatMap((sx) =>
                [-1, 1].map((sz) => (
                  <Rod
                    key={`${sx}${sz}`}
                    a={[sx * (w * 0.36 - 0.03), 0, sz * 0.09]}
                    b={[sx * (w * 0.36 - 0.03), 0.1, sz * 0.09]}
                    radius={0.01}
                    m={brass}
                  />
                )),
              )}
              <B s={[w * 0.76, 0.022, 0.24]} p={[0, 0.111, 0]} m={top} />
            </group>
          )}
          {item.options.monitor !== false && (
            <group position={[0, target + (item.options.riser !== false ? 0.122 : 0), -d / 2 + 0.16]}>
              <B s={[0.28, 0.01, 0.2]} p={[0, 0.005, 0]} m={mat('#b9bbbe', 'metal')} />
              <B s={[0.04, 0.16, 0.02]} p={[0, 0.08, -0.03]} m={mat('#b9bbbe', 'metal')} />
              <Screen />
            </group>
          )}
        </Merged>
      </group>
    </group>
  )
}

// We look at the inside of an open cylinder, so the screen must be double-sided.
const screenMaterial = new THREE.MeshStandardMaterial({
  color: '#141518',
  roughness: 0.2,
  emissive: '#1a2a3f',
  emissiveIntensity: 0.35,
  side: THREE.DoubleSide,
})
const bezelMaterial = new THREE.MeshStandardMaterial({ color: '#2a2b2e', roughness: 0.5, side: THREE.DoubleSide })

/** Curved 34" ultrawide: a thin shell with a dark glass front. */
function Screen() {
  const { glass, back } = useMemo(
    () => ({
      glass: new THREE.CylinderGeometry(1.5, 1.5, 0.34, 32, 1, true, Math.PI - 0.265, 0.53),
      back: new THREE.CylinderGeometry(1.52, 1.52, 0.36, 32, 1, true, Math.PI - 0.27, 0.54),
    }),
    [],
  )
  return (
    <group position={[0, 0.3, 1.46]}>
      <mesh geometry={back} material={bezelMaterial} castShadow />
      <mesh geometry={glass} material={screenMaterial} />
    </group>
  )
}

export function DiningTable({ item }: { item: FurnitureItem }) {
  const [w, h, d] = item.size
  const top = mat(item.finish.body)
  const steel = mat(item.finish.metal, 'metal')
  const round = item.options.shape === 'round'
  const chairs = Number(item.options.chairs ?? 0)
  const topT = 0.03
  const seats: [number, number, number][] = []
  if (round) {
    for (let i = 0; i < chairs; i++) {
      const a = (i / chairs) * Math.PI * 2
      const r = w / 2 + 0.12
      seats.push([Math.sin(a) * r, Math.cos(a) * r, a + Math.PI])
    }
  } else if (chairs === 2) {
    seats.push([0, d / 2 + 0.14, Math.PI], [0, -d / 2 - 0.14, 0])
  } else if (chairs === 4) {
    for (const sx of [-1, 1]) seats.push([sx * w * 0.25, d / 2 + 0.14, Math.PI], [sx * w * 0.25, -d / 2 - 0.14, 0])
  }
  return (
    <group>
      {round ? (
        <group>
          <mesh position={[0, h - topT / 2, 0]} material={top} castShadow receiveShadow>
            <cylinderGeometry args={[w / 2, w / 2, topT, 48]} />
          </mesh>
          <Rod a={[0, 0, 0]} b={[0, h - topT, 0]} radius={0.035} m={steel} />
          <mesh position={[0, 0.01, 0]} material={steel} castShadow>
            <cylinderGeometry args={[0.22, 0.24, 0.02, 32]} />
          </mesh>
        </group>
      ) : (
        <group>
          <B s={[w, topT, d]} p={[0, h - topT / 2, 0]} m={top} />
          {[-1, 1].flatMap((sx) =>
            [-1, 1].map((sz) => (
              <B
                key={`${sx}${sz}`}
                s={[0.025, h - topT, 0.025]}
                p={[sx * (w / 2 - 0.05), (h - topT) / 2, sz * (d / 2 - 0.05)]}
                m={steel}
              />
            )),
          )}
          {[-1, 1].map((sz) => (
            <B key={sz} s={[w - 0.1, 0.04, 0.02]} p={[0, h - topT - 0.02, sz * (d / 2 - 0.05)]} m={steel} />
          ))}
        </group>
      )}
      {seats.map(([x, z, rot], i) => (
        // Chairs face the table: local +z of the chair points at the center.
        <Chair key={i} body={item.finish.body} metal={item.finish.metal} position={[x, 0, z]} rotation={rot} />
      ))}
    </group>
  )
}
