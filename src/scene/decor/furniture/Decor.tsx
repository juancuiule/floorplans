import { invalidate, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { FurnitureItem } from '../../../model/decor'
import { sharedEdgeMaterial } from '../../materials'
import { seeded } from '../plantGeometry'
import { B, Rod } from './common'
import { mat } from './furnitureMaterials'
import { GLAZES, glazeMaterial, SPECKLED, WHITE_GLAZE } from './glaze'

// ---------- glass room divider ----------

/** Glass as a texture: reeded (vertical flutes), frosted (even milky) or clear (faint tint). */
function dividerGlassTexture(kind: string) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 8
  const g = c.getContext('2d')!
  if (kind === 'reeded') {
    for (let x = 0; x < 256; x += 8) {
      const grad = g.createLinearGradient(x, 0, x + 8, 0)
      grad.addColorStop(0, 'rgba(250,252,252,0.82)')
      grad.addColorStop(0.35, 'rgba(206,218,219,0.62)')
      grad.addColorStop(0.7, 'rgba(150,164,166,0.55)')
      grad.addColorStop(1, 'rgba(250,252,252,0.82)')
      g.fillStyle = grad
      g.fillRect(x, 0, 8, 8)
    }
  } else if (kind === 'frosted') {
    g.fillStyle = 'rgba(236,240,240,0.8)'
    g.fillRect(0, 0, 256, 8)
  } else {
    g.fillStyle = 'rgba(214,228,230,0.16)'
    g.fillRect(0, 0, 256, 8)
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Floor-standing partition: a plywood frame on two feet with reeded, frosted or clear glass panes. */
export function GlassDivider({ item }: { item: FurnitureItem }) {
  const [w, h, d] = item.size
  const wood = mat(item.finish.body)
  const panels = Math.max(1, Math.min(6, Math.round(Number(item.options.panels ?? 3))))
  const kind = String(item.options.glass ?? 'reeded')
  const transom = item.options.transom !== false
  const s = 0.045
  const fd = 0.04
  const kick = 0.1
  const pw = (w - s) / panels - s
  const glass = useMemo(() => {
    const map = dividerGlassTexture(kind)
    // About 2.5 cm per flute.
    map.repeat.set(pw / 0.8, 1)
    return new THREE.MeshStandardMaterial({
      map,
      transparent: true,
      roughness: kind === 'clear' ? 0.05 : 0.3,
      metalness: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  }, [kind, pw])
  useEffect(() => () => (glass.map?.dispose(), glass.dispose()), [glass])
  const topY = h - s
  const splitY = transom ? Math.min(topY - 0.25, h * 0.8) : topY
  const rows: [number, number][] = transom
    ? [
        [kick, splitY - s / 2],
        [splitY + s / 2, topY],
      ]
    : [[kick, topY]]
  return (
    <group>
      {/* feet */}
      {[-1, 1].map((sx) => (
        <B key={sx} s={[0.06, 0.035, d]} p={[sx * (w / 2 - s / 2), 0.0175, 0]} m={wood} />
      ))}
      {/* stiles and mullions */}
      {Array.from({ length: panels + 1 }, (_, i) => (
        <B key={i} s={[s, h - 0.035, fd]} p={[-w / 2 + s / 2 + i * (pw + s), 0.035 + (h - 0.035) / 2, 0]} m={wood} />
      ))}
      {/* kick rail, top rail, transom */}
      <B s={[w - 2 * s, kick - 0.035, fd]} p={[0, 0.035 + (kick - 0.035) / 2, 0]} m={wood} />
      <B s={[w - 2 * s, s, fd]} p={[0, h - s / 2, 0]} m={wood} />
      {transom && <B s={[w - 2 * s, s, fd]} p={[0, splitY, 0]} m={wood} />}
      {/* glass sits in the middle of the frame depth */}
      {Array.from({ length: panels }, (_, i) =>
        rows.map(([y0, y1], k) => (
          <mesh key={`${i}${k}`} position={[-w / 2 + s + pw / 2 + i * (pw + s), (y0 + y1) / 2, 0]} material={glass}>
            <planeGeometry args={[pw, y1 - y0]} />
          </mesh>
        )),
      )}
    </group>
  )
}

// ---------- wire basket with a burlap coffee sack ----------

let burlapTex: THREE.CanvasTexture | null = null

/** Burlap weave with a coffee-sack stamp, centered at u = 0.5. */
function burlapTexture() {
  if (burlapTex) return burlapTex
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#b8966a'
  g.fillRect(0, 0, 1024, 256)
  const r = seeded('burlap')
  // Coarse weave: alternating light and dark threads both ways.
  for (let x = 0; x < 1024; x += 4) {
    g.fillStyle = `rgba(${r() > 0.5 ? '90,64,36' : '214,188,146'},${0.18 + r() * 0.18})`
    g.fillRect(x, 0, 2, 256)
  }
  for (let y = 0; y < 256; y += 4) {
    g.fillStyle = `rgba(${r() > 0.5 ? '90,64,36' : '222,198,158'},${0.16 + r() * 0.16})`
    g.fillRect(0, y, 1024, 2)
  }
  // The printed stamp, a little faded.
  g.globalAlpha = 0.78
  g.fillStyle = '#2b2622'
  g.strokeStyle = '#2b2622'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineWidth = 5
  g.beginPath()
  g.ellipse(512, 118, 150, 78, 0, 0, Math.PI * 2)
  g.stroke()
  g.font = 'bold 44px Georgia, serif'
  g.fillText('CAFÉ', 512, 92)
  g.font = 'bold 30px Georgia, serif'
  g.fillText('DE COLOMBIA', 512, 134)
  g.fillStyle = '#9a2a22'
  g.font = 'bold 26px Arial, sans-serif'
  g.fillText('70 KG · EXCELSO', 512, 222)
  g.globalAlpha = 1
  burlapTex = new THREE.CanvasTexture(c)
  burlapTex.colorSpace = THREE.SRGBColorSpace
  burlapTex.anisotropy = 4
  return burlapTex
}

let burlapMat: THREE.MeshStandardMaterial | null = null
const burlapMaterial = () =>
  (burlapMat ??= new THREE.MeshStandardMaterial({ map: burlapTexture(), roughness: 1, side: THREE.DoubleSide }))

const LAUNDRY = ['#e8e4dc', '#8ea5c3', '#3d3f42', '#c98b6b', '#f1ede4']

/** Round black wire basket; a burlap coffee sack lines it and folds over the rim. */
export function WireBasket({ item }: { item: FurnitureItem }) {
  const [w, h] = item.size
  const wire = mat(item.finish.metal, 'metal')
  const R = w / 2
  const sack = item.options.sack !== false
  const laundry = item.options.laundry !== false
  const n = Math.max(12, Math.round((Math.PI * w) / 0.05))
  const r = seeded(item.id)
  const cuff = useMemo(() => {
    // The folded-over cuff shows only the plain weave above the stamp (the top strip of the texture).
    const g = new THREE.CylinderGeometry(R + 0.012, R + 0.02, 0.1, 32, 1, true, -Math.PI, Math.PI * 2)
    const uv = g.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setY(i, 0.86 + uv.getY(i) * 0.12)
    return g
  }, [R])
  useEffect(() => () => cuff.dispose(), [cuff])
  return (
    <group>
      {/* vertical wires and rings */}
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2
        return (
          <Rod
            key={i}
            a={[Math.sin(a) * R * 0.9, 0.0025, Math.cos(a) * R * 0.9]}
            b={[Math.sin(a) * R, h, Math.cos(a) * R]}
            radius={0.0022}
            m={wire}
            segments={4}
          />
        )
      })}
      {[0.0025, h * 0.35, h * 0.68, h].map((y, k) => {
        const rr = R * (0.9 + 0.1 * (y / h))
        return (
          <mesh key={k} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={wire}>
            <torusGeometry args={[rr, k === 3 ? 0.004 : 0.0025, 5, 40]} />
          </mesh>
        )
      })}
      {/* base grid */}
      {[-1, 0, 1].map((k) => (
        <Rod
          key={`g${k}`}
          a={[-R * 0.88, 0.0025, k * R * 0.45]}
          b={[R * 0.88, 0.0025, k * R * 0.45]}
          radius={0.0022}
          m={wire}
          segments={4}
        />
      ))}
      {/* side handles */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * (R + 0.005), h - 0.035, 0]} rotation={[0, Math.PI / 2, 0]} material={wire}>
          <torusGeometry args={[0.035, 0.004, 5, 16, Math.PI]} />
        </mesh>
      ))}
      {sack && (
        <group>
          {/* thetaStart -π puts the stamp (u = 0.5) on the front */}
          <mesh position={[0, (h - 0.02) / 2 + 0.005, 0]} material={burlapMaterial()} castShadow receiveShadow>
            <cylinderGeometry args={[R * 0.985, R * 0.88, h - 0.02, 32, 1, true, -Math.PI, Math.PI * 2]} />
          </mesh>
          {/* the sack folded over the rim */}
          <mesh position={[0, h - 0.045, 0]} geometry={cuff} material={burlapMaterial()} castShadow />
          <mesh position={[0, h + 0.004, 0]} rotation={[Math.PI / 2, 0, 0]} material={burlapMaterial()}>
            <torusGeometry args={[R + 0.004, 0.012, 6, 40]} />
          </mesh>
        </group>
      )}
      {laundry &&
        Array.from({ length: 6 }, (_, i) => {
          const a = r() * Math.PI * 2
          const rr = r() * R * 0.45
          return (
            <mesh
              key={i}
              position={[Math.sin(a) * rr, h - 0.07 + r() * 0.05, Math.cos(a) * rr]}
              rotation={[r() * 0.6, r() * 3, r() * 0.6]}
              scale={[1, 0.45, 0.8]}
              material={mat(LAUNDRY[i % LAUNDRY.length], 'fabric')}
              castShadow
            >
              <icosahedronGeometry args={[R * 0.42, 1]} />
            </mesh>
          )
        })}
    </group>
  )
}

