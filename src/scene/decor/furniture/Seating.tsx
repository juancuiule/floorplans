import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { FurnitureItem } from '../../../model/decor'
import type { Vec3 } from '../../../model/types'
import { seeded } from '../plantGeometry'
import { B, Books, FingerHole, Pillow, Rod, T } from './common'
import { mat } from './furnitureMaterials'
import { cushionGeometry } from './softGeometry'

// ---------- ergonomic office chair ----------

const meshTextures = new Map<string, THREE.CanvasTexture>()

/** A fine woven mesh: light threads over a darker ground, tiled. */
function meshTexture(ground: string, thread: string): THREE.CanvasTexture {
  const key = ground + thread
  let t = meshTextures.get(key)
  if (t) return t
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = ground
  g.fillRect(0, 0, 64, 64)
  g.strokeStyle = thread
  g.lineWidth = 1.2
  for (let i = 0; i <= 64; i += 4) {
    g.beginPath()
    g.moveTo(i, 0)
    g.lineTo(i, 64)
    g.stroke()
    g.beginPath()
    g.moveTo(0, i + 2)
    g.lineTo(64, i + 2)
    g.stroke()
  }
  t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(10, 12)
  t.colorSpace = THREE.SRGBColorSpace
  meshTextures.set(key, t)
  return t
}

const meshMaterials = new Map<string, THREE.MeshStandardMaterial>()
function meshMaterial(grey: boolean) {
  const key = grey ? 'grey' : 'black'
  let m = meshMaterials.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      map: grey ? meshTexture('#7d8086', '#b4b7bc') : meshTexture('#232427', '#5a5d62'),
      roughness: 0.9,
      side: THREE.DoubleSide,
    })
    meshMaterials.set(key, m)
  }
  return m
}

const BACK_R = 0.6

/** A shallow curved panel (an arc of a 0.6 m radius open cylinder) that wraps around the sitter, facing +z. */
function useBackGeometry(width: number, height: number) {
  const g = useMemo(() => {
    const theta = width / BACK_R
    const g = new THREE.CylinderGeometry(BACK_R, BACK_R, height, 16, 1, true, Math.PI - theta / 2, theta)
    g.translate(0, 0, BACK_R)
    return g
  }, [width, height])
  useEffect(() => () => g.dispose(), [g])
  return g
}

/** A molded frame tube running around the edge of a curved back panel (see useBackGeometry). */
function useFrameGeometry(width: number, height: number, radius: number) {
  const g = useMemo(() => {
    const half = width / BACK_R / 2
    const at = (a: number, y: number) => new THREE.Vector3(BACK_R * Math.sin(a), y, BACK_R - BACK_R * Math.cos(a))
    const pts: THREE.Vector3[] = []
    const n = 8
    const hy = height / 2
    // Rounded corners: the ends of each edge pull in a little.
    for (let i = 0; i <= n; i++) pts.push(at(-half * 0.92 + (1.84 * half * i) / n, hy))
    pts.push(at(half, hy * 0.9), at(half, 0), at(half, -hy * 0.9))
    for (let i = 0; i <= n; i++) pts.push(at(half * 0.92 - (1.84 * half * i) / n, -hy))
    pts.push(at(-half, -hy * 0.9), at(-half, 0), at(-half, hy * 0.9))
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal')
    return new THREE.TubeGeometry(curve, 96, radius, 6, true)
  }, [width, height, radius])
  useEffect(() => () => g.dispose(), [g])
  return g
}

