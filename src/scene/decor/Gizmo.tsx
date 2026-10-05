import type { CameraControls } from '@react-three/drei'
import { Html, Line } from '@react-three/drei'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { editRefs, useEdit, type Guides } from '../../decor/edit'
import { collisionsOf, footprintOf, mountOf, type Footprint, type SnapFace } from '../../decor/placement'
import { useDecor } from '../../decor/store'
import type { DecorItem, FurnitureItem } from '../../model/decor'
import { useStructure } from '../../project/structure'

// On-canvas editing aids: floor footprints with overlap warnings, the wall-snap
// indicator, a "can't go here" marker, and the rotate ring. None of it is pickable
// except the ring's handle.

const BLUE = '#3b82f6'
const RED = '#e5484d'
const noRaycast = () => {}

const isFloorFurniture = (i: DecorItem | undefined): i is FurnitureItem =>
  !!i && i.kind === 'furniture' && mountOf(i) === 'surface' && i.at[1] > -1

export function EditOverlays() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    editRefs.camera = camera
    // Test hook (dev only): project plan points to screen pixels, read the stores.
    if (import.meta.env.DEV) {
      ;(window as unknown as { __edit: unknown }).__edit = {
        decor: useDecor,
        edit: useEdit,
        camera: () => camera.position.toArray(),
        toScreen: ([x, y, z]: [number, number, number]) => {
          const r = gl.domElement.getBoundingClientRect()
          const v = new THREE.Vector3(x, y, z).project(camera)
          return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height]
        },
      }
    }
  }, [camera, gl])

  const items = useDecor((s) => s.items)
  const movingId = useDecor((s) => s.movingId)
  const selectedId = useDecor((s) => s.selectedId)
  const selectedIds = useDecor((s) => s.selectedIds)
  const guides = useEdit((s) => s.guides)
  const snap = useEdit((s) => s.snap)
  const invalid = useEdit((s) => s.invalid)
  const rotating = useEdit((s) => s.rotating)

  const active = items.find((i) => i.id === (movingId ?? selectedId))
  // Walls taken out or put back (the Room tab) change what the piece cuts into.
  const structure = useStructure((s) => s.structure)
  const col = useMemo(() => (active && structure ? collisionsOf(active, items) : null), [active, items, structure])
  const bad = !!col && (col.overlaps.length > 0 || col.wall)

  return (
    <group>
      {isFloorFurniture(active) && active.at[1] < 0.3 && (
        <FootprintRect
          fp={footprintOf(active)}
          y={active.at[1]}
          color={bad ? RED : BLUE}
          fill={movingId ? 0.22 : 0.12}
        />
      )}
      {active && !isFloorFurniture(active) && movingId && mountOf(active) === 'surface' && active.at[1] > -1 && (
        <Disc at={active.at} />
      )}
      {col?.overlaps.map((id) => {
        const o = items.find((i) => i.id === id)
        return o && isFloorFurniture(o) ? (
          <FootprintRect key={id} fp={footprintOf(o)} y={o.at[1]} color={RED} fill={0.1} />
        ) : null
      })}
      {selectedIds.length > 1 &&
        items.map((o) =>
          o !== active && selectedIds.includes(o.id) && isFloorFurniture(o) && o.at[1] < 0.3 ? (
            <FootprintRect
              key={`sel-${o.id}`}
              fp={footprintOf(o)}
              y={o.at[1]}
              color={BLUE}
              fill={movingId ? 0.16 : 0.08}
            />
          ) : null,
        )}
      {movingId && snap.map((f, i) => <SnapStrip key={i} face={f} />)}
      {movingId && invalid && <NoDrop point={invalid.point} normal={invalid.normal} />}
      {guides && <GuideLines guides={guides} />}
      {active &&
        !movingId &&
        selectedId === active.id &&
        selectedIds.length <= 1 &&
        mountOf(active) === 'surface' &&
        'rotation' in active &&
        active.at[1] > -1 && <RotateRing item={active} rotating={rotating} />}
    </group>
  )
}

/** A rectangle on the floor: soft fill plus an outline drawn over the piece so its extent reads through it. */
function FootprintRect({ fp, y, color, fill }: { fp: Footprint; y: number; color: string; fill: number }) {
  const { hw, hd } = fp
  const pts = useMemo(
    () =>
      [
        [-hw, 0, -hd],
        [hw, 0, -hd],
        [hw, 0, hd],
        [-hw, 0, hd],
        [-hw, 0, -hd],
      ] as [number, number, number][],
    [hw, hd],
  )
  return (
    <group
      position={[fp.cx, y + 0.006, fp.cz]}
      rotation={[0, THREE.MathUtils.degToRad(fp.rotation), 0]}
      userData={{ editHelper: true }}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={4}>
        <planeGeometry args={[hw * 2, hd * 2]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={fill}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-4}
          toneMapped={false}
        />
      </mesh>
      <Line
        points={pts}
        color={color}
        lineWidth={2}
        transparent
        opacity={0.9}
        depthTest={false}
        renderOrder={11}
        raycast={noRaycast}
      />
    </group>
  )
}

