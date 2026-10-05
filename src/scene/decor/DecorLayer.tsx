import type { CameraControls } from '@react-three/drei'
import { paintAt } from '../../decor/paint'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { followLead } from '../../decor/arrange'
import { editRefs, useEdit } from '../../decor/edit'
import { translated } from '../../decor/extent'
import { buildGuideCtx, guideMove, worldGuides, type GuideCtx } from '../../decor/guides'
import {
  facingOf,
  facingRotation,
  facingVector,
  mountOf,
  placeAt,
  readIntersection,
  slidesOnFloor,
  type SnapFace,
  type SurfaceHit,
} from '../../decor/placement'
import { settleMoved } from '../../decor/rest'
import { useDecor } from '../../decor/store'
import { UNPLACED_Y, type DecorItem } from '../../model/decor'
import { useView } from '../../store'
import { decorIdOf, firstSolid, hidden } from '../pick'
import { requestShadowUpdate } from '../shadows'
import { cutWalls } from '../cutWalls'
import { Artwork } from './Artwork'
import { ArtworkBoundary } from './ArtworkBoundary'
import { Furniture } from './furniture/Furniture'
import { EditOverlays } from './Gizmo'
import { Lamp } from './Lamp'
import { Plant } from './Plant'

/** Pixels the pointer must travel before a press on an item becomes a drag. */
const DRAG_THRESHOLD = 4

/** First hit that is a usable surface, ignoring decor if asked (floor pieces slide on the floor). */
function surfaceUnder(list: THREE.Intersection[], opts: { skipIds?: Set<string>; skipDecor?: boolean }) {
  for (const i of list) {
    if (!i.face || i.object.userData.editHelper || hidden(i.object)) continue
    const id = decorIdOf(i.object)
    if (id && (opts.skipIds?.has(id) || opts.skipDecor)) continue
    const hit = readIntersection(i)
    if (hit || !id) return { hit, intersection: i }
  }
  return null
}

/** Walk mode (drag looks around) and the measure tool (clicks take points) leave decor alone. */
const sceneTakenOver = () => {
  const v = useView.getState()
  return v.walking || v.tool !== null
}

/** Where the pointer grabbed the moving item, relative to the spot the item would snap to. */
interface Grab {
  x: number
  y: number
  armed: boolean
  /** Selection to narrow to if the press ends without a drag. */
  narrow: string[] | null
  offset: THREE.Vector3
  wall: boolean
}
let grab: Grab | null = null
let lastMoveEvent: Event | null = null
let lastClickEvent: Event | null = null
/** What the current drag snaps to, built on its first move. */
let guideCtx: GuideCtx | null = null
let guideCtxFor: string | null = null
/** The last press on an item, to tell a double-click (select one member of a group). */
let lastPress: { id: string; t: number } | null = null
const DOUBLE_MS = 400

function clearGuides() {
  guideCtx = null
  guideCtxFor = null
  if (useEdit.getState().guides) useEdit.getState().set({ guides: null })
}

/** A floor piece backed onto a wall only slides along it: no guide may pull it off. */
function locksOf(faces: SnapFace[]) {
  return { lockU: faces.some((f) => f.axis === 'x'), lockV: faces.some((f) => f.axis === 'z') }
}

/**
 * Moves the dragged (or placed) item to its new spot, brings the rest of the
 * selection along, and snaps the lot to smart guides unless `free`.
 */
