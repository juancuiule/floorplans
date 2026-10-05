import { useMemo } from 'react'
import * as THREE from 'three'
import { useDecor } from '../decor/store'
import { plan } from '../project'
import { useActiveShell } from '../project/structure'
import type { ShowerFittings, ShowerScreen } from '../model/finishes'
import type { Vec3 } from '../model/types'
import { Box } from './Box'
import { Merged } from './Merged'
import { sharedEdgeMaterial, sharedMaterial } from './materials'
import { cornerShelf, SHELF, showerFrame, type ShowerFrame } from './showerFrame'

// The shower over the plan's shower tray. In the tray's frame the back wall
// (with the mixer and the rain head) is on +x and the open side, toward the
// rest of the bathroom, on −x. The fittings are built in the tray's own frame
// (origin at its center), so a plan can put its shower anywhere and turn it:
// the tray fixture places it, and the tiled wall faces around it are read from
// the plan's tile bulges (showerFrame), not assumed.

const TRAY = plan.fixtures.find((o) => o.type === 'showerTray')

const FITTINGS: Record<ShowerFittings, THREE.MeshStandardMaterial> = {
  chrome: new THREE.MeshStandardMaterial({ color: '#d4d7da', roughness: 0.22, metalness: 0.35 }),
  black: new THREE.MeshStandardMaterial({ color: '#1e1f21', roughness: 0.55, metalness: 0.1 }),
  brass: new THREE.MeshStandardMaterial({ color: '#c09a55', roughness: 0.35, metalness: 0.35 }),
}
const edge = () => sharedEdgeMaterial()

/** A cylinder between two points. */
function Pipe({ a, b, r, m }: { a: Vec3; b: Vec3; r: number; m: THREE.Material }) {
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
      <cylinderGeometry args={[r, r, length, 12]} />
    </mesh>
  )
}

/** A disc facing -x (mounted on the back wall). */
function WallDisc({ p, r, m, t = 0.012 }: { p: Vec3; r: number; m: THREE.Material; t?: number }) {
  return (
    <mesh position={p} rotation={[0, 0, Math.PI / 2]} material={m} castShadow>
      <cylinderGeometry args={[r, r, t, 32]} />
    </mesh>
  )
}

/** Mixer, slide bar with hand shower and hose, rain head on a wall arm, and a corner shelf. */
function Fittings({ f, m }: { f: ShowerFrame; m: THREE.Material }) {
  const { back: BACK, z0: Z0, z1: Z1 } = f
  const ZC = (Z0 + Z1) / 2
  const hose = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(BACK - 0.03, 1.02, ZC + 0.06),
      new THREE.Vector3(BACK - 0.06, 0.62, ZC + 0.12),
      new THREE.Vector3(BACK - 0.05, 0.75, Z1 - 0.17),
      new THREE.Vector3(BACK - 0.06, 1.55, Z1 - 0.16),
    ])
    return new THREE.TubeGeometry(curve, 32, 0.007, 6, false)
  }, [BACK, ZC, Z1])
  const shelf = useMemo(() => cornerShelf(f), [f])
  const { side, cornerZ } = shelf
  const bottles: [number, number, string][] = [
    [0.025, 0.2, '#e8e2d6'],
    [0.02, 0.17, '#6f8fa3'],
    [0.022, 0.14, '#c9a36b'],
  ]
  return (
    <group>
      {/* thermostatic mixer: plate and two handles */}
      <WallDisc p={[BACK - 0.006, 1.02, ZC]} r={0.06} m={m} />
      <Box size={[0.03, 0.02, 0.08]} position={[BACK - 0.03, 1.02, ZC - 0.07]} material={m} edgeMaterial={edge()} />
      <Box size={[0.03, 0.02, 0.08]} position={[BACK - 0.03, 1.02, ZC + 0.07]} material={m} edgeMaterial={edge()} />
      <Pipe a={[BACK, 1.02, ZC + 0.06]} b={[BACK - 0.035, 1.02, ZC + 0.06]} r={0.012} m={m} />

      {/* slide bar with the hand shower resting in its holder */}
      <Pipe a={[BACK - 0.035, 1.15, Z1 - 0.16]} b={[BACK - 0.035, 1.9, Z1 - 0.16]} r={0.011} m={m} />
      <Pipe a={[BACK, 1.15, Z1 - 0.16]} b={[BACK - 0.035, 1.15, Z1 - 0.16]} r={0.01} m={m} />
      <Pipe a={[BACK, 1.9, Z1 - 0.16]} b={[BACK - 0.035, 1.9, Z1 - 0.16]} r={0.01} m={m} />
      <Pipe a={[BACK - 0.06, 1.55, Z1 - 0.16]} b={[BACK - 0.1, 1.72, Z1 - 0.16]} r={0.013} m={m} />
      <mesh position={[BACK - 0.11, 1.76, Z1 - 0.16]} rotation={[0, 0, 0.9]} material={m} castShadow>
        <cylinderGeometry args={[0.045, 0.04, 0.02, 24]} />
      </mesh>
      <mesh geometry={hose} material={m} />

      {/* rain head on an arm from the back wall */}
      <Pipe a={[BACK, 2.12, ZC]} b={[BACK - 0.32, 2.12, ZC]} r={0.011} m={m} />
      <Pipe a={[BACK - 0.32, 2.12, ZC]} b={[BACK - 0.32, 2.07, ZC]} r={0.011} m={m} />
      <mesh position={[BACK - 0.32, 2.06, ZC]} material={m} castShadow>
        <cylinderGeometry args={[0.11, 0.11, 0.012, 40]} />
      </mesh>

      {/* Corner shelf: a quarter disc with its two straight edges on the back and
          side tiles, curving out into the shower (−x, and away from the side wall). */}
      <mesh position={shelf.position} geometry={shelf.geometry} material={m} castShadow receiveShadow />
      {bottles.map(([r, h, color], i) => (
        <mesh
          key={i}
          position={[BACK - 0.05 - i * 0.045, SHELF.top + h / 2, cornerZ + side * (0.045 + (i % 2) * 0.05)]}
          castShadow
        >
          <cylinderGeometry args={[r, r, h, 16]} />
          <meshStandardMaterial color={color} roughness={0.35} />
        </mesh>
      ))}
    </group>
  )
}