const GUIDE = '#f43f5e'
const GALLERY = '#d97706'
const labelStyle = (color: string): React.CSSProperties => ({
  padding: '1px 5px',
  borderRadius: 4,
  background: color,
  color: '#fff',
  font: '600 10px ui-sans-serif, system-ui, sans-serif',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
})

/** Smart guides during a drag: alignment lines, the gallery line and equal-spacing marks. */
function GuideLines({ guides }: { guides: Guides }) {
  return (
    <group userData={{ editHelper: true }}>
      {guides.align.length > 0 && (
        <Line
          segments
          points={guides.align}
          color={GUIDE}
          lineWidth={1.75}
          depthTest={false}
          renderOrder={13}
          raycast={noRaycast}
        />
      )}
      {guides.gallery.length > 0 && (
        <Line
          segments
          points={guides.gallery}
          color={GALLERY}
          lineWidth={1.25}
          dashed
          dashSize={0.04}
          gapSize={0.03}
          depthTest={false}
          renderOrder={13}
          raycast={noRaycast}
        />
      )}
      {guides.spacing.length > 0 && (
        <Line
          segments
          points={guides.spacing}
          color={GUIDE}
          lineWidth={1.5}
          depthTest={false}
          renderOrder={13}
          raycast={noRaycast}
        />
      )}
      {guides.labels.slice(0, 8).map((l, i) => (
        <Html key={i} position={l.at} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div style={labelStyle(l.kind === 'gallery' ? GALLERY : GUIDE)}>{l.text}</div>
        </Html>
      ))}
    </group>
  )
}

/** Small shadow disc under a plant or lamp being moved. */
function Disc({ at }: { at: [number, number, number] }) {
  return (
    <mesh position={[at[0], at[1] + 0.006, at[2]]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={4}>
      <ringGeometry args={[0.12, 0.15, 48]} />
      <meshBasicMaterial
        color={BLUE}
        transparent
        opacity={0.8}
        depthWrite={false}
        depthTest={false}
        toneMapped={false}
      />
    </mesh>
  )
}

/** Highlights the stretch of wall a floor piece is backed against (or tucked into a corner by). */
function SnapStrip({ face }: { face: SnapFace }) {
  const len = face.to - face.from
  // Taller than the piece so the highlight shows above it, not only behind it.
  const h = Math.min(Math.max(face.height + 0.4, 0.9), 2.4)
  const mid = (face.from + face.to) / 2
  const off = face.normal * 0.004
  const pos: [number, number, number] = face.axis === 'x' ? [face.coord + off, 0, mid] : [mid, 0, face.coord + off]
  // Plane faces +z by default; walls on the x axis face ±x.
  const rotY = face.axis === 'x' ? Math.PI / 2 : 0
  const base = useMemo(
    () =>
      [
        [-len / 2, 0.004, 0],
        [len / 2, 0.004, 0],
      ] as [number, number, number][],
    [len],
  )
  const edges = useMemo(
    () =>
      [
        [-len / 2, 0, 0],
        [-len / 2, h, 0],
        [len / 2, h, 0],
        [len / 2, 0, 0],
      ] as [number, number, number][],
    [len, h],
  )
  return (
    <group position={pos} rotation={[0, rotY, 0]} userData={{ editHelper: true }}>
      <mesh position={[0, h / 2, 0]} raycast={noRaycast} renderOrder={4}>
        <planeGeometry args={[len, h]} />
        <meshBasicMaterial
          color={BLUE}
          transparent
          opacity={0.2}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <Line
        points={edges}
        color={BLUE}
        lineWidth={1.5}
        transparent
        opacity={0.85}
        dashed
        dashSize={0.05}
        gapSize={0.035}
        raycast={noRaycast}
      />
      <Line points={base} color={BLUE} lineWidth={4} raycast={noRaycast} renderOrder={11} depthTest={false} />
    </group>
  )
}

/** A red "no entry" sign on the surface under the pointer. */
function NoDrop({ point, normal }: { point: THREE.Vector3; normal: THREE.Vector3 }) {
  const q = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize()),
    [normal],
  )
  const pos = useMemo(() => point.clone().addScaledVector(normal, 0.01), [point, normal])
  const r = 0.09
  const slash = useMemo(
    () =>
      [
        [-r * 0.7, r * 0.7, 0],
        [r * 0.7, -r * 0.7, 0],
      ] as [number, number, number][],
    [],
  )
  return (
    <group position={pos} quaternion={q} userData={{ editHelper: true }}>
      <mesh raycast={noRaycast} renderOrder={12}>
        <ringGeometry args={[r * 0.82, r, 40]} />
        <meshBasicMaterial color={RED} depthTest={false} transparent toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <Line points={slash} color={RED} lineWidth={3} depthTest={false} renderOrder={12} raycast={noRaycast} />
    </group>
  )
}

