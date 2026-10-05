import { invalidate, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { FurnitureItem } from '../../../model/decor'
import { useView } from '../../../store'
import { MATS, potMaterial } from '../plantMaterials'
import { buildPlant, seeded } from '../plantGeometry'
import { B, Rod } from './common'
import { mat } from './furnitureMaterials'
import { Mug } from './Decor'
import { GLAZES, glazeMaterial } from './glaze'

// Wall pieces: origin on the wall surface, y = bottom edge, +z out of the wall.

/** n evenly spaced positions from a to b. */
const spread = (n: number, a: number, b: number) =>
  Array.from({ length: n }, (_, i) => (n === 1 ? (a + b) / 2 : a + (i * (b - a)) / (n - 1)))

export function GridShelf({ item }: { item: FurnitureItem }) {
  const [w, h, d] = item.size
  const wood = mat(item.finish.body)
  const steel = mat(item.finish.metal, 'metal')
  const shelves = Math.max(2, Math.round(Number(item.options.shelves ?? 3)))
  const bar = 0.012
  const posts = w > 0.9 ? [-w / 2, 0, w / 2] : [-w / 2, w / 2]
  const r = seeded(item.id)
  return (
    <group>
      {posts.flatMap((x) =>
        [0.02, d - 0.01].map((z) => (
          <B
            key={`${x}${z}`}
            s={[bar, h, bar]}
            p={[x + (x < 0 ? bar / 2 : x > 0 ? -bar / 2 : 0), h / 2, z]}
            m={steel}
            edges={false}
          />
        )),
      )}
      {Array.from({ length: shelves }, (_, j) => {
        const y = (h - 0.03) * (j / (shelves - 1)) + 0.02
        return (
          <group key={j}>
            <B s={[w - bar * 2, 0.02, d - 0.02]} p={[0, y, d / 2]} m={wood} />
            <B s={[w, bar, bar]} p={[0, y - 0.016, d - 0.01]} m={steel} edges={false} />
            {/* a few jars and bowls on each shelf except the top */}
            {j < shelves - 1 &&
              Array.from({ length: 4 }, (_, k) => {
                const x = -w / 2 + 0.12 + (k + r() * 0.5) * ((w - 0.24) / 4)
                const tall = r() > 0.5
                return (
                  <mesh
                    key={k}
                    position={[x, y + 0.01 + (tall ? 0.08 : 0.03), d / 2]}
                    material={mat(['#f1efe9', '#3b3a37', '#c9b79a', '#9fb6c1'][Math.floor(r() * 4)], 'gloss')}
                    castShadow
                  >
                    <cylinderGeometry args={tall ? [0.04, 0.04, 0.16, 18] : [0.08, 0.05, 0.06, 20]} />
                  </mesh>
                )
              })}
          </group>
        )
      })}
    </group>
  )
}

function reededTexture(kind: string) {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = 'rgba(210,222,224,0.55)'
  g.fillRect(0, 0, 256, 256)
  if (kind === 'reeded') {
    for (let x = 0; x < 256; x += 8) {
      const grad = g.createLinearGradient(x, 0, x + 8, 0)
      grad.addColorStop(0, 'rgba(255,255,255,0.55)')
      grad.addColorStop(0.5, 'rgba(160,172,176,0.35)')
      grad.addColorStop(1, 'rgba(255,255,255,0.55)')
      g.fillStyle = grad
      g.fillRect(x, 0, 8, 256)
    }
  } else if (kind === 'wired') {
    g.strokeStyle = 'rgba(40,40,40,0.5)'
    g.lineWidth = 1.5
    const s = 22
    for (let y = 0; y < 256 + s; y += s * 0.87)
      for (let x = 0; x < 256 + s; x += s * 1.5) {
        const ox = (Math.round(y / (s * 0.87)) % 2) * s * 0.75
        g.beginPath()
        for (let k = 0; k <= 6; k++) {
          const a = (k / 6) * Math.PI * 2
          g.lineTo(x + ox + (Math.cos(a) * s) / 2, y + (Math.sin(a) * s) / 2)
        }
        g.stroke()
      }
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function UpperCabinets({ item }: { item: FurnitureItem }) {
  const [w, h, d] = item.size
  const body = mat(item.finish.body)
  const steel = mat(item.finish.metal, 'metal')
  const evening = useView((s) => s.lighting === 'evening')
  const glassKind = String(item.options.glass ?? 'reeded')
  const glass = useMemo(() => {
    const map = reededTexture(glassKind)
    map.repeat.set(1, 1)
    return new THREE.MeshStandardMaterial({
      map,
      transparent: true,
      roughness: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  }, [glassKind])
  useEffect(() => () => (glass.map?.dispose(), glass.dispose()), [glass])
  const n = Math.max(2, Math.round(w / 0.5))
  const dw = w / n
  const led = item.options.led !== false
  const ledMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#fff4e0', emissive: '#ffe2b8', emissiveIntensity: 2 }),
    [],
  )
  return (
    <group>
      {/* open box with wood shelves inside */}
      <B s={[w, h, 0.012]} p={[0, h / 2, 0.006]} m={body} />
      {[-1, 1].map((sx) => (
        <B key={sx} s={[0.018, h, d]} p={[sx * (w / 2 - 0.009), h / 2, d / 2]} m={body} />
      ))}
      {[0, h / 2, h].map((y, i) => (
        <B key={i} s={[w, 0.018, d]} p={[0, Math.min(h - 0.009, Math.max(0.009, y)), d / 2]} m={body} />
      ))}
      {/* top rail with rollers */}
      <B s={[w + 0.1, 0.02, 0.02]} p={[0, h + 0.04, d + 0.04]} m={steel} />
      {Array.from({ length: n }, (_, i) => {
        const cx = -w / 2 + dw * (i + 0.5) + (i % 2 ? -0.03 : 0.03)
        const z = d + 0.02 + (i % 2 ? 0.025 : 0)
        return (
          <group key={i} position={[cx, 0, z]}>
            {[-1, 1].map((sx) => (
              <mesh
                key={sx}
                position={[sx * (dw / 2 - 0.08), h + 0.04, 0.02]}
                rotation={[Math.PI / 2, 0, 0]}
                material={steel}
              >
                <cylinderGeometry args={[0.025, 0.025, 0.012, 20]} />
              </mesh>
            ))}
            <B s={[dw, 0.03, 0.02]} p={[0, h - 0.015, 0]} m={steel} edges={false} />
            <B s={[dw, 0.03, 0.02]} p={[0, 0.015, 0]} m={steel} edges={false} />
            <B s={[0.03, h, 0.02]} p={[-dw / 2 + 0.015, h / 2, 0]} m={steel} edges={false} />
            <B s={[0.03, h, 0.02]} p={[dw / 2 - 0.015, h / 2, 0]} m={steel} edges={false} />
            <mesh position={[0, h / 2, 0]} material={glass}>
              <planeGeometry args={[dw - 0.06, h - 0.06]} />
            </mesh>
          </group>
        )
      })}
      {led && (
        <group>
          <mesh position={[0, -0.004, d - 0.04]} material={ledMat}>
            <boxGeometry args={[w - 0.06, 0.006, 0.012]} />
          </mesh>
          {evening && (
            <pointLight position={[0, -0.12, d - 0.05]} intensity={1.2} distance={2.2} decay={2} color="#ffe2b8" />
          )}
        </group>
      )}
    </group>
  )
}

/** A few everyday things on a shelf: mugs, a jar, a stack of books, a small succulent. */
function ShelfItems({ w, d, y, seed }: { w: number; d: number; y: number; seed: string }) {
  const r = seeded(seed)
  const plant = useMemo(() => buildPlant('succulent', 'clay', seed), [seed])
  useEffect(() => () => plant.parts.forEach((p) => p.geometry.dispose()), [plant])
  const slots = Math.max(3, Math.floor((w - 0.06) / 0.11))
  const kinds = ['books', 'mug', 'mug', 'plant', 'jar', 'mug', 'books', 'jar']
  const start = Math.floor(r() * 3)
  const z = d * 0.45
  return (
    <group position={[0, y, 0]}>
      {Array.from({ length: slots }, (_, i) => {
        const x = -w / 2 + 0.06 + (i + 0.5) * ((w - 0.12) / slots)
        const kind = kinds[(start + i) % kinds.length]
        if (kind === 'mug') {
          const c = GLAZES[Math.floor(r() * GLAZES.length)]
          return <Mug key={i} p={[x, 0, z]} turn={r() * Math.PI * 2} glaze={glazeMaterial(c)} r={0.039} h={0.09} />
        }
        if (kind === 'jar')
          return (
            <group key={i} position={[x, 0, z]}>
              <mesh position={[0, 0.07, 0]} material={mat('#d9e1dc', 'gloss')} castShadow>
                <cylinderGeometry args={[0.04, 0.04, 0.14, 18]} />
              </mesh>
              <mesh position={[0, 0.148, 0]} material={mat('#b58a5a')}>
                <cylinderGeometry args={[0.041, 0.041, 0.018, 18]} />
              </mesh>
            </group>
          )
        if (kind === 'books')
          return (
            <group key={i} position={[x, 0, z]} rotation={[0, (r() - 0.5) * 0.3, 0]}>
              <B s={[0.1, 0.025, 0.15]} p={[0, 0.0125, 0]} m={mat('#2f4d6b', 'matte')} />
              <B s={[0.09, 0.02, 0.14]} p={[0.004, 0.035, 0]} m={mat('#e2d4b7', 'matte')} />
              <B s={[0.085, 0.018, 0.13]} p={[-0.004, 0.054, 0]} m={mat('#b34a3c', 'matte')} />
            </group>
          )
        return (
          <group key={i} position={[x, 0.003, z]}>
            {plant.parts.map((p) => (
              <mesh
                key={p.mat}
                geometry={p.geometry}
                material={p.mat === 'pot' ? potMaterial('clay') : MATS[p.mat]}
                castShadow
              />
            ))}
          </group>
        )
      })}
    </group>
  )
}

export function FloatingShelf({ item }: { item: FurnitureItem }) {
  const [w, h, d] = item.size
  const steel = mat(item.finish.metal, 'metal')
  return (
    <group>
      <B s={[w, h, d]} p={[0, h / 2, d / 2]} m={mat(item.finish.body)} />
      {item.options.items === true && <ShelfItems w={w} d={d} y={h} seed={item.id} />}
      {item.options.brackets !== false &&
        [-1, 1].map((sx) => (
          <group key={sx} position={[sx * (w / 2 - 0.12), 0, 0]}>
            <B s={[0.03, 0.14, 0.012]} p={[0, -0.07, 0.006]} m={steel} edges={false} />
            <B s={[0.03, 0.012, d * 0.8]} p={[0, -0.006, (d * 0.8) / 2]} m={steel} edges={false} />
          </group>
        ))}
    </group>
  )
}

/** Hooks with a few tools; shared by the wire grid and the hook rail. */
function Tools({ xs, y, m }: { xs: number[]; y: number; m: THREE.Material }) {
  return (
    <group>
      {xs.map((x, i) => {
        const kind = i % 4
        return (
          <group key={i} position={[x, y, 0.03]}>
            <mesh position={[0, -0.02, 0]} material={m}>
              <torusGeometry args={[0.012, 0.0025, 6, 16, Math.PI * 1.5]} />
            </mesh>
            {kind === 0 && (
              // Frying pan
              <group position={[0, -0.05, 0.02]}>
                <Rod a={[0, 0, 0]} b={[0, -0.18, 0]} radius={0.008} m={mat('#2a2a2a', 'matte')} />
                <mesh
                  position={[0, -0.3, 0]}
                  rotation={[Math.PI / 2, 0, 0]}
                  material={mat('#232323', 'matte')}
                  castShadow
                >
                  <cylinderGeometry args={[0.12, 0.1, 0.04, 28]} />
                </mesh>
              </group>
            )}
            {kind === 1 && <Rod a={[0, -0.04, 0.005]} b={[0, -0.3, 0.005]} radius={0.005} m={m} />}
            {kind === 2 && (
              <group>
                <Rod a={[0, -0.04, 0.005]} b={[0, -0.22, 0.005]} radius={0.006} m={mat('#3a3a3a', 'matte')} />
                <B s={[0.06, 0.08, 0.004]} p={[0, -0.26, 0.005]} m={mat('#3a3a3a', 'matte')} edges={false} />
              </group>
            )}
            {kind === 3 && (
              <group>
                <Rod a={[0, -0.04, 0.005]} b={[0, -0.2, 0.005]} radius={0.005} m={m} />
                <mesh position={[0, -0.24, 0.02]} material={m}>
                  <sphereGeometry args={[0.035, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
                </mesh>
              </group>
            )}
          </group>
        )
      })}
    </group>
  )
}

export function PegGrid({ item }: { item: FurnitureItem }) {
  const [w, h] = item.size
  const steel = mat(item.finish.metal, 'metal')
  const step = 0.075
  const cols = Math.round(w / step)
  const rows = Math.round(h / step)
  return (
    <group position={[0, 0, 0.012]}>
      {Array.from({ length: cols + 1 }, (_, i) => (
        <B key={`v${i}`} s={[0.004, h, 0.004]} p={[-w / 2 + (i * w) / cols, h / 2, 0]} m={steel} edges={false} />
      ))}
      {Array.from({ length: rows + 1 }, (_, j) => (
        <B key={`h${j}`} s={[w, 0.004, 0.004]} p={[0, (j * h) / rows, 0]} m={steel} edges={false} />
      ))}
      {item.options.utensils !== false && (
        <Tools
          xs={spread(Math.max(2, Math.floor(w / 0.18)), -w / 2 + 0.1, w / 2 - 0.1)}
          y={h - 0.1}
          m={mat('#c9ccce', 'metal')}
        />
      )}
    </group>
  )
}

export function KitchenRail({ item }: { item: FurnitureItem }) {
  const [w] = item.size
  const steel = mat(item.finish.metal, 'metal')
  if (item.options.variant === 'knives') {
    const n = Math.max(3, Math.floor(w / 0.06))
    const r = seeded(item.id)
    return (
      <group>
        <B s={[w, 0.045, 0.02]} p={[0, 0.0225, 0.01]} m={mat('#b58a5a')} />
        {Array.from({ length: n }, (_, i) => {
          const x = -w / 2 + 0.04 + i * ((w - 0.08) / (n - 1))
          const blade = 0.12 + r() * 0.12
          return (
            <group key={i} position={[x, 0.03, 0.024]}>
              <B
                s={[0.022 + r() * 0.02, blade, 0.002]}
                p={[0, blade / 2 - 0.02, 0]}
                m={mat('#d8dadc', 'metal')}
                edges={false}
              />
              <B
                s={[0.022, 0.1, 0.014]}
                p={[0, -0.07, 0]}
                m={mat(['#2f7d4c', '#233a8c', '#1d1d1d', '#d9cfb8'][i % 4], 'gloss')}
              />
            </group>
          )
        })}
      </group>
    )
  }
  return (
    <group>
      <Rod a={[-w / 2, 0.015, 0.035]} b={[w / 2, 0.015, 0.035]} radius={0.008} m={steel} />
      {[-1, 1].map((sx) => (
        <B key={sx} s={[0.02, 0.03, 0.035]} p={[sx * (w / 2 - 0.02), 0.015, 0.0175]} m={steel} edges={false} />
      ))}
      <Tools xs={spread(Math.max(2, Math.floor(w / 0.14)), -w / 2 + 0.06, w / 2 - 0.06)} y={0.01} m={steel} />
    </group>
  )
}

const FRUIT = ['#f0a431', '#8bbb3f', '#4a6b2a', '#e1c04a', '#b5823f', '#c9453a']

export function FruitBaskets({ item }: { item: FurnitureItem }) {
  const [w, h, d] = item.size
  const steel = mat(item.finish.metal, 'metal')
  const tiers = 3
  const r = seeded(item.id)
  const th = h / tiers
  return (
    <group>
      <B s={[w, h, 0.006]} p={[0, h / 2, 0.003]} m={steel} edges={false} />
      {Array.from({ length: tiers }, (_, j) => {
        const y = j * th
        const bh = th * 0.55
        return (
          <group key={j} position={[0, y, 0]}>
            <B s={[w, 0.006, d]} p={[0, 0.003, d / 2]} m={steel} edges={false} />
            {/* slanted front and sides drawn as open wire: rails only */}
            <Rod a={[-w / 2, bh, d]} b={[w / 2, bh, d]} radius={0.003} m={steel} />
            <Rod a={[-w / 2, 0, d]} b={[w / 2, 0, d]} radius={0.003} m={steel} />
            {Array.from({ length: 9 }, (_, i) => {
              const x = -w / 2 + (i * w) / 8
              return <Rod key={i} a={[x, 0, d]} b={[x, bh, d]} radius={0.002} m={steel} />
            })}
            {[-1, 1].map((sx) => (
              <Rod key={sx} a={[(sx * w) / 2, bh, d]} b={[(sx * w) / 2, bh * 1.4, 0.01]} radius={0.003} m={steel} />
            ))}
            {item.options.fruit !== false &&
              Array.from({ length: 7 }, (_, k) => {
                const fr = 0.03 + r() * 0.02
                return (
                  <mesh
                    key={k}
                    position={[-w / 2 + 0.05 + r() * (w - 0.1), fr + 0.006, 0.05 + r() * (d - 0.1)]}
                    material={mat(FRUIT[Math.floor(r() * FRUIT.length)], 'gloss')}
                    castShadow
                  >
                    <sphereGeometry args={[fr, 14, 10]} />
                  </mesh>
                )
              })}
          </group>
        )
      })}
    </group>
  )
}

function clockFaceTexture() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#efe6cf'
  g.fillRect(0, 0, 512, 256)
  g.fillStyle = '#111'
  g.font = 'bold 44px Arial, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  for (let h = 1; h <= 12; h++) {
    const a = (h / 12) * Math.PI * 2
    g.fillText(String(h), 256 + Math.sin(a) * 205, 128 - Math.cos(a) * 95)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Double-sided station clock sticking out of the wall, showing the real time. */
export function StationClock({ item }: { item: FurnitureItem }) {
  const [tx, h, len] = item.size
  const body = mat(item.finish.metal, 'matte')
  const face = useMemo(() => new THREE.MeshStandardMaterial({ map: clockFaceTexture(), roughness: 0.6 }), [])
  useEffect(() => () => (face.map?.dispose(), face.dispose()), [face])
  // Each face's hands, with the side they are on: both faces must run clockwise to their viewer.
  const hands = useRef<{ o: THREE.Object3D; sx: number; hour: boolean }[]>([])
  // The canvas renders on demand: wake it now and then so the hands keep moving.
  useEffect(() => {
    const id = setInterval(() => invalidate(), 20_000)
    return () => clearInterval(id)
  }, [])
  useFrame(() => {
    const now = new Date()
    const mins = now.getMinutes() + now.getSeconds() / 60
    const hrs = (now.getHours() % 12) + mins / 60
    for (const { o, sx, hour } of hands.current) o.rotation.x = -sx * (hour ? hrs / 12 : mins / 60) * Math.PI * 2
  })
  const cz = 0.04 + len / 2
  const cy = h / 2
  return (
    <group>
      <B s={[0.05, 0.1, 0.04]} p={[0, cy, 0.02]} m={body} />
      <B s={[tx, h, len]} p={[0, cy, cz]} m={body} />
      {[1, -1].map((sx) => (
        <group key={sx} position={[sx * (tx / 2 + 0.001), cy, cz]} rotation={[0, sx * (Math.PI / 2), 0]}>
          <mesh material={face}>
            <planeGeometry args={[len - 0.03, h - 0.03]} />
          </mesh>
          {/* hands pivot in the face plane: rotate around the face normal */}
          <group position={[0, 0, 0.004]} rotation={[0, -sx * (Math.PI / 2), 0]}>
            <group
              userData={{ noMerge: true }}
              ref={(el) =>
                void (el && !hands.current.some((x) => x.o === el) && hands.current.push({ o: el, sx, hour: true }))
              }
            >
              <B s={[0.003, 0.045, 0.008]} p={[0, 0.022, 0]} m={mat('#111', 'matte')} edges={false} />
            </group>
            <group
              userData={{ noMerge: true }}
              ref={(el) =>
                void (el && !hands.current.some((x) => x.o === el) && hands.current.push({ o: el, sx, hour: false }))
              }
            >
              <B s={[0.003, 0.065, 0.005]} p={[0, 0.032, 0]} m={mat('#111', 'matte')} edges={false} />
            </group>
          </group>
        </group>
      ))}
    </group>
  )
}

export function HangingRack({ item }: { item: FurnitureItem }) {
  const [w, drop, d] = item.size
  const steel = mat(item.finish.metal, 'metal')
  const y = -drop
  return (
    <group>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <Rod
            key={`${sx}${sz}`}
            a={[sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05)]}
            b={[sx * (w / 2 - 0.05), y, sz * (d / 2 - 0.05)]}
            radius={0.004}
            m={steel}
            segments={5}
          />
        )),
      )}
      {[-1, 1].map((sz) => (
        <B key={`x${sz}`} s={[w, 0.02, 0.02]} p={[0, y, (sz * d) / 2]} m={steel} />
      ))}
      {[-1, 1].map((sx) => (
        <B key={`z${sx}`} s={[0.02, 0.02, d]} p={[(sx * w) / 2, y, 0]} m={steel} />
      ))}
      {Array.from({ length: Math.round(w / 0.1) - 1 }, (_, i) => (
        <B key={`g${i}`} s={[0.004, 0.004, d]} p={[-w / 2 + (i + 1) * 0.1, y, 0]} m={steel} edges={false} />
      ))}
      {Array.from({ length: Math.round(d / 0.1) - 1 }, (_, i) => (
        <B key={`h${i}`} s={[w, 0.004, 0.004]} p={[0, y, -d / 2 + (i + 1) * 0.1]} m={steel} edges={false} />
      ))}
    </group>
  )
}