// ---------- ceramic mugs ----------

/** One mug standing on y = 0, handle toward +x: tapered body, a darker rim ring inside, a loop handle. */
export function Mug({
  p,
  turn = 0,
  glaze,
  r = 0.041,
  h = 0.095,
}: {
  p: [number, number, number]
  turn?: number
  glaze: THREE.Material
  r?: number
  h?: number
}) {
  return (
    <group position={p} rotation={[0, turn, 0]}>
      <mesh position={[0, h / 2, 0]} material={glaze} castShadow receiveShadow>
        <cylinderGeometry args={[r, r * 0.9, h, 24]} />
      </mesh>
      {/* the inside, seen over the rim: a shaded disc just below it */}
      <mesh position={[0, h + 0.0005, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat('#6b5a4a', 'matte')}>
        <circleGeometry args={[r - 0.004, 24]} />
      </mesh>
      <mesh position={[r - 0.002, h * 0.52, 0]} material={glaze} castShadow>
        <torusGeometry args={[h * 0.24, 0.0065, 8, 16, Math.PI]} />
      </mesh>
    </group>
  )
}

/** A set of stoneware mugs in a loose row, handles turned every which way. */
export function Mugs({ item }: { item: FurnitureItem }) {
  const [w] = item.size
  const n = Math.max(1, Math.min(6, Math.round(Number(item.options.count ?? 4))))
  const glaze = String(item.options.glaze ?? 'mixed')
  const r = seeded(item.id)
  const step = w / n
  const tray = item.options.tray === true
  // Mugs stand on the tray's floor (its 1 cm base), inside the side lips.
  const ty = tray ? 0.01 : 0
  return (
    <group>
      {tray && (
        <group>
          <B s={[w + 0.03, 0.01, 0.15]} p={[0, 0.005, 0]} m={mat(item.finish.body)} />
          {[-1, 1].map((k) => (
            <B key={k} s={[w + 0.03, 0.018, 0.01]} p={[0, 0.009, k * 0.07]} m={mat(item.finish.body)} />
          ))}
        </group>
      )}
      {Array.from({ length: n }, (_, i) => {
        const color = glaze === 'white' ? WHITE_GLAZE : glaze === 'speckled' ? SPECKLED : GLAZES[i % GLAZES.length]
        const x = -w / 2 + step * (i + 0.5) - 0.012
        const z = (r() - 0.5) * 0.03
        // Handles mostly to the right, a couple turned back or forward.
        const turn = (r() - 0.5) * 1.2 + (r() > 0.75 ? Math.PI * 0.5 : 0)
        return <Mug key={i} p={[x, ty, z]} turn={turn} glaze={glazeMaterial(color, glaze !== 'white')} />
      })}
    </group>
  )
}

// ---------- retro wall clock ----------

/** A rounded triangle, point up, centered on its incircle. */
function roundedTriangle(size: number, radius: number): THREE.Shape {
  // Circumradius of the triangle's corner centers.
  const R = size / 2 - radius
  const pts = [90, 210, 330].map((deg) => {
    const a = THREE.MathUtils.degToRad(deg)
    return new THREE.Vector2(Math.cos(a) * R, Math.sin(a) * R)
  })
  const s = new THREE.Shape()
  for (let i = 0; i < 3; i++) {
    const c = pts[i]
    const a0 = THREE.MathUtils.degToRad(90 + 120 * i - 60)
    const a1 = a0 + (Math.PI * 2) / 3
    if (i === 0) s.moveTo(c.x + Math.cos(a0) * radius, c.y + Math.sin(a0) * radius)
    s.absarc(c.x, c.y, radius, a0, a1, false)
  }
  s.closePath()
  return s
}

function clockDialTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#f6f0e2'
  g.fillRect(0, 0, 256, 256)
  g.fillStyle = '#1d1b19'
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    g.save()
    g.translate(128 + Math.sin(a) * 104, 128 - Math.cos(a) * 104)
    g.rotate(a)
    if (i % 3 === 0) g.fillRect(-5, -16, 10, 32)
    else g.fillRect(-2.5, -10, 5, 20)
    g.restore()
  }
  g.font = 'bold 26px Futura, "Trebuchet MS", sans-serif'
  g.textAlign = 'center'
  g.fillStyle = '#c9302c'
  g.fillText('ATOMIC', 128, 88)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** A 1950s-style red wall clock (rounded triangle or round) that shows the real time. */