/** Mesh-back task chair: five-star base on casters, gas lift, padded seat, curved mesh back, headrest, T-arms. */
export function OfficeChair({ item }: { item: FurnitureItem }) {
  const grey = item.options.color === 'grey'
  const seatH = Math.max(0.4, Math.min(0.58, Number(item.options.seat ?? 48) / 100))
  const base = mat(item.finish.metal, 'metal')
  const frame = mat(grey ? '#b4b6b9' : '#2a2b2e', 'matte')
  const cushion = mat(grey ? '#6d7075' : '#35373b', 'fabric')
  const wheel = mat('#1a1a1a', 'matte')
  const chrome = mat('#c9ccce', 'metal')
  const mesh = meshMaterial(grey)
  const back = useBackGeometry(0.46, 0.56)
  const backFrame = useFrameGeometry(0.47, 0.57, 0.014)
  const headGeo = useBackGeometry(0.28, 0.13)
  const headFrame = useFrameGeometry(0.29, 0.14, 0.011)
  const headrest = item.options.headrest !== false
  const backY = seatH + 0.12
  const backZ = -0.22
  const tilt = -0.12
  const spineTop = backY + (headrest ? 0.62 : 0.3)
  return (
    <group>
      {/* five-star base on twin-wheel casters */}
      {Array.from({ length: 5 }, (_, i) => {
        const a = (i / 5) * Math.PI * 2
        const cx = Math.sin(a)
        const cz = Math.cos(a)
        return (
          <group key={i}>
            <group rotation={[0, a, 0]}>
              <B s={[0.05, 0.035, 0.27]} p={[0, 0.088, 0.17]} r={[0.1, 0, 0]} m={base} />
            </group>
            <group position={[cx * 0.3, 0.03, cz * 0.3]} rotation={[0, a, 0]}>
              {[-1, 1].map((k) => (
                <mesh key={k} position={[k * 0.012, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={wheel} castShadow>
                  <cylinderGeometry args={[0.028, 0.028, 0.018, 14]} />
                </mesh>
              ))}
              <B s={[0.012, 0.035, 0.035]} p={[0, 0.022, 0]} m={wheel} edges={false} />
            </group>
          </group>
        )
      })}
      <mesh position={[0, 0.1, 0]} material={base} castShadow>
        <cylinderGeometry args={[0.045, 0.06, 0.06, 20]} />
      </mesh>
      {/* gas lift: shroud and chrome piston */}
      <Rod a={[0, 0.12, 0]} b={[0, 0.3, 0]} radius={0.032} m={frame} segments={16} />
      <Rod a={[0, 0.3, 0]} b={[0, seatH - 0.1, 0]} radius={0.02} m={chrome} segments={14} />
      {/* tilt mechanism with its paddle, seat pan and padded seat */}
      <B s={[0.22, 0.05, 0.26]} p={[0, seatH - 0.115, 0]} m={frame} />
      <B s={[0.1, 0.012, 0.025]} p={[0.16, seatH - 0.12, 0.08]} r={[0, -0.3, 0]} m={frame} edges={false} />
      <mesh
        geometry={cushionGeometry(0.48, 0.03, 0.46, 0.08)}
        position={[0, seatH - 0.09, 0.01]}
        material={frame}
        castShadow
      />
      <mesh
        geometry={cushionGeometry(0.5, 0.075, 0.48, 0.1)}
        position={[0, seatH - 0.075, 0.01]}
        material={cushion}
        castShadow
        receiveShadow
      />
      {/* spine from the mechanism up behind the back to the headrest */}
      <B s={[0.07, 0.03, 0.2]} p={[0, seatH - 0.105, -0.17]} m={frame} />
      <B
        s={[0.06, spineTop - (seatH - 0.12), 0.03]}
        p={[0, (spineTop + seatH - 0.12) / 2, backZ - 0.045]}
        r={[tilt, 0, 0]}
        m={frame}
      />
      {/* mesh back in a molded frame, with a lumbar pad */}
      <group position={[0, backY + 0.28, backZ]} rotation={[tilt, 0, 0]}>
        <mesh geometry={back} material={mesh} castShadow />
        <mesh geometry={backFrame} material={frame} castShadow />
        <B s={[0.3, 0.07, 0.02]} p={[0, -0.14, 0.03]} m={frame} />
      </group>
      {headrest && (
        <group position={[0, backY + 0.68, backZ - 0.02]} rotation={[tilt * 1.6, 0, 0]}>
          <mesh geometry={headGeo} material={mesh} castShadow />
          <mesh geometry={headFrame} material={frame} castShadow />
        </group>
      )}
      {/* T-arms: bracket under the seat, post, padded top */}
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <B s={[0.12, 0.025, 0.05]} p={[sx * 0.22, seatH - 0.105, -0.03]} m={frame} />
          <B s={[0.035, 0.29, 0.05]} p={[sx * 0.28, seatH + 0.03, -0.03]} m={frame} />
          <mesh
            geometry={cushionGeometry(0.08, 0.03, 0.25, 0.035)}
            position={[sx * 0.28, seatH + 0.175, 0.0]}
            material={cushion}
            castShadow
          />
        </group>
      ))}
    </group>
  )
}

