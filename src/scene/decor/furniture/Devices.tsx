import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { CONDENSER_H, SPEAKER_W } from '../../../decor/furnitureCatalog'
import type { FurnitureItem } from '../../../model/decor'
import type { Vec3 } from '../../../model/types'
import { sharedEdgeMaterial } from '../../materials'
import { B, Rod } from './common'
import { mat, transparent } from './furnitureMaterials'

// Appliances and electronics: specific products the owner has, at their real
// sizes. Surface pieces: origin at the footprint center on the supporting
// surface, +z front. Wall pieces: origin on the wall, y = bottom edge, +z out.

const PI = Math.PI

// ---------- shared geometry ----------

/** Shapes are fixed per product, so each geometry is built once and shared. */
const geos = new Map<string, THREE.BufferGeometry>()
function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geos.get(key)
  if (!g) geos.set(key, (g = make()))
  return g
}

const edgeGeos = new WeakMap<THREE.BufferGeometry, THREE.EdgesGeometry>()
/** Outline of the creases only (smooth curves stay clean). */
function edgesOf(g: THREE.BufferGeometry): THREE.EdgesGeometry {
  let e = edgeGeos.get(g)
  if (!e) edgeGeos.set(g, (e = new THREE.EdgesGeometry(g, 35)))
  return e
}

interface SProps {
  g: THREE.BufferGeometry
  m: THREE.Material
  p?: Vec3
  r?: Vec3
  /** Positive scale only: mirrored parts cannot be merged. */
  s?: Vec3
  edges?: boolean
  shadow?: boolean
}

/** A shaped part with its crease outline, like B for boxes. */
function S({ g, m, p, r, s, edges = true, shadow = true }: SProps) {
  return (
    <group position={p} rotation={r} scale={s}>
      <mesh geometry={g} material={m} castShadow={shadow} receiveShadow />
      {edges && <lineSegments geometry={edgesOf(g)} material={sharedEdgeMaterial()} />}
    </group>
  )
}

