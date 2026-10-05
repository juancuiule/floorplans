import type { CameraControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useDecor } from '../decor/store'
import type { Vec2 } from '../model/types'
import type { Obstacle } from '../plan/obstacles'
import { ENTRY_SPOT, EYE, insideFlat, resolve, walk, walkObstacles } from '../plan/walk'
import { onStructure } from '../project/structure'
import { useView } from '../store'
import { pick, worldNormal } from './pick'

// First-person walk mode. It steers the CameraControls (disabled for input)
// through setLookAt, so the orbit controls always know where the camera is and
// leaving is a normal smooth camera transition back to the saved view.

const WALK_FOV = 70
const SPEED = 1.3
const FAST = 2.8
/** How quickly the walking speed follows the keys (1/s): about a third of a second to full speed. */
const ACCEL = 9
const TURN_SPEED = 1.9
/** Drag-to-look sensitivity, radians per pixel. */
const LOOK = 0.0042
const PITCH_LIMIT = 1.35
const MAX_DT = 1 / 20

const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'])

export interface WalkPose {
  x: number
  z: number
  eye: number
  yaw: number
  pitch: number
}

declare global {
  interface Window {
    /** Test hook: the walker's current pose while walking. */
    __walk?: () => WalkPose | null
    /** Test hook (dev only): stand somewhere, facing yaw (radians from +x toward +z). */
    __walkTo?: (x: number, z: number, yaw: number, pitch?: number) => void
  }
}

/** Keys that belong to a focused control: text fields, and the arrows on a slider or select. */
function ownedByControl(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  if (!el?.closest) return false
  if (el.closest('textarea, [contenteditable="true"]')) return true
  if (el.closest('select, input[type="range"]')) return e.key.startsWith('Arrow')
  const input = el.closest('input') as HTMLInputElement | null
  return !!input && !['checkbox', 'radio', 'button', 'color'].includes(input.type)
}

