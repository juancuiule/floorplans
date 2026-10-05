import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { LAMPS, warmthColor } from '../../decor/catalog'
import { isPendant, pendantDrop } from '../../decor/pendant'
import { useDecor } from '../../decor/store'
import type { LampItem } from '../../model/decor'
import { useView } from '../../store'
import { Merged } from '../Merged'

const metal = new THREE.MeshStandardMaterial({ color: '#b9bbbd', roughness: 0.3, metalness: 0.8 })
const wood = new THREE.MeshStandardMaterial({ color: '#b08557', roughness: 0.7 })
const marble = new THREE.MeshStandardMaterial({ color: '#e9e7e2', roughness: 0.3 })
const cable = new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.8 })

const ARC_CURVE = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0.04, 0),
  new THREE.Vector3(0, 1.2, 0),
  new THREE.Vector3(0.18, 1.82, 0),
  new THREE.Vector3(0.75, 2.02, 0),
  new THREE.Vector3(1.22, 1.9, 0),
])

function useLampMaterials(item: LampItem) {
  // Shades glow brighter as the daylight fades (0.1 steps, so few re-renders).
  const dusk = useView((s) => s.dusk)
  const glowColor = warmthColor(item.warmth)
  const mats = useMemo(() => {
    const shade = new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.6, side: THREE.DoubleSide })
    const glow = new THREE.MeshStandardMaterial({ color: '#fffaf0', roughness: 0.4, side: THREE.DoubleSide })
    const bulb = new THREE.MeshStandardMaterial({ color: '#fffaf0', roughness: 0.2 })
    return { shade, glow, bulb }
  }, [item.color])
  useEffect(() => {
    const on = item.on ? 1 : 0
    const level = on * item.brightness * (0.25 + 0.75 * dusk)
    mats.glow.emissive.set(glowColor)
    mats.glow.emissiveIntensity = level * 1.4
    mats.bulb.emissive.set(glowColor)
    mats.bulb.emissiveIntensity = level * 3
    // Translucent fabric shades glow faintly from inside.
    mats.shade.emissive.set(glowColor)
    mats.shade.emissiveIntensity = item.type === 'tripod' || item.type === 'table' ? level * 0.9 : 0
  }, [mats, glowColor, item.on, item.brightness, item.type, dusk])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])
  return mats
}

/**
 * Real lights only exist in the evening: every light adds shader cost even when
 * dim, and against daylight the emissive shades carry the look on their own.
 */
const EVENING_FACTOR = 0.55

function Bulb({ position, item, scale = 1 }: { position: [number, number, number]; item: LampItem; scale?: number }) {
  const evening = useView((s) => s.lighting === 'evening')
  if (!evening || !item.on) return null
  const power = LAMPS[item.type].power * item.brightness * scale * EVENING_FACTOR
  return <pointLight position={position} intensity={power} distance={7} decay={2} color={warmthColor(item.warmth)} />
}

/** A lamp in local space. Surface lamps stand on the origin; ceiling lamps hang from it; wall lamps face +z. */
export function Lamp({ item }: { item: LampItem }) {
  // Static parts merged per material; lights and the multi-material EXIT cube stay as they are.
  return (
    <Merged>
      <LampModel item={item} />
    </Merged>
  )
}