export function RetroClock({ item }: { item: FurnitureItem }) {
  const [w, , depth] = item.size
  const round = item.options.shape === 'round'
  const shell = mat(item.finish.metal, 'gloss')
  const dark = mat('#1d1b19', 'matte')
  const { body, edges } = useMemo(() => {
    const shape = round
      ? (() => {
          const s = new THREE.Shape()
          s.absarc(0, 0, w / 2, 0, Math.PI * 2, false)
          return s
        })()
      : roundedTriangle(w * 1.08, w * 0.16)
    const body = new THREE.ExtrudeGeometry(shape, {
      depth: depth - 0.01,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.008,
      bevelSegments: 3,
      curveSegments: 24,
    })
    return { body, edges: new THREE.EdgesGeometry(body, 40) }
  }, [round, w, depth])
  useEffect(() => () => (body.dispose(), edges.dispose()), [body, edges])
  const face = useMemo(() => new THREE.MeshStandardMaterial({ map: clockDialTexture(), roughness: 0.5 }), [])
  useEffect(() => () => (face.map?.dispose(), face.dispose()), [face])
  const hands = useRef<{ hour: THREE.Object3D | null; minute: THREE.Object3D | null }>({ hour: null, minute: null })
  // Only the minute hand moves visibly: a redraw every 10 s is plenty.
  useEffect(() => {
    const id = setInterval(() => invalidate(), 10_000)
    return () => clearInterval(id)
  }, [])
  useFrame(() => {
    const now = new Date()
    const mins = now.getMinutes() + now.getSeconds() / 60
    const hrs = (now.getHours() % 12) + mins / 60
    if (hands.current.hour) hands.current.hour.rotation.z = -(hrs / 12) * Math.PI * 2
    if (hands.current.minute) hands.current.minute.rotation.z = -(mins / 60) * Math.PI * 2
  })
  const dialR = round ? w * 0.38 : w * 0.28
  // The triangle's incircle sits below its bounding-box center; the body is centered on it.
  const cy = item.size[1] / 2
  const fz = depth + 0.002
  return (
    <group position={[0, cy, 0]}>
      <mesh geometry={body} material={shell} castShadow />
      <lineSegments geometry={edges} material={sharedEdgeMaterial()} />
      <mesh position={[0, 0, fz]} material={face}>
        <circleGeometry args={[dialR, 40]} />
      </mesh>
      {/* raised bezel ring */}
      <mesh position={[0, 0, fz]} material={dark}>
        <torusGeometry args={[dialR, 0.004, 6, 48]} />
      </mesh>
      <group position={[0, 0, fz + 0.004]}>
        <group userData={{ noMerge: true }} ref={(el) => void (hands.current.hour = el)}>
          <B s={[0.008, dialR * 0.55, 0.003]} p={[0, dialR * 0.22, 0]} m={dark} edges={false} />
        </group>
        <group userData={{ noMerge: true }} ref={(el) => void (hands.current.minute = el)}>
          <B s={[0.005, dialR * 0.85, 0.003]} p={[0, dialR * 0.36, 0.003]} m={dark} edges={false} />
        </group>
        <mesh position={[0, 0, 0.006]} rotation={[Math.PI / 2, 0, 0]} material={shell}>
          <cylinderGeometry args={[0.009, 0.009, 0.006, 16]} />
        </mesh>
      </group>
    </group>
  )
}