function moveSelection(item: DecorItem, patch: Partial<DecorItem>, faces: SnapFace[], free: boolean) {
  const s = useDecor.getState()
  const leadTo = { ...item, ...patch } as DecorItem
  const leadFrom = s.backup ?? item
  const moved: DecorItem[] = [
    leadTo,
    ...s.followers.map((f) => ({ ...f, ...followLead(leadFrom, leadTo, f) }) as DecorItem),
  ]
  let guides = null
  if (!free) {
    if (!guideCtx || guideCtxFor !== item.id) {
      guideCtx = buildGuideCtx(s.items, new Set(moved.map((m) => m.id)))
      guideCtxFor = item.id
    }
    const g = guideMove(guideCtx, leadTo, moved, locksOf(faces))
    if (g) {
      if (g.result.du || g.result.dv)
        for (let i = 0; i < moved.length; i++)
          moved[i] = { ...moved[i], at: translated(moved[i].at, g.delta) } as DecorItem
      guides = worldGuides(g)
    }
  }
  // The pointer picked the surface; each piece rests on what is under its own footprint
  // (the grab offset and a piece's width can put it over something else: a cooktop, the floor).
  if (mountOf(item) === 'surface') moved.splice(0, moved.length, ...settleMoved(moved))
  s.applyPatches(Object.fromEntries(moved.map((m) => [m.id, m])))
  const edit = useEdit.getState()
  if (guides || edit.guides) edit.set({ guides })
}

const plane = new THREE.Plane()
const tmp = new THREE.Vector3()

function grabOffset(item: DecorItem, ray: THREE.Ray): { offset: THREE.Vector3; wall: boolean } {
  const zero = { offset: new THREE.Vector3(), wall: false }
  const mount = mountOf(item)
  if (mount === 'wall' && 'facing' in item && item.facing) {
    const [nx, nz] = facingVector(item.facing)
    const n = new THREE.Vector3(nx, 0, nz)
    plane.setFromNormalAndCoplanarPoint(n, tmp.set(...item.at))
    const p = ray.intersectPlane(plane, new THREE.Vector3())
    if (!p) return zero
    const patch = placeAt(item, { point: p, normal: n, kind: 'wall', host: 'host' in item ? item.host : undefined })
    if (!patch?.at) return zero
    const offset = new THREE.Vector3(...item.at).sub(new THREE.Vector3(...patch.at))
    return offset.length() < 2 ? { offset, wall: true } : zero
  }
  plane.set(new THREE.Vector3(0, 1, 0), -(mount === 'ceiling' ? 0 : item.at[1]))
  const p = ray.intersectPlane(plane, new THREE.Vector3())
  if (!p) return zero
  const offset = new THREE.Vector3(item.at[0] - p.x, 0, item.at[2] - p.z)
  return offset.length() < 2 ? { offset, wall: false } : zero
}

function applyGrab(item: DecorItem, hit: SurfaceHit) {
  if (!grab) return
  if (hit.kind === 'wall') {
    if (grab.wall && 'facing' in item && item.facing === facingOf(hit.normal)) hit.point.add(grab.offset)
  } else if (!grab.wall) {
    hit.point.x += grab.offset.x
    hit.point.z += grab.offset.z
  }
}

/**
 * Wraps the architecture and decor so pointer events over them can pick,
 * place and drag decor. Each native event is handled once, from the full list
 * of intersections, so faded walls and the moving item itself are looked past.
 */