/** Frameless glass door across the open side, on a slim steel profile, with a bar handle. */
function GlassDoor({ f, m }: { f: ShowerFrame; m: THREE.Material }) {
  const H = 1.95
  const { x0: X0, back: BACK, z0: Z0, z1: Z1, top } = f
  return (
    <group>
      <Box
        size={[0.008, H, Z1 - Z0]}
        position={[X0 + 0.01, top + H / 2, (Z0 + Z1) / 2]}
        material={sharedMaterial('glass')}
        castShadow={false}
      />
      {/* wall profile and the top stabilizer bar to the back wall */}
      <Box
        size={[0.02, H, 0.015]}
        position={[X0 + 0.01, top + H / 2, Z0 + 0.0075]}
        material={m}
        edgeMaterial={edge()}
      />
      <Pipe a={[X0 + 0.01, top + H - 0.02, Z1 - 0.02]} b={[BACK, top + H - 0.02, Z1 - 0.02]} r={0.008} m={m} />
      {/* bar handle on the outside, touching the glass */}
      <Box
        size={[0.04, 0.3, 0.015]}
        position={[X0 + 0.006 - 0.02, 1.05, Z1 - 0.07]}
        material={m}
        edgeMaterial={edge()}
      />
    </group>
  )
}

/** Curtain on a straight rail, drawn two thirds closed, with soft folds. */
function Curtain({ f, color, m }: { f: ShowerFrame; color: string; m: THREE.Material }) {
  const { x0: X0, z0: Z0, z1: Z1 } = f
  const width = (Z1 - Z0) * 0.62
  const height = 1.78
  const { geometry, material } = useMemo(() => {
    const g = new THREE.PlaneGeometry(width, height, 48, 1)
    const pos = g.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) pos.setZ(i, 0.022 * Math.sin((pos.getX(i) / width) * Math.PI * 10))
    g.computeVertexNormals()
    // The plane's x runs along the rail (plan z); turn it to face the room (-x).
    g.rotateY(-Math.PI / 2)
    g.translate(0, height / 2, 0)
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide })
    return { geometry: g, material }
  }, [color, width])
  const railY = 2.02
  return (
    <group>
      <Pipe a={[X0 + 0.03, railY, Z0]} b={[X0 + 0.03, railY, Z1]} r={0.01} m={m} />
      <mesh
        geometry={geometry}
        material={material}
        position={[X0 + 0.03, railY - 0.02 - height, Z0 + width / 2]}
        castShadow
        receiveShadow
      />
    </group>
  )
}

function ScreenFor({
  f,
  screen,
  curtainColor,
  m,
}: {
  f: ShowerFrame
  screen: ShowerScreen
  curtainColor: string
  m: THREE.Material
}) {
  if (screen === 'glass') return <GlassDoor f={f} m={m} />
  if (screen === 'curtain') return <Curtain f={f} color={curtainColor} m={m} />
  return null
}

/** The shower fittings and its screen, following the layout's finishes. */
export function Shower() {
  const screen = useDecor((s) => s.finishes.shower.screen)
  const curtainColor = useDecor((s) => s.finishes.shower.curtainColor)
  const fittings = useDecor((s) => s.finishes.shower.fittings)
  const { bulges } = useActiveShell()
  const f = useMemo(() => (TRAY ? showerFrame(TRAY, bulges) : null), [bulges])
  const m = FITTINGS[fittings]
  if (!TRAY || !f) return null
  return (
    <group position={TRAY.position} rotation={[0, THREE.MathUtils.degToRad(TRAY.rotation ?? 0), 0]}>
      {/* Remount (and re-merge) only when the choice or the walls change. */}
      <Merged key={`${screen}|${curtainColor}|${fittings}|${f.back}|${f.z0}|${f.z1}`}>
        <Fittings f={f} m={m} />
        <ScreenFor f={f} screen={screen} curtainColor={curtainColor} m={m} />
      </Merged>
    </group>
  )
}