const cyl = (rt: number, rb: number, h: number, seg = 24, open = false) =>
  geo(`cyl${rt},${rb},${h},${seg},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open))
const disc = (r: number, seg = 32) => geo(`disc${r},${seg}`, () => new THREE.CircleGeometry(r, seg))
const ring = (r0: number, r1: number) => geo(`ring${r0},${r1}`, () => new THREE.RingGeometry(r0, r1, 64))
/** An arc of tube in the xy plane, starting on +x and running counterclockwise. */
const torus = (r: number, tube: number, arc = 2 * PI, tubular = 32) =>
  geo(`torus${r},${tube},${arc},${tubular}`, () => new THREE.TorusGeometry(r, tube, 8, tubular, arc))
/** A surface of revolution around y from [radius, y] points, listed bottom to top (outside faces out). */
const lathe = (key: string, pts: [number, number][], seg = 40) =>
  geo(
    key,
    () =>
      new THREE.LatheGeometry(
        pts.map(([r, y]) => new THREE.Vector2(r, y)),
        seg,
      ),
  )
/** A dome (half sphere) bulging toward +z. */
const dome = (r: number) =>
  geo(`dome${r}`, () => new THREE.SphereGeometry(r, 20, 8, 0, 2 * PI, 0, PI / 2).rotateX(PI / 2))

/** A side profile drawn in (z, y) and extruded across the width, centered on x. */
function profileGeometry(shape: THREE.Shape, w: number, curveSegments = 10): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false, curveSegments })
  // Shape x -> z, extrusion -> -x.
  g.rotateY(-PI / 2)
  g.translate(w / 2, 0, 0)
  return g
}

function roundedRect(w: number, l: number, r: number): THREE.Shape {
  const x = w / 2
  const y = l / 2
  const s = new THREE.Shape()
  s.moveTo(-x + r, -y)
  s.lineTo(x - r, -y)
  s.quadraticCurveTo(x, -y, x, -y + r)
  s.lineTo(x, y - r)
  s.quadraticCurveTo(x, y, x - r, y)
  s.lineTo(-x + r, y)
  s.quadraticCurveTo(-x, y, -x, y - r)
  s.lineTo(-x, -y + r)
  s.quadraticCurveTo(-x, -y, -x + r, -y)
  return s
}

const smokedAcrylic = transparent('#3c4044', 0.38)
const tankPlastic = transparent('#9fc0cf', 0.45)

// ---------- Edifier R1700BT ----------

/** Front baffle slope: the top of the baffle sits this much further back than its foot. */
const SPEAKER_SLOPE = 0.022

export function Speakers({ item }: { item: FurnitureItem }) {
  const [, h, d] = item.size
  const gap = Number(item.options.spacing ?? 60) / 100
  const off = gap / 2 + SPEAKER_W / 2
  return (
    <group>
      {[-1, 1].map((sx) => (
        <Speaker
          key={sx}
          x={sx * off}
          h={h}
          d={d}
          wood={mat(item.finish.body, 'wood')}
          grille={item.options.grille !== false}
          active={sx === 1}
        />
      ))}
    </group>
  )
}

function Speaker({
  x,
  h,
  d,
  wood,
  grille,
  active,
}: {
  x: number
  h: number
  d: number
  wood: THREE.Material
  grille: boolean
  active: boolean
}) {
  const w = SPEAKER_W
  const cabinet = geo(`speaker${h},${d}`, () => {
    const s = new THREE.Shape()
    s.moveTo(-d / 2, 0)
    s.lineTo(d / 2, 0)
    s.lineTo(d / 2 - SPEAKER_SLOPE, h)
    s.lineTo(-d / 2, h)
    s.closePath()
    return profileGeometry(s, w)
  })
  const baffle = mat('#1d1d1f', 'matte')
  // Cone and grille never show together: one material for both.
  const cone = mat('#2a2a2d', 'fabric')
  const trim = mat('#8e9194', 'metal')
  const tilt = -Math.atan2(SPEAKER_SLOPE, h)
  const bh = Math.hypot(h, SPEAKER_SLOPE) - 0.008
  return (
    <group position={[x, 0, 0]}>
      <S g={cabinet} m={wood} />
      {/* the dark front, set between the wood sides and top */}
      <group position={[0, h / 2, d / 2 - SPEAKER_SLOPE / 2]} rotation={[tilt, 0, 0]}>
        <B s={[w - 0.012, bh, 0.006]} p={[0, -0.002, 0.002]} m={baffle} />
        {grille ? (
          <B s={[w - 0.014, bh - 0.006, 0.012]} p={[0, -0.002, 0.008]} m={cone} />
        ) : (
          <group position={[0, 0, 0.0055]}>
            {/* 4" woofer */}
            <group position={[0, -bh / 2 + 0.078, 0]}>
              <S g={torus(0.056, 0.004, 2 * PI, 40)} m={trim} edges={false} />
              <S g={torus(0.048, 0.005, 2 * PI, 40)} m={baffle} edges={false} />
              <S g={disc(0.045)} m={cone} p={[0, 0, -0.001]} edges={false} />
              <S g={dome(0.017)} m={baffle} s={[1, 1, 0.5]} edges={false} />
            </group>
            {/* silk dome tweeter */}
            <group position={[0, bh / 2 - 0.052, 0]}>
              <S g={torus(0.021, 0.003, 2 * PI, 32)} m={trim} edges={false} />
              <S g={disc(0.019)} m={baffle} p={[0, 0, -0.001]} edges={false} />
              <S g={dome(0.011)} m={cone} s={[1, 1, 0.7]} edges={false} />
            </group>
          </group>
        )}
      </group>
      {/* volume and bass / treble knobs on the outer side of the active speaker */}
      {active &&
        [0.07, 0.12].map((y) => (
          <S
            key={y}
            g={cyl(0.013, 0.013, 0.012, 24)}
            m={baffle}
            p={[w / 2 + 0.006, y, -d / 2 + 0.07]}
            r={[0, 0, PI / 2]}
          />
        ))}
    </group>
  )
}

// ---------- KitchenAid Artisan ----------

const MIXER_COLORS: Record<string, string> = {
  red: '#b3161d',
  white: '#f1efe9',
  black: '#262626',
  pistachio: '#b9c99b',
  almond: '#eee3c6',
}

/** Head profile [radius, t] along its length, back (motor end) to front (nose). */
const MIXER_HEAD: [number, number][] = [
  [0, 0],
  [0.035, 0.004],
  [0.055, 0.015],
  [0.068, 0.035],
  [0.074, 0.06],
  [0.075, 0.09],
  [0.072, 0.13],
  [0.066, 0.18],
  [0.06, 0.22],
  [0.054, 0.25],
  [0.046, 0.275],
  [0.034, 0.292],
  [0.018, 0.3],
  [0, 0.302],
]

const MIXER_BOWL: [number, number][] = [
  [0, 0],
  [0.055, 0],
  [0.075, 0.02],
  [0.095, 0.06],
  [0.106, 0.11],
  [0.11, 0.15],
  [0.115, 0.155],
  [0.115, 0.16],
  [0.107, 0.158],
  [0.102, 0.11],
  [0.09, 0.06],
  [0.07, 0.026],
  [0, 0.012],
]

export function StandMixer({ item }: { item: FurnitureItem }) {
  const enamel = mat(MIXER_COLORS[String(item.options.color)] ?? MIXER_COLORS.red, 'gloss')
  const steel = mat(item.finish.metal, 'metal')
  const coated = mat('#dddbd5', 'matte')
  const headY = 0.285
  const headZ = -0.165
  const base = geo('mixerBase', () => {
    const g = new THREE.ExtrudeGeometry(roundedRect(0.2, 0.31, 0.075), {
      depth: 0.03,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.008,
      bevelSegments: 2,
      curveSegments: 10,
    })
    g.rotateX(-PI / 2)
    g.translate(0, 0.008, 0)
    return g
  })
  const head = geo('mixerHead', () =>
    new THREE.LatheGeometry(
      MIXER_HEAD.map(([r, t]) => new THREE.Vector2(r, t)),
      40,
    ).rotateX(PI / 2),
  )
  const beater = geo('mixerBeater', () => {
    const s = new THREE.Shape()
    s.moveTo(-0.01, 0)
    s.lineTo(-0.02, -0.012)
    s.quadraticCurveTo(-0.05, -0.06, -0.03, -0.095)
    s.quadraticCurveTo(0, -0.112, 0.03, -0.095)
    s.quadraticCurveTo(0.05, -0.06, 0.02, -0.012)
    s.lineTo(0.01, 0)
    s.closePath()
    const hole = new THREE.Path()
    hole.moveTo(-0.006, -0.02)
    hole.quadraticCurveTo(-0.036, -0.06, -0.022, -0.086)
    hole.quadraticCurveTo(0, -0.098, 0.022, -0.086)
    hole.quadraticCurveTo(0.036, -0.06, 0.006, -0.02)
    hole.closePath()
    s.holes.push(hole)
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: false, curveSegments: 8 })
    g.translate(0, 0, -0.003)
    return g
  })
  const bowlZ = 0.035
  return (
    <group>
      <S g={base} m={enamel} p={[0, 0, -0.025]} />
      {/* pedestal: wide foot, waisted neck, up into the head */}
      <S
        g={lathe('mixerColumn', [
          [0.07, 0],
          [0.068, 0.03],
          [0.058, 0.08],
          [0.052, 0.13],
          [0.055, 0.17],
          [0.062, 0.2],
          [0.064, 0.215],
        ])}
        m={enamel}
        p={[0, 0.035, -0.105]}
        s={[1, 1, 0.85]}
        edges={false}
      />
      <S g={head} m={enamel} p={[0, headY, headZ]} edges={false} />
      {/* chrome trim band and the front attachment hub */}
      <S
        g={cyl(0.0655, 0.0655, 0.012, 40, true)}
        m={steel}
        p={[0, headY, headZ + 0.195]}
        r={[PI / 2, 0, 0]}
        edges={false}
      />
      <S g={cyl(0.024, 0.027, 0.014, 32)} m={steel} p={[0, headY, headZ + 0.298]} r={[PI / 2, 0, 0]} />
      <S g={cyl(0.016, 0.016, 0.006, 24)} m={enamel} p={[0, headY, headZ + 0.307]} r={[PI / 2, 0, 0]} />
      {/* tilt hinge, speed lever (left), head lock (right) */}
      <S g={cyl(0.009, 0.009, 0.14, 16)} m={steel} p={[0, 0.245, -0.14]} r={[0, 0, PI / 2]} />
      <B s={[0.008, 0.01, 0.04]} p={[-0.074, 0.29, -0.1]} r={[0.25, 0, 0]} m={steel} />
      <B s={[0.008, 0.012, 0.03]} p={[0.058, 0.205, -0.09]} m={steel} />
      {/* stainless bowl with its handle */}
      <group position={[0, 0.046, bowlZ]}>
        <S g={cyl(0.05, 0.054, 0.008, 32)} m={steel} p={[0, 0.004, 0]} />
        <S g={lathe('mixerBowl', MIXER_BOWL, 48)} m={steel} p={[0, 0.006, 0]} />
        <S g={torus(0.026, 0.006, PI, 12)} m={steel} p={[0.106, 0.125, 0]} r={[0, 0, -PI / 2]} edges={false} />
      </group>
      {/* flat beater on its shaft */}
      <Rod a={[0, 0.225, bowlZ]} b={[0, 0.19, bowlZ]} radius={0.005} m={steel} />
      <S g={beater} m={coated} p={[0, 0.195, bowlZ]} />
      <B s={[0.006, 0.085, 0.006]} p={[0, 0.195 - 0.055, bowlZ]} m={coated} edges={false} />
    </group>
  )
}

// ---------- Oster Perfect Brew espresso ----------

export function EspressoMachine({ item }: { item: FurnitureItem }) {
  const steel = mat(item.finish.metal, 'metal')
  const black = mat('#1c1c1d', 'matte')
  const white = mat('#f4f2ee', 'gloss')
  const red = mat('#d8342b', 'gloss')
  const gx = -0.02
  const gz = 0.075
  return (
    <group>
      {/* black plinth, stainless body, hood over the group head */}
      <B s={[0.22, 0.03, 0.28]} p={[0, 0.015, 0]} m={black} />
      <B s={[0.22, 0.27, 0.12]} p={[0, 0.165, -0.04]} m={steel} />
      <B s={[0.22, 0.08, 0.12]} p={[0, 0.26, 0.08]} m={steel} />
      <B s={[0.18, 0.004, 0.1]} p={[0, 0.302, -0.03]} m={black} />
      {/* control panel: pressure gauge, buttons, power light */}
      <B s={[0.2, 0.06, 0.004]} p={[0, 0.26, 0.142]} m={black} />
      <S g={cyl(0.018, 0.018, 0.004, 32)} m={white} p={[-0.055, 0.26, 0.145]} r={[PI / 2, 0, 0]} />
      <S g={torus(0.019, 0.0025, 2 * PI, 32)} m={steel} p={[-0.055, 0.26, 0.147]} edges={false} />
      <B s={[0.002, 0.013, 0.001]} p={[-0.052, 0.264, 0.1475]} r={[0, 0, -0.6]} m={red} edges={false} />
      {[0.015, 0.045].map((x) => (
        <S key={x} g={cyl(0.009, 0.009, 0.006, 20)} m={steel} p={[x, 0.26, 0.146]} r={[PI / 2, 0, 0]} />
      ))}
      <S g={cyl(0.003, 0.003, 0.004, 12)} m={red} p={[0.075, 0.26, 0.145]} r={[PI / 2, 0, 0]} edges={false} />
      {/* steam knob on the right side */}
      <S g={cyl(0.017, 0.017, 0.018, 24)} m={black} p={[0.119, 0.255, 0.08]} r={[0, 0, PI / 2]} />
      {/* group head and portafilter with its black handle and two spouts */}
      <S g={cyl(0.034, 0.034, 0.02, 32)} m={steel} p={[gx, 0.21, gz]} />
      <S g={cyl(0.041, 0.041, 0.006, 32)} m={black} p={[gx, 0.197, gz]} />
      <S g={cyl(0.037, 0.033, 0.026, 32)} m={steel} p={[gx, 0.181, gz]} />
      {[-0.009, 0.009].map((dx) => (
        <S key={dx} g={cyl(0.004, 0.004, 0.014, 10)} m={steel} p={[gx + dx, 0.162, gz]} edges={false} />
      ))}
      <Rod
        a={[gx - 0.012, 0.19, gz + 0.03]}
        b={[gx - 0.055, 0.176, gz + 0.115]}
        radius={0.011}
        m={black}
        segments={14}
      />
      {/* steam wand */}
      <Rod a={[0.085, 0.222, 0.1]} b={[0.098, 0.2, 0.108]} radius={0.004} m={steel} />
      <Rod a={[0.098, 0.2, 0.108]} b={[0.104, 0.085, 0.122]} radius={0.004} m={steel} />
      {/* drip tray with its grate */}
      <B s={[0.2, 0.022, 0.12]} p={[0, 0.041, 0.08]} m={steel} />
      {Array.from({ length: 6 }, (_, i) => (
        <B key={i} s={[0.16, 0.001, 0.006]} p={[0, 0.0525, 0.032 + i * 0.019]} m={black} edges={false} />
      ))}
      {item.options.cup !== false && (
        <group position={[gx, 0.052, gz]}>
          <S
            g={lathe('espressoCup', [
              [0, 0],
              [0.022, 0],
              [0.025, 0.004],
              [0.031, 0.052],
              [0.028, 0.052],
              [0.022, 0.008],
              [0, 0.008],
            ])}
            m={white}
          />
          <S g={disc(0.0272)} m={mat('#9c6a3c', 'matte')} p={[0, 0.042, 0]} r={[-PI / 2, 0, 0]} edges={false} />
          <S g={torus(0.012, 0.003, PI, 10)} m={white} p={[0.029, 0.028, 0]} r={[0, 0, -PI / 2]} edges={false} />
        </group>
      )}
      {/* see-through water tank at the back */}
      <B s={[0.18, 0.24, 0.036]} p={[0, 0.15, -0.12]} m={tankPlastic} shadow={false} />
      <B s={[0.185, 0.012, 0.04]} p={[0, 0.276, -0.12]} m={black} />
    </group>
  )
}

// ---------- Audio-Technica AT-LP120X ----------

const LABEL_COLORS: Record<string, string> = {
  red: '#c0392b',
  yellow: '#e6b422',
  blue: '#2f5fa8',
  white: '#efece4',
  green: '#3f8a4f',
}

/** Top of the plinth. */
const TT_TOP = 0.078

export function Turntable({ item }: { item: FurnitureItem }) {
  const [w, h, d] = item.size
  const plinth = item.options.plinth === 'silver' ? mat('#b9bcbf', 'metal') : mat('#2a2b2e', 'gloss')
  const alu = mat(item.finish.metal, 'metal')
  const black = mat('#141415', 'matte')
  const vinyl = mat('#0e0e0f', 'gloss')
  const groove = mat('#2c2d30', 'gloss')
  const label = mat(LABEL_COLORS[String(item.options.label)] ?? LABEL_COLORS.red, 'matte')
  const y0 = TT_TOP
  const cover = String(item.options.cover ?? 'closed')
  const hc = h - y0
  // Platter on the left, tonearm pivot at the back right.
  const [px, pz] = [-0.034, 0.002]
  const [ax, az] = [0.161, -0.105]
  const ya = 0.036
  const arm = geo('ttArm', () => {
    const pts = [
      [0, 0.005],
      [0, 0.05],
      [-0.012, 0.095],
      [-0.022, 0.135],
      [-0.016, 0.172],
      [-0.006, 0.197],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z))
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.0035, 8, false)
  })
  return (
    <group>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <S key={`${sx}${sz}`} g={cyl(0.03, 0.03, 0.018, 24)} m={black} p={[sx * 0.18, 0.009, sz * 0.13]} />
        )),
      )}
      <B s={[w, y0 - 0.018, d]} p={[0, (y0 + 0.018) / 2, 0]} m={plinth} />
      {/* platter, rubber mat, record and label */}
      <group position={[px, y0, pz]}>
        <S g={cyl(0.166, 0.166, 0.014, 72)} m={alu} p={[0, 0.007, 0]} />
        <S g={cyl(0.152, 0.152, 0.003, 72)} m={black} p={[0, 0.0155, 0]} edges={false} />
        <S g={cyl(0.1515, 0.1515, 0.002, 72)} m={vinyl} p={[0, 0.018, 0]} />
        {[0.075, 0.095, 0.115, 0.135, 0.146].map((r) => (
          <S
            key={r}
            g={ring(r - 0.0008, r + 0.0008)}
            m={groove}
            p={[0, 0.0191, 0]}
            r={[-PI / 2, 0, 0]}
            edges={false}
            shadow={false}
          />
        ))}
        <S g={disc(0.05, 40)} m={label} p={[0, 0.0192, 0]} r={[-PI / 2, 0, 0]} edges={false} shadow={false} />
        <S g={cyl(0.0035, 0.0035, 0.024, 10)} m={alu} p={[0, 0.02, 0]} edges={false} />
      </group>
      {/* S-shaped tonearm, parked on its rest */}
      <group position={[ax, y0, az]}>
        <S g={cyl(0.032, 0.034, 0.01, 40)} m={alu} p={[0, 0.005, 0]} />
        <S g={cyl(0.012, 0.014, 0.026, 20)} m={black} p={[0, 0.023, 0]} />
        <B s={[0.03, 0.014, 0.022]} p={[0, ya, 0]} m={black} />
        <S g={arm} m={alu} p={[0, ya, 0]} edges={false} />
        <group position={[-0.004, ya - 0.002, 0.217]} rotation={[0, -0.35, 0]}>
          <B s={[0.02, 0.005, 0.048]} p={[0, 0, 0]} m={black} />
          <B s={[0.017, 0.016, 0.026]} p={[0, -0.0105, -0.004]} m={black} />
          <Rod a={[0.01, 0, 0.016]} b={[0.028, 0.006, 0.026]} radius={0.0016} m={alu} segments={6} />
        </group>
        {/* counterweight on the back stub */}
        <Rod a={[0, ya, -0.005]} b={[0, ya, -0.08]} radius={0.004} m={alu} />
        <S g={cyl(0.018, 0.018, 0.03, 32)} m={black} p={[0, ya, -0.056]} r={[PI / 2, 0, 0]} />
        <S g={cyl(0.0185, 0.0185, 0.004, 32)} m={alu} p={[0, ya, -0.04]} r={[PI / 2, 0, 0]} edges={false} />
        {/* anti-skate dial, lift lever, arm rest */}
        <S g={cyl(0.013, 0.013, 0.006, 24)} m={alu} p={[-0.03, 0.003, 0.045]} />
        <S g={cyl(0.004, 0.004, 0.03, 10)} m={black} p={[0.035, 0.015, 0.03]} edges={false} />
        <B s={[0.006, 0.004, 0.03]} p={[0.035, 0.032, 0.03]} m={alu} />
        <S g={cyl(0.005, 0.005, ya - 0.008, 12)} m={black} p={[-0.018, (ya - 0.008) / 2, 0.15]} edges={false} />
        <B s={[0.012, 0.005, 0.01]} p={[-0.018, ya - 0.006, 0.15]} m={black} />
      </group>
      {/* pitch slider, start/stop, 33/45/78, target light */}
      <B s={[0.008, 0.001, 0.12]} p={[0.195, y0 + 0.0005, 0.07]} m={black} edges={false} />
      <B s={[0.02, 0.01, 0.012]} p={[0.195, y0 + 0.005, 0.07]} m={alu} />
      <B s={[0.036, 0.008, 0.028]} p={[-0.19, y0 + 0.004, 0.142]} m={alu} />
      {[0, 1, 2].map((i) => (
        <S key={i} g={cyl(0.007, 0.007, 0.005, 16)} m={alu} p={[-0.145 + i * 0.02, y0 + 0.0025, 0.155]} />
      ))}
      <S g={cyl(0.008, 0.008, 0.02, 16)} m={alu} p={[-0.205, y0 + 0.01, -0.155]} />
      {[-1, 1].map((sx) => (
        <B key={sx} s={[0.03, 0.012, 0.012]} p={[sx * 0.15, y0 + 0.006, -d / 2 + 0.006]} m={black} />
      ))}
      {/* smoked dust cover, hinged at the back */}
      {cover !== 'removed' && (
        <group position={[0, y0, -d / 2]} rotation={[cover === 'open' ? -1.66 : 0, 0, 0]}>
          <B s={[w, 0.003, d]} p={[0, hc - 0.0015, d / 2]} m={smokedAcrylic} shadow={false} />
          <B s={[w, hc, 0.003]} p={[0, hc / 2, d - 0.0015]} m={smokedAcrylic} shadow={false} />
          <B s={[w, hc, 0.003]} p={[0, hc / 2, 0.0015]} m={smokedAcrylic} shadow={false} />
          {[-1, 1].map((sx) => (
            <B
              key={sx}
              s={[0.003, hc, d]}
              p={[sx * (w / 2 - 0.0015), hc / 2, d / 2]}
              m={smokedAcrylic}
              shadow={false}
            />
          ))}
        </group>
      )}
    </group>
  )
}

// ---------- split air conditioner ----------

let displayMaterial: THREE.MeshStandardMaterial | null = null
/** The indoor unit's little temperature readout. */
function acDisplayMaterial(): THREE.MeshStandardMaterial {
  if (displayMaterial) return displayMaterial
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 48
  const g = c.getContext('2d')!
  g.fillStyle = '#16181b'
  g.fillRect(0, 0, 128, 48)
  g.fillStyle = '#6fd6ff'
  g.font = 'bold 34px Arial, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('24°', 64, 26)
  const map = new THREE.CanvasTexture(c)
  map.colorSpace = THREE.SRGBColorSpace
  displayMaterial = new THREE.MeshStandardMaterial({
    map,
    emissive: '#ffffff',
    emissiveMap: map,
    emissiveIntensity: 0.6,
    roughness: 0.4,
  })
  return displayMaterial
}

export function AcIndoor({ item }: { item: FurnitureItem }) {
  const [w, h, d] = item.size
  const body = mat(item.finish.body, 'matte')
  const dark = mat('#34373a', 'matte')
  const shell = geo(`acIndoor${w},${h},${d}`, () => {
    // Side profile: flat back on the wall, flat top, softly bulging front, rounded belly.
    const s = new THREE.Shape()
    s.moveTo(0, 0.02)
    s.lineTo(0, h)
    s.lineTo(d - 0.06, h)
    s.quadraticCurveTo(d - 0.005, h, d - 0.005, h - 0.055)
    s.quadraticCurveTo(d + 0.003, h / 2, d - 0.02, 0.07)
    s.quadraticCurveTo(d - 0.05, 0, d - 0.1, 0)
    s.lineTo(0.03, 0)
    s.closePath()
    return profileGeometry(s, w, 12)
  })
  return (
    <group>
      <S g={shell} m={body} />
      {/* the line between the front panel and the air outlet */}
      <B s={[w - 0.02, 0.003, 0.003]} p={[0, 0.091, d - 0.013]} m={dark} edges={false} />
      {/* air outlet in the belly and the louver blade */}
      <B s={[w - 0.08, 0.003, 0.075]} p={[0, 0.015, d - 0.053]} r={[-0.72, 0, 0]} m={dark} edges={false} />
      <B s={[w - 0.1, 0.045, 0.004]} p={[0, 0.04, d - 0.03]} r={[0.35, 0, 0]} m={body} />
      {item.options.display !== false && (
        <mesh position={[w / 2 - 0.13, h / 2 + 0.035, d + 0.0005]} material={acDisplayMaterial()}>
          <planeGeometry args={[0.05, 0.019]} />
        </mesh>
      )}
    </group>
  )
}

export function AcOutdoor({ item }: { item: FurnitureItem }) {
  const [w, , d] = item.size
  const casing = mat(item.finish.body, 'matte')
  const steel = mat(item.finish.metal, 'metal')
  const dark = mat('#2b2c2e', 'matte')
  const fins = mat('#9aa0a4', 'metal')
  const bracket = item.options.bracket === true
  const lift = bracket ? Number(item.options.lift ?? 100) / 100 : 0
  const H = CONDENSER_H
  const bodyH = H - 0.032
  const [fx, fy] = [-0.09, 0.02 + bodyH / 2]
  const fz = d / 2
  return (
    <group>
      <group position={[0, lift, 0]}>
        {/* feet rails, casing, lid */}
        {[-1, 1].map((sx) => (
          <B key={sx} s={[0.06, 0.02, d - 0.02]} p={[sx * (w / 2 - 0.1), 0.01, 0]} m={dark} />
        ))}
        <B s={[w, bodyH, d]} p={[0, 0.02 + bodyH / 2, 0]} m={casing} />
        <B s={[w + 0.01, 0.012, d + 0.01]} p={[0, H - 0.006, 0]} m={casing} />
        {/* round fan grille: dark fan well, three blades, rings and cross bars */}
        <group position={[fx, fy, fz]}>
          <S g={disc(0.2, 48)} m={dark} p={[0, 0, 0.001]} edges={false} />
          {[0, 1, 2].map((i) => (
            <group key={i} rotation={[0, 0, (i * 2 * PI) / 3]}>
              <B s={[0.075, 0.15, 0.004]} p={[0, 0.09, 0.012]} r={[0, 0.35, 0]} m={fins} edges={false} />
            </group>
          ))}
          <S g={cyl(0.035, 0.035, 0.03, 24)} m={dark} p={[0, 0, 0.016]} r={[PI / 2, 0, 0]} edges={false} />
          {[0.05, 0.09, 0.13, 0.17].map((r) => (
            <S key={r} g={torus(r, 0.0022, 2 * PI, 48)} m={dark} p={[0, 0, 0.03]} edges={false} />
          ))}
          <S g={torus(0.203, 0.008, 2 * PI, 56)} m={casing} p={[0, 0, 0.022]} />
          <B s={[0.4, 0.005, 0.004]} p={[0, 0, 0.03]} m={dark} edges={false} />
          <B s={[0.005, 0.4, 0.004]} p={[0, 0, 0.03]} m={dark} edges={false} />
        </group>
        {/* side fins on the left and back, behind vertical guard bars */}
        <B s={[0.003, bodyH - 0.08, d - 0.05]} p={[-w / 2 - 0.0015, fy, 0]} m={fins} edges={false} />
        {Array.from({ length: 9 }, (_, i) => (
          <B
            key={i}
            s={[0.004, bodyH - 0.07, 0.004]}
            p={[-w / 2 - 0.004, fy, -d / 2 + 0.035 + (i * (d - 0.07)) / 8]}
            m={casing}
            edges={false}
          />
        ))}
        <B s={[w - 0.12, bodyH - 0.08, 0.003]} p={[-0.03, fy, -d / 2 - 0.0015]} m={fins} edges={false} />
        {/* service panel and refrigerant valves on the right */}
        <B s={[0.004, 0.2, 0.12]} p={[w / 2 + 0.002, 0.2, d / 2 - 0.08]} m={casing} />
        {[0.1, 0.14].map((y) => (
          <S
            key={y}
            g={cyl(0.009, 0.009, 0.03, 16)}
            m={steel}
            p={[w / 2 + 0.017, y, d / 2 - 0.08]}
            r={[0, 0, PI / 2]}
          />
        ))}
      </group>
      {bracket &&
        [-1, 1].map((sx) => {
          const x = sx * (w / 2 - 0.1)
          // L-bracket screwed to the wall behind: upright, arm under the unit, diagonal brace.
          const up = Math.min(0.42, lift + 0.02)
          return (
            <group key={sx}>
              <B s={[0.04, up, 0.035]} p={[x, lift + 0.02 - up / 2, -d / 2 - 0.0175]} m={steel} />
              <B s={[0.04, 0.035, d + 0.05]} p={[x, lift - 0.0175, -0.01]} m={steel} />
              <Rod
                a={[x, lift + 0.04 - up, -d / 2 - 0.02]}
                b={[x, lift - 0.035, d / 2 - 0.04]}
                radius={0.01}
                m={steel}
              />
            </group>
          )
        })}
    </group>
  )
}

// ---------- fridge ----------

/**
 * A fridge that stands against a wall, door on +z. Modern: a plain cabinet with
 * split doors and bar handles. Retro: a SMEG-like rounded body with chrome
 * handles and a chrome badge strip.
 */
export function Fridge({ item }: { item: FurnitureItem }) {
  const [w, h, d] = item.size
  const retro = item.options.style === 'retro'
  const freezer = String(item.options.freezer ?? 'top')
  const body = mat(item.finish.body, retro ? 'gloss' : 'matte')
  const handle = mat(item.finish.metal, 'metal')
  const dark = mat('#2b2c2e', 'matte')
  const plinth = retro ? 0.07 : 0.03
  const bodyH = h - plinth
  // Where the two doors meet, from the floor: a third of the way from the freezer end.
  const split = freezer === 'top' ? plinth + bodyH * 0.68 : freezer === 'bottom' ? plinth + bodyH * 0.36 : null
  const hx = retro ? -w / 2 + 0.07 : w / 2 - 0.06
  const doorZ = d / 2
  const shell = geo(`fridge${w},${bodyH},${d},${retro}`, () =>
    retro ? new RoundedBoxGeometry(w, bodyH, d, 4, Math.min(0.07, w * 0.12)) : new THREE.BoxGeometry(w, bodyH, d),
  )
  const handles: [number, number][] =
    split === null
      ? [[plinth + bodyH * 0.45, plinth + bodyH * 0.75]]
      : freezer === 'top'
        ? [
            [split - (retro ? 0.45 : 0.4), split - 0.08],
            [split + 0.05, split + Math.min(0.25, (h - split) * 0.6)],
          ]
        : [
            [split + 0.08, split + (retro ? 0.45 : 0.4)],
            [split - Math.min(0.25, (split - plinth) * 0.6), split - 0.05],
          ]
  return (
    <group>
      {retro ? (
        // Chrome-tipped legs under a rounded body.
        [-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => (
            <Rod
              key={`${sx}${sz}`}
              a={[sx * (w / 2 - 0.08), 0, sz * (d / 2 - 0.1)]}
              b={[sx * (w / 2 - 0.08), plinth, sz * (d / 2 - 0.1)]}
              radius={0.015}
              m={handle}
            />
          )),
        )
      ) : (
        <B s={[w - 0.04, plinth, d - 0.06]} p={[0, plinth / 2, -0.02]} m={dark} edges={false} />
      )}
      <S g={shell} m={body} p={[0, plinth + bodyH / 2, 0]} edges={!retro} />
      {/* door gaps */}
      {split !== null && (
        <B s={[w - (retro ? 0.1 : 0.004), 0.004, 0.004]} p={[0, split, doorZ + 0.001]} m={dark} edges={false} />
      )}
      {!retro && (
        <B
          s={[0.004, bodyH - 0.01, 0.004]}
          p={[-w / 2 + 0.002, plinth + bodyH / 2, doorZ + 0.001]}
          m={dark}
          edges={false}
        />
      )}
      {handles.map(([y0, y1], i) =>
        retro ? (
          <group key={i}>
            <Rod a={[hx, y0, doorZ + 0.04]} b={[hx, y1, doorZ + 0.04]} radius={0.012} m={handle} />
            <Rod a={[hx, y0, doorZ]} b={[hx, y0, doorZ + 0.04]} radius={0.01} m={handle} />
            <Rod a={[hx, y1, doorZ]} b={[hx, y1, doorZ + 0.04]} radius={0.01} m={handle} />
          </group>
        ) : (
          <B key={i} s={[0.02, y1 - y0, 0.03]} p={[hx, (y0 + y1) / 2, doorZ + 0.015]} m={handle} edges={false} />
        ),
      )}
      {retro && (
        <B
          s={[0.16, 0.025, 0.004]}
          p={[w / 2 - 0.14, plinth + bodyH * 0.9, doorZ + 0.002]}
          m={mat('#dfe2e4', 'gloss')}
          edges={false}
        />
      )}
    </group>
  )
}
