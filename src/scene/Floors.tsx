import { invalidate, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Ceiling, Rect } from '../model/types'
import { plan, project } from '../project'
import { useActiveShell } from '../project/structure'
import { requestShadowUpdate } from './shadows'
import { Box } from './Box'
import { showsHexBlend, type Finishes } from '../model/finishes'
import { FLOORS } from '../project/finishes'
import { currentFinishes, faceDims, makeMaterial, onFinishes, sharedEdgeMaterial, sharedMaterial } from './materials'
import { FLOOR_Z1, hash, hexScatter } from './patterns'

const FLOOR_T = 0.012
const noRaycast = () => {}
const INLAY_T = 0.006

function rectBox(r: Rect, y0: number, y1: number) {
  return {
    size: [r[2] - r[0], y1 - y0, r[3] - r[1]] as [number, number, number],
    position: [(r[0] + r[2]) / 2, (y0 + y1) / 2, (r[1] + r[3]) / 2] as [number, number, number],
  }
}

export function Floors() {
  const { slab, baseFloors, rooms } = project.shell
  // Under a removed partition: the neighboring room's floor runs on to the old centerline.
  const { floorFills } = useActiveShell()
  const edge = sharedEdgeMaterial()
  return (
    <group>
      <Box
        {...rectBox(slab.rect, -slab.thickness - FLOOR_T, -FLOOR_T)}
        material={sharedMaterial(slab.material)}
        edgeMaterial={edge}
      />
      {baseFloors.map((f) => (
        <FloorBox key={f.id} rect={f.rect} y0={-FLOOR_T} y1={0} material={f.material} />
      ))}
      {rooms
        .filter((r) => r.floor)
        .map((r) => (
          <FloorBox key={r.id} rect={r.rect} y0={0} y1={INLAY_T} material={r.floor!} />
        ))}
      {floorFills.map((f) => (
        <FloorBox key={f.id} rect={f.rect} y0={0} y1={INLAY_T} material={f.material} />
      ))}
      {BLEND && <HexBlend />}
    </group>
  )
}

function FloorBox({ rect, y0, y1, material }: { rect: Rect; y0: number; y1: number; material: string }) {
  const { box, mat } = useMemo(() => {
    const box = rectBox(rect, y0, y1)
    // Patterns are anchored to the plan (x = 0, z = FLOOR_Z1, the far edge of the base floors), so they run on across neighboring floors.
    return { box, mat: makeMaterial(material, faceDims(box.size), [rect[0], FLOOR_Z1 - rect[3]]) }
  }, [rect, y0, y1, material])
  return <Box {...box} material={mat} castShadow={false} />
}

/** Where the hall's hexagons spill into the next room, from the plan (none: the option does nothing). */
const BLEND = plan.hexBlend
const BLEND_RECT: Rect = BLEND?.rect ?? [0, 0, 0, 0]

/** Density of scattered hexagons: solid at the passage, thinning out into the room. */
function blendKeep(x: number, z: number, col: number, row: number) {
  const [fx, fz] = BLEND!.focus
  const dz = Math.max(0, Math.abs(z - fz) - BLEND!.halfSpan)
  const d = Math.hypot(x - fx, dz * 1.6)
  const p = Math.min(1, Math.max(0, 1 - (d - 0.12) / 1.05)) ** 1.6
  return hash(col, row, 91) < p
}

/**
 * The hex-to-wood transition: a see-through layer just above the main-room
 * floor with the hall's hexagons (alpha-tested, no blending). It exists from
 * the start and only its texture and visibility change with the finishes.
 */
function HexBlend() {
  const { geometry, position, mat } = useMemo(() => {
    const [x0, z0, x1, z1] = BLEND_RECT
    // A plane with the same UV layout as a box's top face (v runs from +z to −z).
    const geometry = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2)
    const position: [number, number, number] = [(x0 + x1) / 2, 0.0015, (z0 + z1) / 2]
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, alphaTest: 0.5 })
    return { geometry, position, mat }
  }, [])
  const ref = useRef<THREE.Mesh>(null)
  useEffect(() => {
    let key = ''
    const apply = (f: Finishes) => {
      const on = showsHexBlend(f)
      const def = FLOORS[f.floors.hall].def
      const next = on ? `${def.color}|${JSON.stringify(def.pattern)}` : ''
      if (ref.current) ref.current.visible = on
      if (next === key) return
      key = next
      if (!on) return
      const old = mat.map
      mat.map = hexScatter(def, BLEND_RECT, blendKeep)
      mat.roughness = def.roughness ?? 0.6
      mat.needsUpdate = true
      old?.dispose()
      invalidate()
    }
    apply(currentFinishes())
    return onFinishes(apply)
  }, [mat])
  return (
    // Not a surface: clicks and placement go to the floor underneath.
    <mesh
      ref={ref}
      visible={false}
      geometry={geometry}
      position={position}
      material={mat}
      receiveShadow
      raycast={noRaycast}
    />
  )
}

export function Ceilings() {
  const { ceilings } = useActiveShell()
  useEffect(() => {
    requestShadowUpdate()
    invalidate()
  }, [ceilings])
  return (
    <group>
      {ceilings.map((c) => (
        <CeilingView key={c.id} ceiling={c} />
      ))}
    </group>
  )
}

/** Ceilings only show while the camera is below them, so orbiting from above looks into the rooms. */
function CeilingView({ ceiling: c }: { ceiling: Ceiling }) {
  const ref = useRef<THREE.Mesh>(null)
  const { geometry, position } = useMemo(() => {
    const [x0, z0, x1, z1] = c.rect
    return {
      geometry: new THREE.PlaneGeometry(x1 - x0, z1 - z0),
      position: [(x0 + x1) / 2, c.height, (z0 + z1) / 2] as [number, number, number],
    }
  }, [c])
  useFrame(({ camera }) => {
    if (ref.current) ref.current.visible = camera.position.y < c.height - 0.01
  })
  return (
    <mesh
      ref={ref}
      geometry={geometry}
      position={position}
      rotation={[Math.PI / 2, 0, 0]}
      material={sharedMaterial(c.material)}
      receiveShadow
    />
  )
}