// ---------- cross-stitch hoop ----------

// 16 × 16 pixel motifs. '.' is bare linen; letters pick a thread color.
const MOTIFS: Record<string, string[]> = {
  egg: [
    '................',
    '.....wwwww......',
    '...wwwwwwwww....',
    '..wwwwwwwwwwww..',
    '..wwwwwwwwwwwww.',
    '.wwwwwyyyywwwww.',
    '.wwwwyyyyyywwww.',
    '.wwwwyyyyoywwww.',
    '.wwwwyyyyyywwww.',
    '..wwwwyyyywwwww.',
    '..wwwwwwwwwwww..',
    '...wwwwwwwwwww..',
    '....wwwwwwwww...',
    '......wwwww.....',
    '................',
    '................',
  ],
  cherries: [
    '................',
    '.........gg.....',
    '........gggg....',
    '.......g..gg....',
    '......g....g....',
    '.....g.....g....',
    '....g......g....',
    '...g.......g....',
    '..rrr.....rrr...',
    '.rrrrr...rrrrr..',
    '.rrorr...rrorr..',
    '.rrrrr...rrrrr..',
    '..rrr.....rrr...',
    '................',
    '................',
    '................',
  ],
  cactus: [
    '................',
    '.......gg.......',
    '......gggg......',
    '......gggg..gg..',
    '..gg..gggg..gg..',
    '..gg..gggg..gg..',
    '..gg..gggggggg..',
    '..gggggggggggg..',
    '...ggggggg......',
    '......gggg......',
    '......gggg......',
    '....tttttttt....',
    '....tttttttt....',
    '.....tttttt.....',
    '.....tttttt.....',
    '................',
  ],
  heart: [
    '................',
    '................',
    '..rrr.....rrr...',
    '.rrrrr...rrrrr..',
    'rrrorrr.rrrrrrr.',
    'rrorrrrrrrrrrrr.',
    'rrrrrrrrrrrrrrr.',
    'rrrrrrrrrrrrrrr.',
    '.rrrrrrrrrrrrr..',
    '..rrrrrrrrrrr...',
    '...rrrrrrrrr....',
    '....rrrrrrr.....',
    '.....rrrrr......',
    '......rrr.......',
    '.......r........',
    '................',
  ],
}
const THREAD: Record<string, string> = {
  w: '#fbfaf6',
  y: '#f2b41c',
  o: '#fbe2a0',
  r: '#cf3a30',
  g: '#4d8a4a',
  t: '#c0714a',
}