const snapStep = (item: DecorItem, free: boolean) => (free ? 1 : item.kind === 'furniture' ? 90 : 15)

/** A ring on the floor around the selected item; drag it to turn the item. */
function RotateRing({ item, rotating }: { item: DecorItem & { rotation: number }; rotating: boolean }) {
  const { camera, gl, scene, controls, invalidate } = useThree()
  const [hover, setHover] = useState(false)
  const [radius, setRadius] = useState(0.4)
  const gesture = useRef<{ a0: number; rot0: number; original: DecorItem } | null>(null)

  // Radius: just outside the item's plan extent. Other kinds are measured from
  // their rendered mesh, which only exists after commit, hence the effect.
  useEffect(() => {
    if (item.kind === 'furniture') {
      // oxlint-disable-next-line react/set-state-in-effect -- reads the scene graph, see above
      setRadius(Math.hypot(item.size[0], item.size[2]) / 2 + 0.12)
      return
    }
    let node: THREE.Object3D | undefined
    scene.traverse((o) => {
      if (o.userData.decorId === item.id) node = o
    })
    if (!node) return
    const box = new THREE.Box3().setFromObject(node)
    const s = box.getSize(new THREE.Vector3())
    // oxlint-disable-next-line react/set-state-in-effect -- reads the scene graph, see above
    setRadius(Math.max(0.18, Math.hypot(s.x, s.z) / 2 + 0.08))
  }, [item, scene])

  const cx = item.at[0]
  const cz = item.at[2]
  const y = item.at[1]

  const angleAt = (clientX: number, clientY: number): number | null => {
    const rect = gl.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    const ray = new THREE.Raycaster()
    ray.setFromCamera(ndc, camera)
    const p = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), new THREE.Vector3())
    if (!p) return null
    return THREE.MathUtils.radToDeg(Math.atan2(p.x - cx, p.z - cz))
  }

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const a0 = angleAt(e.nativeEvent.clientX, e.nativeEvent.clientY)
    if (a0 === null) return
    const cc = controls as unknown as CameraControls | null
    if (cc) cc.enabled = false
    const store = useDecor.getState()
    store.beginGesture()
    gesture.current = { a0, rot0: item.rotation, original: item }
    useEdit.getState().set({ rotating: true, hoverId: null })

    const move = (ev: PointerEvent) => {
      const g = gesture.current
      if (!g) return
      const a = angleAt(ev.clientX, ev.clientY)
      if (a === null) return
      const step = snapStep(item, ev.shiftKey)
      const rotation = (((Math.round((g.rot0 + a - g.a0) / step) * step) % 360) + 360) % 360
      const cur = useDecor.getState().items.find((i) => i.id === item.id)
      if (cur && 'rotation' in cur && cur.rotation !== rotation) useDecor.getState().update(item.id, { rotation })
    }
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('keydown', key, true)
      gesture.current = null
      useDecor.getState().endGesture()
      useEdit.getState().set({ rotating: false })
      if (cc) cc.enabled = true
      invalidate()
    }
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || !gesture.current) return
      ev.stopImmediatePropagation()
      ev.preventDefault()
      // Put back the very same object so history sees no change at all; riders turned with it go back too.
      useDecor.getState().restore([gesture.current.original])
      end()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('keydown', key, true)
  }

  const setHandleHover = (v: boolean) => {
    setHover(v)
    useEdit.getState().set({ handleHover: v })
  }
  useEffect(() => () => useEdit.getState().set({ handleHover: false }), [])

  const active = hover || rotating
  const rot = THREE.MathUtils.degToRad(item.rotation)
  return (
    <group position={[cx, y + 0.02, cz]} userData={{ editHelper: true }}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={6}>
        <ringGeometry args={[radius - 0.012, radius + 0.012, 96]} />
        <meshBasicMaterial
          color={BLUE}
          transparent
          opacity={active ? 0.95 : 0.55}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {/* Knob on the item's front: which way it faces, and where to grab. */}
      <group rotation={[0, rot, 0]}>
        <mesh position={[0, 0, radius]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={7}>
          <circleGeometry args={[active ? 0.06 : 0.05, 32]} />
          <meshBasicMaterial color={BLUE} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.001, radius]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={8}>
          <circleGeometry args={[0.022, 24]} />
          <meshBasicMaterial color="#ffffff" depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
      {/* Generous invisible grab band. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        userData={{ editHelper: true }}
        onPointerDown={onPointerDown}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHandleHover(true)
        }}
        onPointerOut={() => setHandleHover(false)}
      >
        <ringGeometry args={[radius - 0.07, radius + 0.09, 64]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {rotating && (
        <Html position={[0, 0.05, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              padding: '3px 8px',
              borderRadius: 999,
              background: 'rgb(30 29 27 / 0.88)',
              color: '#fff',
              font: '12px ui-sans-serif, system-ui, sans-serif',
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
            }}
          >
            {Math.round(item.rotation)}°
          </div>
        </Html>
      )}
    </group>
  )
}