export function Walk() {
  const controls = useThree((s) => s.controls) as unknown as CameraControls | null
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)
  const walking = useView((s) => s.walking)

  const pose = useRef<WalkPose>({ x: ENTRY_SPOT[0], z: ENTRY_SPOT[1], eye: EYE, yaw: 0, pitch: 0 })
  const vel = useRef<Vec2>([0, 0])
  const keys = useRef(new Set<string>())
  const shift = useRef(false)
  const lookDirty = useRef(false)
  const fovTarget = useRef<number | null>(null)
  const obstacles = useRef<Obstacle[]>([])

  // Furniture is in the way too; follow edits, and walls taken out or put back.
  useEffect(() => {
    obstacles.current = walkObstacles(useDecor.getState().items)
    const offStructure = onStructure(() => (obstacles.current = walkObstacles(useDecor.getState().items)))
    const offDecor = useDecor.subscribe((s, p) => {
      if (s.items !== p.items) obstacles.current = walkObstacles(s.items)
    })
    return () => {
      offStructure()
      offDecor()
    }
  }, [])

  const apply = useCallback(
    (transition: boolean) => {
      if (!controls) return
      const p = pose.current
      const c = Math.cos(p.pitch)
      void controls.setLookAt(
        p.x,
        p.eye,
        p.z,
        p.x + Math.cos(p.yaw) * c,
        p.eye + Math.sin(p.pitch),
        p.z + Math.sin(p.yaw) * c,
        transition,
      )
      // Write the camera now rather than on the next frame's controls update.
      if (!transition) controls.update(0)
    },
    [controls],
  )

  // Enter and leave.
  useEffect(() => {
    if (!walking || !controls) return
    const v = useView.getState()
    const saved = {
      pos: controls.getPosition(new THREE.Vector3()),
      target: controls.getTarget(new THREE.Vector3()),
      fov: camera.fov,
      nonce: v.presetNonce,
    }
    const p = pose.current
    const from = v.walkFrom ?? ENTRY_SPOT
    const [x, z] = resolve(from, obstacles.current)
    // Face away from where the camera was (into the room it was looking at); from the entry, down the flat.
    let yaw = 0
    if (v.walkFrom) {
      const dx = x - saved.pos.x
      const dz = z - saved.pos.z
      if (Math.hypot(dx, dz) > 0.3) yaw = Math.atan2(dz, dx)
      else {
        const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
        yaw = Math.atan2(f.z, f.x)
      }
    }
    Object.assign(p, { x, z, yaw, pitch: -0.06, eye: v.eyeHeight })
    vel.current = [0, 0]
    controls.enabled = false
    fovTarget.current = WALK_FOV
    apply(true)
    invalidate()
    const cursor = gl.domElement.style.cursor
    gl.domElement.style.cursor = 'grab'
    const held = keys.current
    return () => {
      held.clear()
      controls.enabled = true
      gl.domElement.style.cursor = cursor
      // A camera preset picked while walking takes over; otherwise go back to the orbit view.
      if (useView.getState().presetNonce === saved.nonce) {
        fovTarget.current = saved.fov
        void controls.setLookAt(
          saved.pos.x,
          saved.pos.y,
          saved.pos.z,
          saved.target.x,
          saved.target.y,
          saved.target.z,
          true,
        )
      } else fovTarget.current = null
      invalidate()
    }
  }, [walking, controls, camera, gl, invalidate, apply])

  // Keys: held movement keys drive the loop; the loop only runs while something changes.
  useEffect(() => {
    if (!walking) return
    const down = (e: KeyboardEvent) => {
      shift.current = e.shiftKey
      if (e.metaKey || e.ctrlKey || e.altKey || ownedByControl(e)) return
      const k = e.key.toLowerCase()
      if (!MOVE_KEYS.has(k)) return
      e.preventDefault()
      keys.current.add(k)
      invalidate()
    }
    const up = (e: KeyboardEvent) => {
      shift.current = e.shiftKey
      keys.current.delete(e.key.toLowerCase())
      invalidate()
    }
    const blur = () => keys.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [walking, invalidate])

  // Drag to look (grab the view and pull it around, like a photo sphere).
  useEffect(() => {
    if (!walking) return
    const el = gl.domElement
    let drag: { x: number; y: number; id: number } | null = null
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId }
      el.style.cursor = 'grabbing'
    }
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const p = pose.current
      p.yaw -= (e.clientX - drag.x) * LOOK
      p.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, p.pitch + (e.clientY - drag.y) * LOOK))
      drag.x = e.clientX
      drag.y = e.clientY
      lookDirty.current = true
      invalidate()
    }
    const onUp = () => {
      drag = null
      el.style.cursor = 'grab'
    }
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [walking, gl, invalidate])

  // Double-click the floor: walk from there (or hop there while walking).
  useEffect(() => {
    const el = gl.domElement
    const onDbl = (e: MouseEvent) => {
      // Not while measuring or while a piece follows the pointer (placing, moving).
      if (useView.getState().tool || useDecor.getState().movingId) return
      const hit = pick(e, el, camera, scene)
      if (!hit || hit.point.y > 0.1 || worldNormal(hit).y < 0.7 || !insideFlat(hit.point.x, hit.point.z)) return
      const v = useView.getState()
      if (!v.walking) {
        v.enterWalk([hit.point.x, hit.point.z])
        return
      }
      const [x, z] = resolve([hit.point.x, hit.point.z], obstacles.current)
      Object.assign(pose.current, { x, z })
      vel.current = [0, 0]
      apply(true)
      invalidate()
    }
    el.addEventListener('dblclick', onDbl)
    return () => el.removeEventListener('dblclick', onDbl)
  })

  useEffect(() => {
    window.__walk = () => (useView.getState().walking ? { ...pose.current } : null)
    if (import.meta.env.DEV) {
      window.__walkTo = (x, z, yaw, pitch = -0.06) => {
        if (!useView.getState().walking) return
        const [rx, rz] = resolve([x, z], obstacles.current)
        Object.assign(pose.current, { x: rx, z: rz, yaw, pitch })
        vel.current = [0, 0]
        apply(false)
        invalidate()
      }
    }
    return () => {
      delete window.__walk
      delete window.__walkTo
    }
  })

  // Eye height changes glide.
  useEffect(() => useView.subscribe((s, p) => void (s.eyeHeight !== p.eyeHeight && invalidate())), [invalidate])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, MAX_DT)
    const ft = fovTarget.current
    if (ft !== null) {
      camera.fov += (ft - camera.fov) * (1 - Math.exp(-8 * dt))
      if (Math.abs(ft - camera.fov) < 0.05) {
        camera.fov = ft
        fovTarget.current = null
      } else invalidate()
      camera.updateProjectionMatrix()
    }
    if (!useView.getState().walking) return

    const p = pose.current
    const k = keys.current
    const fwd = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0)
    const side = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0)
    const turn = (k.has('arrowright') ? 1 : 0) - (k.has('arrowleft') ? 1 : 0)
    let changed = lookDirty.current
    lookDirty.current = false

    if (turn) {
      p.yaw += turn * TURN_SPEED * dt
      changed = true
    }

    // Accelerate toward the speed the keys ask for.
    const speed = shift.current ? FAST : SPEED
    const cy = Math.cos(p.yaw)
    const sy = Math.sin(p.yaw)
    let tx = cy * fwd - sy * side
    let tz = sy * fwd + cy * side
    const tl = Math.hypot(tx, tz)
    if (tl > 0) {
      tx = (tx / tl) * speed
      tz = (tz / tl) * speed
    }
    const v = vel.current
    const a = 1 - Math.exp(-ACCEL * dt)
    v[0] += (tx - v[0]) * a
    v[1] += (tz - v[1]) * a
    if (!tl && Math.hypot(v[0], v[1]) < 0.01) v[0] = v[1] = 0
    if (v[0] || v[1]) {
      const [nx, nz] = walk([p.x, p.z], [v[0] * dt, v[1] * dt], obstacles.current)
      // Walking into a wall does not build up speed.
      if (dt > 0) {
        v[0] = tl ? v[0] : (nx - p.x) / dt
        v[1] = tl ? v[1] : (nz - p.z) / dt
      }
      if (nx !== p.x || nz !== p.z) changed = true
      p.x = nx
      p.z = nz
    }

    const eye = useView.getState().eyeHeight
    if (Math.abs(eye - p.eye) > 0.001) {
      p.eye += (eye - p.eye) * (1 - Math.exp(-7 * dt))
      if (Math.abs(eye - p.eye) <= 0.001) p.eye = eye
      changed = true
    }

    if (changed) apply(false)
    if (changed || tl || turn || v[0] || v[1]) invalidate()
  })

  return null
}