// ---------- bent-tube bistro chair and stools ----------

function tube(points: Vec3[], radius: number, tension = 0.1) {
  const c = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(...p)),
    false,
    'catmullrom',
    tension,
  )
  return new THREE.TubeGeometry(c, Math.max(16, points.length * 10), radius, 8, false)
}

/** Bent steel tube on a round wood seat: a stacking café chair, a low stool or a bar stool. */
export function BistroChair({ item }: { item: FurnitureItem }) {
  const variant = String(item.options.variant ?? 'chair')
  const color = String(item.options.color ?? '#e0662f')
  const steel = mat(color, 'gloss')
  const wood = mat(item.finish.body)
  const seatY = variant === 'bar' ? 0.66 : 0.46
  const seatR = variant === 'bar' ? 0.17 : 0.19
  const ringY = variant === 'bar' ? 0.26 : 0.17
  const rT = 0.011
  const geos = useMemo(() => {
    const top = seatY - 0.03
    const out: THREE.BufferGeometry[] = []
    // Four splayed legs, each bent in under the seat ring.
    const corners =
      variant === 'chair'
        ? [Math.PI * 0.25, -Math.PI * 0.25]
        : [Math.PI * 0.25, -Math.PI * 0.25, Math.PI * 0.75, -Math.PI * 0.75]
    for (const a of corners) {
      const s = Math.sin(a)
      const c = Math.cos(a)
      const rTop = seatR * 0.78
      const rFoot = variant === 'bar' ? 0.23 : 0.22
      out.push(
        tube(
          [
            [s * rFoot, 0.01, c * rFoot],
            [s * (rTop + (rFoot - rTop) * 0.35), top * 0.65, c * (rTop + (rFoot - rTop) * 0.35)],
            [s * rTop, top - 0.02, c * rTop],
            [s * rTop * 0.6, top, c * rTop * 0.6],
          ],
          rT,
        ),
      )
    }
    if (variant === 'chair') {
      // One continuous tube: back legs, up through the seat, over the top in a U.
      const rTop = seatR * 0.78
      const bx = Math.sin(Math.PI * 0.25) * rTop
      const bz = -Math.cos(Math.PI * 0.25) * rTop
      out.push(
        tube(
          [
            [-0.21, 0.01, -0.21],
            [-bx - 0.02, top * 0.55, bz - 0.03],
            [-bx, top, bz],
            [-bx + 0.005, top + 0.18, bz - 0.04],
            [-bx + 0.03, 0.8, bz - 0.07],
            [0, 0.83, bz - 0.09],
            [bx - 0.03, 0.8, bz - 0.07],
            [bx - 0.005, top + 0.18, bz - 0.04],
            [bx, top, bz],
            [bx + 0.02, top * 0.55, bz - 0.03],
            [0.21, 0.01, -0.21],
          ],
          rT,
          0.35,
        ),
      )
    }
    return out
  }, [variant, seatY, seatR])
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos])
  const band = useMemo(() => {
    // Curved wood backrest band, an arc around the seat center, against the front of the back tubes.
    const r = 0.162
    const t = 0.012
    const half = 0.62
    const s = new THREE.Shape()
    s.absarc(0, 0, r + t, Math.PI / 2 - half, Math.PI / 2 + half, false)
    s.absarc(0, 0, r, Math.PI / 2 + half, Math.PI / 2 - half, true)
    s.closePath()
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.085, bevelEnabled: false, curveSegments: 20 })
    // Shape y -> -z (behind the seat), extrusion -> up.
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  useEffect(() => () => band.dispose(), [band])
  return (
    <group>
      {geos.map((g, i) => (
        <mesh key={i} geometry={g} material={steel} castShadow />
      ))}
      {/* seat ring and footrest ring */}
      <mesh position={[0, seatY - 0.03, 0]} rotation={[Math.PI / 2, 0, 0]} material={steel} castShadow>
        <torusGeometry args={[seatR * 0.78, rT, 8, 40]} />
      </mesh>
      {variant !== 'chair' && (
        <mesh position={[0, ringY, 0]} rotation={[Math.PI / 2, 0, 0]} material={steel} castShadow>
          <torusGeometry args={[variant === 'bar' ? 0.205 : 0.2, rT, 8, 40]} />
        </mesh>
      )}
      <mesh position={[0, seatY - 0.012, 0]} material={wood} castShadow receiveShadow>
        <cylinderGeometry args={[seatR, seatR, 0.024, 36]} />
      </mesh>
      {variant === 'chair' && <mesh position={[0, 0.69, 0]} geometry={band} material={wood} castShadow />}
    </group>
  )
}