const hoopTextures = new Map<string, THREE.CanvasTexture>()
function stitchTexture(motif: string) {
  let t = hoopTextures.get(motif)
  if (t) return t
  const rows = MOTIFS[motif] ?? MOTIFS.egg
  const cell = 16
  const c = document.createElement('canvas')
  c.width = c.height = cell * 20
  const g = c.getContext('2d')!
  g.fillStyle = '#e9e1cf'
  g.fillRect(0, 0, c.width, c.height)
  // Aida weave: a faint grid of holes.
  g.fillStyle = 'rgba(150,135,110,0.35)'
  for (let y = 0; y < c.height; y += cell / 2) for (let x = 0; x < c.width; x += cell / 2) g.fillRect(x, y, 1.5, 1.5)
  const ox = 2 * cell
  g.lineCap = 'round'
  g.lineWidth = cell * 0.32
  rows.forEach((row, j) =>
    [...row].forEach((ch, i) => {
      const col = THREAD[ch]
      if (!col) return
      const x = ox + i * cell
      const y = ox + j * cell
      // Each pixel is one cross stitch.
      g.strokeStyle = col
      g.beginPath()
      g.moveTo(x + 3, y + 3)
      g.lineTo(x + cell - 3, y + cell - 3)
      g.moveTo(x + cell - 3, y + 3)
      g.lineTo(x + 3, y + cell - 3)
      g.stroke()
      g.strokeStyle = 'rgba(0,0,0,0.12)'
      g.lineWidth = 1
      g.beginPath()
      g.moveTo(x + cell - 3, y + 3)
      g.lineTo(x + 3, y + cell - 3)
      g.stroke()
      g.lineWidth = cell * 0.32
    }),
  )
  t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  hoopTextures.set(motif, t)
  return t
}

