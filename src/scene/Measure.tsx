import { Html, Line } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useDecor } from '../decor/store'
import type { Vec3 } from '../model/types'
import { axisLock, distance, edgeLines, formatCm, snapPoint } from '../plan/measure'
import { useMeasure, type Measurement } from '../plan/measureStore'
import { useView } from '../store'
import { pick } from './pick'

// The tape measure: click two points on any surface. Points snap to wall
// faces, jambs, furniture edges, the floor and the ceiling within 5 cm; Shift
// keeps the second point on one axis from the first.

const INK = '#2f6fd6'
const noRaycast = () => {}
/** Pixels a press may travel and still count as a click (more is an orbit drag). */
const CLICK_SLOP = 5

interface Cursor {
  point: Vec3
  snapped: boolean
}

export function Measure() {
  const tool = useView((s) => s.tool)
  const items = useMeasure((s) => s.items)
  return (
    <group>
      {items.map((m) => (
        <Dimension key={m.id} m={m} />
      ))}
      {tool === 'measure' && <Picker />}
    </group>
  )
}

function Picker() {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)
  const decor = useDecor((s) => s.items)
  const start = useMeasure((s) => s.start)
  const [cursor, setCursor] = useState<Cursor | null>(null)
  const edges = useMemo(() => edgeLines(decor), [decor])
  const shift = useRef(false)

  useEffect(() => {
    const el = gl.domElement
    let press: { x: number; y: number } | null = null
    let frame = 0
    const locate = (e: { clientX: number; clientY: number }): Cursor | null => {
      const hit = pick(e, el, camera, scene)
      if (!hit) return null
      const m = useMeasure.getState()
      const points = m.items.flatMap((x) => [x.a, x.b])
      const s = snapPoint([hit.point.x, hit.point.y, hit.point.z], edges.lines, { tops: edges.tops, points })
      if (shift.current && m.start) return { point: axisLock(m.start, s.point), snapped: s.snapped }
      return s
    }
    const onMove = (e: PointerEvent) => {
      shift.current = e.shiftKey
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        setCursor(locate(e))
        invalidate()
      })
    }
    const onDown = (e: PointerEvent) => {
      press = e.button === 0 ? { x: e.clientX, y: e.clientY } : null
    }
    const onUp = (e: PointerEvent) => {
      if (!press || Math.hypot(e.clientX - press.x, e.clientY - press.y) > CLICK_SLOP) return
      press = null
      shift.current = e.shiftKey
      const c = locate(e)
      if (!c) return
      const m = useMeasure.getState()
      if (!m.start) m.begin(c.point)
      else if (distance(m.start, c.point) > 0.005) m.finish(c.point)
      invalidate()
    }
    const onKey = (e: KeyboardEvent) => {
      shift.current = e.shiftKey
    }
    const onLeave = () => setCursor(null)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointerleave', onLeave)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    const cursorStyle = el.style.cursor
    el.style.cursor = 'crosshair'
    return () => {
      cancelAnimationFrame(frame)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      el.style.cursor = cursorStyle
      useMeasure.getState().cancel()
      invalidate()
    }
  }, [gl, camera, scene, edges, invalidate])

  return (
    <group>
      {cursor && <Marker at={cursor.point} snapped={cursor.snapped} />}
      {start && <Marker at={start} snapped />}
      {start && cursor && <Dimension m={{ id: 0, a: start, b: cursor.point }} preview />}
    </group>
  )
}

/** A ring on the surface under the pointer; filled when it has snapped to an edge. */
function Marker({ at, snapped }: { at: Vec3; snapped: boolean }) {
  return (
    <mesh position={at} raycast={noRaycast} renderOrder={12}>
      <sphereGeometry args={[snapped ? 0.018 : 0.012, 16, 12]} />
      <meshBasicMaterial color={snapped ? INK : '#ffffff'} depthTest={false} transparent toneMapped={false} />
    </mesh>
  )
}

function Dimension({ m, preview }: { m: Measurement; preview?: boolean }) {
  const hovered = useMeasure((s) => s.hoverId === m.id)
  const { setHover, remove } = useMeasure.getState()
  const d = distance(m.a, m.b)
  const mid: Vec3 = [(m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2, (m.a[2] + m.b[2]) / 2]
  const ticks = useMemo(() => endTicks(m.a, m.b), [m.a, m.b])
  return (
    <group>
      <Line
        points={[m.a, m.b]}
        color={INK}
        lineWidth={hovered ? 3 : 2}
        dashed={preview}
        dashSize={0.04}
        gapSize={0.03}
        depthTest={false}
        transparent
        renderOrder={11}
        raycast={noRaycast}
      />
      {ticks.map((t, i) => (
        <Line
          key={i}
          points={t}
          color={INK}
          lineWidth={2}
          depthTest={false}
          transparent
          renderOrder={11}
          raycast={noRaycast}
        />
      ))}
      <Html position={mid} center zIndexRange={[20, 10]} className={`measure-label${preview ? ' preview' : ''}`}>
        <span
          data-measure={preview ? undefined : m.id}
          onPointerEnter={preview ? undefined : () => setHover(m.id)}
          onPointerLeave={preview ? undefined : () => setHover(null)}
        >
          {formatCm(d)}
          {!preview && (
            <button type="button" aria-label={`Remove ${formatCm(d)} measurement`} onClick={() => remove(m.id)}>
              ×
            </button>
          )}
        </span>
      </Html>
    </group>
  )
}

const up = new THREE.Vector3(0, 1, 0)
const side = new THREE.Vector3(1, 0, 0)

/** Short end bars across the line, like the ticks on a drawn dimension. */
function endTicks(a: Vec3, b: Vec3): [Vec3, Vec3][] {
  const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  if (dir.lengthSq() < 1e-8) return []
  dir.normalize()
  const across = new THREE.Vector3()
    .crossVectors(dir, Math.abs(dir.y) > 0.9 ? side : up)
    .normalize()
    .multiplyScalar(0.05)
  return [a, b].map((p) => [
    [p[0] - across.x, p[1] - across.y, p[2] - across.z],
    [p[0] + across.x, p[1] + across.y, p[2] + across.z],
  ])
}