export function SurfaceEvents({ children }: { children: ReactNode }) {
  const controls = useThree((s) => s.controls) as unknown as CameraControls | null
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)

  /** Shift-drag on the room: a rubber band that adds what it covers to the selection. */
  const startMarquee = (e: ThreeEvent<PointerEvent>) => {
    const x0 = e.nativeEvent.clientX
    const y0 = e.nativeEvent.clientY
    if (controls) controls.enabled = false
    const move = (ev: PointerEvent) => useEdit.getState().set({ marquee: { x0, y0, x1: ev.clientX, y1: ev.clientY } })
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (controls) controls.enabled = true
      const m = useEdit.getState().marquee
      useEdit.getState().set({ marquee: null })
      if (!m || Math.abs(m.x1 - m.x0) < DRAG_THRESHOLD || Math.abs(m.y1 - m.y0) < DRAG_THRESHOLD) return
      const [l, r] = [Math.min(m.x0, m.x1), Math.max(m.x0, m.x1)]
      const [t, b] = [Math.min(m.y0, m.y1), Math.max(m.y0, m.y1)]
      const rect = gl.domElement.getBoundingClientRect()
      const s = useDecor.getState()
      const v = new THREE.Vector3()
      const inside = s.items.filter((i) => {
        if (i.at[1] <= UNPLACED_Y) return false
        const host = 'host' in i ? i.host : undefined
        if (host && cutWalls.has(host)) return false
        const lift = i.kind === 'furniture' && mountOf(i) !== 'ceiling' ? i.size[1] / 2 : 0
        v.set(i.at[0], i.at[1] + lift, i.at[2]).project(camera)
        if (v.z > 1) return false
        const x = rect.left + ((v.x + 1) / 2) * rect.width
        const y = rect.top + ((1 - v.y) / 2) * rect.height
        return x >= l && x <= r && y >= t && y <= b
      })
      // Whole groups: a band over one member takes the group.
      const groups = new Set(inside.map((i) => i.groupId).filter(Boolean))
      const ids = s.items.filter((i) => inside.includes(i) || (i.groupId && groups.has(i.groupId))).map((i) => i.id)
      if (ids.length) s.selectMany([...s.selectedIds, ...ids], s.selectedId ?? ids[ids.length - 1])
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    const s = useDecor.getState()
    // Paint brush: a press on a wall paints the side of it under the pointer.
    const brush = useEdit.getState().paintBrush
    if (brush !== null && e.button === 0 && !s.movingId) {
      const first = firstSolid(e.intersections)
      const hit = first && !decorIdOf(first.object) ? readIntersection(first) : null
      if (hit?.kind === 'wall' && hit.host) {
        e.stopPropagation()
        paintAt(hit.host, hit.point.x, hit.point.z, [hit.normal.x, hit.normal.z], brush)
      }
      return
    }
    if (s.movingId || e.button !== 0 || sceneTakenOver()) return
    const first = firstSolid(e.intersections)
    const id = first ? decorIdOf(first.object) : null
    // Architecture under the pointer: leave the press to the camera (Shift: rubber band).
    if (!id) {
      if (e.nativeEvent.shiftKey) {
        e.stopPropagation()
        startMarquee(e)
      }
      return
    }
    e.stopPropagation()
    const item = s.items.find((i) => i.id === id)
    if (!item) return
    const now = performance.now()
    const double = !!lastPress && lastPress.id === id && now - lastPress.t < DOUBLE_MS
    lastPress = { id, t: now }
    // Shift+click adds to (or takes out of) the selection; no drag.
    if (e.nativeEvent.shiftKey) {
      s.toggleSelect(id, { single: e.nativeEvent.altKey })
      return
    }
    // A click takes the item's whole group; Alt+click or a double-click just the one piece.
    const single = e.nativeEvent.altKey || double
    // Pressing a piece of a larger selection keeps it (to drag it all); a click without a drag narrows it.
    const unit = !single && item.groupId ? s.items.filter((i) => i.groupId === item.groupId).map((i) => i.id) : [id]
    const narrow = s.selectedIds.length > unit.length && s.selectedIds.includes(id) ? unit : null
    s.pick(id, { single })
    s.startDragging(id)
    grab = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY, armed: false, narrow, ...grabOffset(item, e.ray) }
    if (controls) controls.enabled = false
  }

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (e.nativeEvent === lastMoveEvent) return
    lastMoveEvent = e.nativeEvent
    e.stopPropagation()
    editRefs.pointerInCanvas = true
    const s = useDecor.getState()
    const edit = useEdit.getState()

    if (!s.movingId) {
      if (edit.rotating) return
      const first = firstSolid(e.intersections)
      const hoverId = first ? decorIdOf(first.object) : null
      if (hoverId !== edit.hoverId) edit.set({ hoverId })
      editRefs.lastHit = surfaceUnder(e.intersections, {})?.hit ?? null
      editRefs.lastFloorHit = surfaceUnder(e.intersections, { skipDecor: true })?.hit ?? null
      return
    }

    const item = s.items.find((i) => i.id === s.movingId)
    if (!item) return
    if (!s.isDraft && grab && !grab.armed) {
      if (Math.hypot(e.nativeEvent.clientX - grab.x, e.nativeEvent.clientY - grab.y) < DRAG_THRESHOLD) return
      grab.armed = true
    }
    if (edit.hoverId) edit.set({ hoverId: null })
    // Floor furniture slides along the floor, wall pieces along walls: neither climbs onto other decor.
    const mount = mountOf(item)
    // Tabletop pieces (mugs, a mixer, speakers) do climb onto desks, sideboards and shelves.
    const skipDecor = mount === 'wall' || slidesOnFloor(item)
    const moving = new Set([item.id, ...s.followers.map((f) => f.id)])
    const under = surfaceUnder(e.intersections, { skipIds: moving, skipDecor })
    if (!under) return
    const hit = under.hit
    const report = { snap: [] as ReturnType<typeof useEdit.getState>['snap'] }
    const ev = e.nativeEvent
    // A selection moves rigidly: no turning to back onto a wall.
    const free = ev.altKey || s.followers.length > 0
    const pointed = hit?.point.clone()
    let patch = hit && (applyGrab(item, hit), placeAt(item, hit, { free, report }))
    // The pointer picks the surface. If the grab offset would carry a piece off it
    // (grabbed high on its front, then pointed at a shelf top), center it on the pointer.
    if (patch?.at && hit && pointed && mount === 'surface' && !slidesOnFloor(item) && !hit.point.equals(pointed)) {
      const rested = settleMoved([{ ...item, ...patch } as DecorItem])[0]
      if (rested.at[1] < pointed.y - 0.02) patch = placeAt(item, { ...hit, point: pointed }, { free, report })
    }
    if (patch) {
      // Alt (like wall snapping) or Cmd/Ctrl turn the smart guides off.
      moveSelection(item, patch, report.snap, ev.altKey || ev.metaKey || ev.ctrlKey)
      edit.set({ invalid: null, snap: report.snap })
    } else {
      edit.set({
        invalid: { point: under.intersection.point.clone(), normal: hit?.normal ?? new THREE.Vector3(0, 1, 0) },
        snap: [],
        guides: null,
      })
    }
  }

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.nativeEvent === lastClickEvent) return
    lastClickEvent = e.nativeEvent
    e.stopPropagation()
    const s = useDecor.getState()
    if (e.delta > 6 || (sceneTakenOver() && !s.movingId)) return
    if (s.isDraft && s.movingId) {
      const item = s.items.find((i) => i.id === s.movingId)
      if (item && item.at[1] > UNPLACED_Y && !useEdit.getState().invalid) {
        s.stopMoving()
        useEdit.getState().set({ snap: [], invalid: null })
        clearGuides()
      }
      return
    }
    // A click on the room (not on an item) clears the selection; Shift keeps it.
    const first = firstSolid(e.intersections)
    if ((!first || !decorIdOf(first.object)) && !e.nativeEvent.shiftKey) s.select(null)
  }

  const onPointerLeave = () => {
    editRefs.pointerInCanvas = false
    const edit = useEdit.getState()
    if (edit.hoverId) edit.set({ hoverId: null })
  }

  // What surface pieces settle onto: the architecture and decor under these handlers.
  const root = useRef<THREE.Group>(null)
  useEffect(() => {
    editRefs.sceneRoot = root.current
    return () => {
      if (editRefs.sceneRoot === root.current) editRefs.sceneRoot = null
    }
  }, [])

  return (
    <group
      ref={root}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onClick={onClick}
      onPointerLeave={onPointerLeave}
    >
      {children}
    </group>
  )
}