const hoopFabric = new Map<string, THREE.MeshStandardMaterial>()

/** A round wood embroidery hoop with a pixel-art cross-stitch, hung on the wall. */
export function EmbroideryHoop({ item }: { item: FurnitureItem }) {
  const [w] = item.size
  const motif = String(item.options.motif ?? 'egg')
  const wood = mat(item.finish.body)
  const brass = mat('#b8963e', 'metal')
  let fabric = hoopFabric.get(motif)
  if (!fabric)
    hoopFabric.set(motif, (fabric = new THREE.MeshStandardMaterial({ map: stitchTexture(motif), roughness: 0.95 })))
  const R = w / 2
  return (
    <group position={[0, R, 0]}>
      <mesh position={[0, 0, 0.008]} material={fabric} receiveShadow>
        <circleGeometry args={[R - 0.004, 48]} />
      </mesh>
      {/* inner and outer rings */}
      <mesh position={[0, 0, 0.008]} material={wood} castShadow>
        <torusGeometry args={[R - 0.002, 0.0045, 6, 64]} />
      </mesh>
      <mesh position={[0, 0, 0.006]} material={wood} castShadow>
        <torusGeometry args={[R + 0.004, 0.005, 6, 64]} />
      </mesh>
      {/* the brass clamp screw at the top */}
      <B s={[0.022, 0.012, 0.014]} p={[0, R + 0.012, 0.007]} m={wood} />
      <mesh position={[0, R + 0.012, 0.007]} rotation={[0, 0, Math.PI / 2]} material={brass}>
        <cylinderGeometry args={[0.004, 0.004, 0.04, 8]} />
      </mesh>
    </group>
  )
}