// ---------- kitchen window bench ----------

const BASKET = '#b99463'

/** Plywood box bench under a window: open cubbies (books, baskets) or closed doors, a seat cushion. */
export function WindowBench({ item }: { item: FurnitureItem }) {
  const [w, h, d] = item.size
  const body = mat(item.finish.body)
  const recess = mat('#8f7a5c', 'matte')
  const cushion = item.options.cushion !== false
  const open = item.options.front !== 'closed'
  const kick = 0.05
  const n = Math.max(1, Math.round(w / 0.4))
  const cw = (w - T) / n
  const r = seeded(item.id)
  const boxH = h - (cushion ? 0.06 : 0)
  return (
    <group>
      <B s={[w - 0.04, kick, d - 0.06]} p={[0, kick / 2, -0.03]} m={recess} edges={false} />
      <B s={[w, T, d]} p={[0, boxH - T / 2, 0]} m={body} />
      <B s={[w, T, d]} p={[0, kick + T / 2, 0]} m={body} />
      <B s={[w, boxH - kick, T]} p={[0, kick + (boxH - kick) / 2, -d / 2 + T / 2]} m={body} />
      {Array.from({ length: n + 1 }, (_, i) => (
        <B
          key={i}
          s={[T, boxH - kick - 2 * T, d - T]}
          p={[-w / 2 + T / 2 + i * cw, kick + (boxH - kick) / 2, T / 2]}
          m={body}
        />
      ))}
      {Array.from({ length: n }, (_, i) => {
        const cx = -w / 2 + T / 2 + (i + 0.5) * cw
        const ch = boxH - kick - 2 * T
        if (!open)
          return (
            <group key={i}>
              <B s={[cw - T - 0.004, ch - 0.004, T]} p={[cx, kick + T + ch / 2, d / 2 - T / 2]} m={body} />
              <FingerHole p={[cx, kick + T + ch - 0.05, d / 2 + 0.001]} vertical={false} />
            </group>
          )
        // Alternate books and a woven basket.
        return i % 2 === 0 ? (
          <Books
            key={i}
            w={cw - T - 0.01}
            h={ch - 0.01}
            d={d - T - 0.02}
            seed={`${item.id}${i}`}
            p={[cx, kick + T, 0]}
          />
        ) : (
          <group key={i} position={[cx, kick + T, 0.02]}>
            <B s={[cw - T - 0.05, ch * 0.72, d - 0.1]} p={[0, (ch * 0.72) / 2, 0]} m={mat(BASKET, 'matte')} />
            {/* woven bands */}
            {[0.25, 0.5, 0.75].map((t) => (
              <B
                key={t}
                s={[cw - T - 0.048, 0.008, d - 0.098]}
                p={[0, ch * 0.72 * t, 0]}
                m={mat('#9c7a4c', 'matte')}
                edges={false}
              />
            ))}
            {r() > 0.3 && (
              <B
                s={[cw * 0.5, 0.05, d * 0.5]}
                p={[0, ch * 0.72 + 0.01, 0]}
                r={[0.1, 0.3, 0.05]}
                m={mat('#e6e0d4', 'fabric')}
              />
            )}
          </group>
        )
      })}
      {cushion && (
        <group>
          <mesh
            geometry={cushionGeometry(w - 0.01, 0.06, d - 0.02, 0.03)}
            position={[0, boxH, 0.005]}
            material={mat(item.finish.fabric, 'fabric')}
            castShadow
            receiveShadow
          />
          {/* a throw pillow against the wall at one end */}
          <Pillow
            s={[0.4, 0.38, 0.14]}
            p={[-w / 2 + 0.26, boxH + 0.06 + 0.18, -d / 2 + 0.09]}
            r={[-0.22, 0.1, 0.04]}
            m={mat('#e8e2d3', 'fabric')}
          />
        </group>
      )}
    </group>
  )
}