export function DecorLayer() {
  const items = useDecor((s) => s.items)
  const selectedIds = useDecor((s) => s.selectedIds)
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const controls = useThree((s) => s.controls) as unknown as CameraControls | null
  const gl = useThree((s) => s.gl)
  useEffect(() => requestShadowUpdate(), [items])

  // End a drag wherever the pointer is released.
  useEffect(() => {
    const up = () => {
      const s = useDecor.getState()
      if (s.movingId && !s.isDraft) {
        s.stopMoving()
        useEdit.getState().set({ snap: [], invalid: null })
        clearGuides()
        if (grab && !grab.armed && grab.narrow) s.selectMany(grab.narrow, s.selectedId)
      }
      grab = null
      if (controls) controls.enabled = true
    }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [controls])

  // Cursor: grab over items and the rotate handle, grabbing while dragging, not-allowed over a bad drop target.
  const hoverId = useEdit((s) => s.hoverId)
  const handleHover = useEdit((s) => s.handleHover)
  const rotating = useEdit((s) => s.rotating)
  const invalid = useEdit((s) => s.invalid !== null)
  const moving = useDecor((s) => (s.movingId ? (s.isDraft ? 'draft' : 'drag') : null))
  useEffect(() => {
    const c =
      rotating || moving === 'drag'
        ? 'grabbing'
        : moving && invalid
          ? 'not-allowed'
          : moving === 'draft'
            ? 'copy'
            : hoverId || handleHover
              ? 'grab'
              : ''
    gl.domElement.style.cursor = c
  }, [gl, hoverId, handleHover, rotating, invalid, moving])
  useEffect(() => {
    if (!moving) {
      useEdit.getState().set({ snap: [], invalid: null })
      clearGuides()
    }
  }, [moving])

  return (
    <group>
      {items.map((item) => (
        <DecorNode key={item.id} item={item} selected={selected.has(item.id)} />
      ))}
      <EditOverlays />
    </group>
  )
}

function DecorNode({ item, selected }: { item: DecorItem; selected: boolean }) {
  const ref = useRef<THREE.Group>(null)
  const host = 'host' in item ? item.host : undefined
  const wallMounted = mountOf(item) === 'wall'
  const rotationY =
    wallMounted && 'facing' in item && item.facing
      ? facingRotation[item.facing]
      : THREE.MathUtils.degToRad('rotation' in item ? item.rotation : 0)
  const hovered = useEdit((s) => s.hoverId === item.id)

  useFrame(() => {
    if (!ref.current) return
    ref.current.visible = item.at[1] > UNPLACED_Y && !(host && cutWalls.has(host))
  })

  return (
    <group ref={ref} position={item.at} rotation={[0, rotationY, 0]} userData={{ decorId: item.id, host }}>
      <Suspense fallback={null}>
        {item.kind === 'artwork' && (
          // Keyed by image: picking another image after a failed one tries again.
          <ArtworkBoundary key={item.image} item={item}>
            <Artwork item={item} />
          </ArtworkBoundary>
        )}
        {item.kind === 'plant' && <Plant item={item} />}
        {item.kind === 'lamp' && <Lamp item={item} />}
        {item.kind === 'furniture' && <Furniture item={item} />}
      </Suspense>
      {selected ? (
        <OutlineBox target={ref} color="#3b82f6" opacity={1} />
      ) : (
        hovered && <OutlineBox target={ref} color="#3b82f6" opacity={0.45} />
      )}
    </group>
  )
}

/** A thin box around an item, drawn in world space over everything. */
function OutlineBox({
  target,
  color,
  opacity,
}: {
  target: React.RefObject<THREE.Group | null>
  color: string
  opacity: number
}) {
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)
  const helper = useMemo(() => {
    const h = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color(color))
    const m = h.material as THREE.LineBasicMaterial
    m.depthTest = false
    m.transparent = opacity < 1
    m.opacity = opacity
    h.renderOrder = 10
    h.userData.editHelper = true
    h.raycast = () => {}
    return h
  }, [color, opacity])
  useEffect(() => {
    scene.add(helper)
    invalidate()
    return () => {
      scene.remove(helper)
      helper.dispose()
      invalidate()
    }
  }, [scene, helper, invalidate])
  useFrame(() => {
    const t = target.current
    if (!t) return
    helper.visible = t.visible
    helper.box.setFromObject(t).expandByScalar(0.02)
  })
  return null
}