function LampModel({ item }: { item: LampItem }) {
  const m = useLampMaterials(item)
  // Pendants: the cord set in the inspector, or one that keeps them clear of heads (or low over a table).
  const drop = useDecor((s) => (isPendant(item.type) ? pendantDrop(item, s.items) : 0))

  switch (item.type) {
    case 'arc':
      return (
        <group>
          <mesh position={[0, 0.02, 0]} material={marble} castShadow receiveShadow>
            <cylinderGeometry args={[0.17, 0.17, 0.04, 32]} />
          </mesh>
          <mesh material={metal} castShadow>
            <tubeGeometry args={[ARC_CURVE, 40, 0.012, 8, false]} />
          </mesh>
          <mesh position={[1.24, 1.68, 0]} material={m.shade} castShadow>
            <sphereGeometry args={[0.2, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh position={[1.24, 1.72, 0]} material={m.bulb}>
            <sphereGeometry args={[0.045, 16, 10]} />
          </mesh>
          <Bulb position={[1.24, 1.62, 0]} item={item} />
        </group>
      )

    case 'tripod': {
      const top = new THREE.Vector3(0, 1.32, 0)
      return (
        <group>
          {[0, 1, 2].map((i) => {
            const a = (i / 3) * Math.PI * 2
            const foot = new THREE.Vector3(Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3)
            const mid = foot.clone().lerp(top, 0.5)
            const len = foot.distanceTo(top)
            const q = new THREE.Quaternion().setFromUnitVectors(
              new THREE.Vector3(0, 1, 0),
              top.clone().sub(foot).normalize(),
            )
            return (
              <mesh key={i} position={mid} quaternion={q} material={wood} castShadow>
                <cylinderGeometry args={[0.012, 0.016, len, 8]} />
              </mesh>
            )
          })}
          <mesh position={[0, 1.5, 0]} material={m.shade} castShadow>
            <cylinderGeometry args={[0.22, 0.24, 0.32, 40, 1, true]} />
          </mesh>
          <Bulb position={[0, 1.45, 0]} item={item} />
        </group>
      )
    }

    case 'table':
      return (
        <group>
          <mesh position={[0, 0.13, 0]} material={marble} castShadow>
            <cylinderGeometry args={[0.05, 0.075, 0.26, 24]} />
          </mesh>
          <mesh position={[0, 0.35, 0]} material={m.shade} castShadow>
            <cylinderGeometry args={[0.1, 0.14, 0.19, 32, 1, true]} />
          </mesh>
          <Bulb position={[0, 0.32, 0]} item={item} />
        </group>
      )

    case 'mushroom':
      return (
        <group>
          <mesh position={[0, 0.01, 0]} material={m.glow} castShadow>
            <cylinderGeometry args={[0.09, 0.09, 0.02, 24]} />
          </mesh>
          <mesh position={[0, 0.12, 0]} material={m.glow} castShadow>
            <cylinderGeometry args={[0.035, 0.045, 0.2, 20]} />
          </mesh>
          <mesh position={[0, 0.2, 0]} material={m.glow} castShadow>
            <sphereGeometry args={[0.15, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <Bulb position={[0, 0.18, 0]} item={item} />
        </group>
      )

    case 'flowerpot':
      // Verner Panton's Flowerpot: a dome over a smaller upturned dome, on a slim stem.
      return (
        <group>
          <mesh position={[0, 0.01, 0]} material={m.shade} castShadow>
            <cylinderGeometry args={[0.07, 0.08, 0.02, 32]} />
          </mesh>
          <mesh position={[0, 0.17, 0]} material={m.shade} castShadow>
            <cylinderGeometry args={[0.008, 0.008, 0.3, 10]} />
          </mesh>
          <mesh position={[0, 0.33, 0]} material={m.shade} castShadow>
            <sphereGeometry args={[0.115, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh position={[0, 0.34, 0]} rotation={[Math.PI, 0, 0]} material={m.shade}>
            <sphereGeometry args={[0.055, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <Bulb position={[0, 0.3, 0]} item={item} />
        </group>
      )

    case 'lantern': {
      // Large rice-paper globe (Noguchi Akari style), glowing, with thin ribs, on a cord of `drop`.
      const c = -(drop + 0.3)
      return (
        <group>
          <mesh position={[0, -drop / 2, 0]} material={cable}>
            <cylinderGeometry args={[0.003, 0.003, drop, 6]} />
          </mesh>
          <mesh position={[0, c, 0]} material={m.glow} castShadow>
            <sphereGeometry args={[0.3, 40, 28]} />
          </mesh>
          {Array.from({ length: 11 }, (_, i) => {
            const y = -0.25 + (i + 1) * 0.05
            const rr = Math.sqrt(Math.max(0, 0.3 * 0.3 - y * y)) + 0.001
            return (
              <mesh key={i} position={[0, c + y, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.shade}>
                <torusGeometry args={[rr, 0.0015, 4, 48]} />
              </mesh>
            )
          })}
          <Bulb position={[0, c, 0]} item={item} />
        </group>
      )
    }

    case 'pendant': {
      // Dome shade: its top meets the cord, its rim is 22 cm lower.
      const rim = -(drop + 0.22)
      return (
        <group>
          <mesh position={[0, -0.01, 0]} material={cable}>
            <cylinderGeometry args={[0.05, 0.05, 0.02, 20]} />
          </mesh>
          <mesh position={[0, -drop / 2, 0]} material={cable}>
            <cylinderGeometry args={[0.004, 0.004, drop, 6]} />
          </mesh>
          <mesh position={[0, rim, 0]} material={m.shade} castShadow>
            <sphereGeometry args={[0.22, 36, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh position={[0, rim + 0.07, 0]} material={m.bulb}>
            <sphereGeometry args={[0.05, 16, 10]} />
          </mesh>
          <Bulb position={[0, rim - 0.02, 0]} item={item} />
        </group>
      )
    }

    case 'globe': {
      const c = -(drop + 0.16)
      return (
        <group>
          <mesh position={[0, -0.01, 0]} material={cable}>
            <cylinderGeometry args={[0.05, 0.05, 0.02, 20]} />
          </mesh>
          <mesh position={[0, -drop / 2, 0]} material={cable}>
            <cylinderGeometry args={[0.004, 0.004, drop, 6]} />
          </mesh>
          <mesh position={[0, c, 0]} material={m.glow}>
            <sphereGeometry args={[0.16, 36, 24]} />
          </mesh>
          <Bulb position={[0, c, 0]} item={item} />
        </group>
      )
    }

    case 'sconce':
      return (
        <group>
          <mesh position={[0, 0, 0.012]} material={m.shade} castShadow>
            <boxGeometry args={[0.09, 0.14, 0.024]} />
          </mesh>
          <mesh position={[0, 0, 0.08]} rotation={[Math.PI / 2, 0, 0]} material={m.shade}>
            <cylinderGeometry args={[0.008, 0.008, 0.12, 8]} />
          </mesh>
          <mesh position={[0, 0.04, 0.15]} material={m.shade} castShadow>
            <cylinderGeometry args={[0.09, 0.05, 0.13, 32, 1, true]} />
          </mesh>
          <mesh position={[0, 0.02, 0.15]} material={m.bulb}>
            <sphereGeometry args={[0.03, 12, 8]} />
          </mesh>
          <Bulb position={[0, 0.1, 0.15]} item={item} />
        </group>
      )

    case 'exit':
      return <ExitCube item={item} />

    case 'exitCeiling':
      return <ExitCeiling item={item} />

    case 'string':
      return <StringLights item={item} bulb={m.bulb} />
  }
}

function exitSignTexture(letters: string) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#f7f3ea'
  g.fillRect(0, 0, 512, 256)
  // Milk glass is brighter toward the middle, where the tubes are.
  const glow = g.createRadialGradient(256, 128, 20, 256, 128, 280)
  glow.addColorStop(0, 'rgba(255,255,255,0.9)')
  glow.addColorStop(1, 'rgba(226,220,206,0.6)')
  g.fillStyle = glow
  g.fillRect(0, 0, 512, 256)
  g.fillStyle = letters
  g.font = 'bold 150px "Arial Narrow", "Helvetica Neue", Arial, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('EXIT', 256, 138, 440)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * A vintage ceiling EXIT fixture: a milk-glass box with red letters on both
 * faces, between an enameled cap and base, hanging from a stem and canopy.
 */
function ExitCeiling({ item }: { item: LampItem }) {
  const evening = useView((s) => s.lighting === 'evening')
  const lit = item.on ? item.brightness * (evening ? 1 : 0.3) : 0
  const mats = useMemo(() => {
    const map = exitSignTexture(item.color)
    const face = new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: '#ffffff', roughness: 0.35 })
    const milk = new THREE.MeshStandardMaterial({ color: '#f5f1e8', emissive: '#fff4e2', roughness: 0.35 })
    const cap = new THREE.MeshStandardMaterial({
      color: '#eeebe4',
      emissive: '#fff1dc',
      roughness: 0.4,
      metalness: 0.2,
    })
    return { face, milk, cap }
  }, [item.color])
  useEffect(() => {
    mats.face.emissiveIntensity = 0.12 + lit * 0.85
    mats.milk.emissiveIntensity = 0.1 + lit * 0.7
    // Glow from the glass catches the enameled rims.
    mats.cap.emissiveIntensity = lit * 0.12
  }, [mats, lit])
  useEffect(() => () => (mats.face.map?.dispose(), Object.values(mats).forEach((m) => m.dispose())), [mats])
  const W = 0.36
  const H = 0.18
  const D = 0.08
  const stem = 0.22
  const y = -stem - 0.02 - H / 2
  // Box face order: +x, -x, +y, -y, +z, -z. Letters on both broad faces.
  const faces = [mats.milk, mats.milk, mats.milk, mats.milk, mats.face, mats.face]
  return (
    <group>
      <mesh position={[0, -0.012, 0]} material={mats.cap} castShadow>
        <cylinderGeometry args={[0.055, 0.065, 0.024, 24]} />
      </mesh>
      <mesh position={[0, -stem / 2 - 0.02, 0]} material={metal}>
        <cylinderGeometry args={[0.008, 0.008, stem, 8]} />
      </mesh>
      {/* enameled top housing and bottom rim */}
      <mesh position={[0, -stem - 0.02 + 0.02, 0]} material={mats.cap} castShadow>
        <boxGeometry args={[W + 0.03, 0.04, D + 0.03]} />
      </mesh>
      <mesh position={[0, y, 0]} material={faces} castShadow>
        <boxGeometry args={[W, H, D]} />
      </mesh>
      <mesh position={[0, y - H / 2 - 0.008, 0]} material={mats.cap}>
        <boxGeometry args={[W + 0.02, 0.016, D + 0.02]} />
      </mesh>
      {item.on && evening && (
        <pointLight
          position={[0, y - H / 2 - 0.14, 0]}
          intensity={LAMPS.exitCeiling.power * item.brightness}
          distance={3.5}
          decay={2}
          color="#ffe6d6"
        />
      )}
    </group>
  )
}

function exitTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#c8241a'
  g.fillRect(0, 0, 256, 256)
  g.fillStyle = '#fff2e8'
  g.font = 'bold 92px Arial Narrow, Arial, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('EXIT', 128, 132)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Red glass EXIT cube on a chrome wall plate, lettered on its sides. */
function ExitCube({ item }: { item: LampItem }) {
  const evening = useView((s) => s.lighting === 'evening')
  const dusk = useView((s) => s.dusk)
  const lit = item.on ? item.brightness * (0.3 + 0.7 * dusk) : 0
  const mats = useMemo(() => {
    const map = exitTexture()
    const face = new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: '#ffffff', roughness: 0.25 })
    const plain = new THREE.MeshStandardMaterial({ color: item.color, emissive: item.color, roughness: 0.25 })
    return { face, plain }
  }, [item.color])
  useEffect(() => {
    mats.face.emissiveIntensity = 0.15 + lit * 0.9
    mats.plain.emissiveIntensity = 0.1 + lit * 0.7
  }, [mats, lit])
  useEffect(() => () => (mats.face.map?.dispose(), mats.face.dispose(), mats.plain.dispose()), [mats])
  // Box face order: +x, -x, +y, -y, +z, -z. Letters on the two sides and the front.
  const faces = [mats.face, mats.face, mats.plain, mats.plain, mats.face, mats.plain]
  return (
    <group>
      <mesh position={[0, 0, 0.01]} rotation={[Math.PI / 2, 0, 0]} material={metal}>
        <cylinderGeometry args={[0.07, 0.07, 0.02, 32]} />
      </mesh>
      <mesh position={[0, 0, 0.11]} material={faces} castShadow>
        <boxGeometry args={[0.16, 0.16, 0.16]} />
      </mesh>
      <mesh position={[0.05, -0.12, 0.03]} material={metal}>
        <cylinderGeometry args={[0.002, 0.002, 0.14, 4]} />
      </mesh>
      {item.on && evening && (
        <pointLight
          position={[0, 0, 0.3]}
          intensity={LAMPS.exit.power * item.brightness}
          distance={3}
          decay={2}
          color="#ff3b2a"
        />
      )}
    </group>
  )
}

function StringLights({ item, bulb }: { item: LampItem; bulb: THREE.Material }) {
  const L = item.length ?? 2.4
  const { curve, bulbs } = useMemo(() => {
    const pts: THREE.Vector3[] = []
    const n = 16
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const x = -L / 2 + L * t
      // Two gentle swags between three anchor points.
      const sag = 0.12 * Math.sin(((t * 2) % 1) * Math.PI)
      pts.push(new THREE.Vector3(x, -sag, 0.03))
    }
    const curve = new THREE.CatmullRomCurve3(pts)
    const count = Math.max(2, Math.round(L / 0.3))
    const bulbs = Array.from({ length: count }, (_, i) => curve.getPoint((i + 0.5) / count))
    return { curve, bulbs }
  }, [L])
  return (
    <group>
      <mesh material={cable}>
        <tubeGeometry args={[curve, 64, 0.003, 5, false]} />
      </mesh>
      {bulbs.map((p, i) => (
        <mesh key={i} position={[p.x, p.y - 0.035, p.z]} material={bulb}>
          <sphereGeometry args={[0.022, 12, 8]} />
        </mesh>
      ))}
      <Bulb position={[-L / 4, -0.15, 0.2]} item={item} scale={L / 2} />
      <Bulb position={[L / 4, -0.15, 0.2]} item={item} scale={L / 2} />
    </group>
  )
}
