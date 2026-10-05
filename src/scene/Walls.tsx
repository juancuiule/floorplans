import { invalidate, useFrame } from '@react-three/fiber'
import { paintFaces, type PaintFace } from '../project/paintFaces'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { outwardNormal, wallFrame, wallPieces } from '../geometry/walls'
import type { Bulge, Opening, Shell, Vec3, Wall } from '../model/types'
import { INSIDE } from '../project/derived'
import { useActiveShell, useStructure } from '../project/structure'
import { useView } from '../store'
import { Box } from './Box'
import { Merged } from './Merged'
import { applyFade, faceDims, makeEdgeMaterial, makeMaterial } from './materials'
import { requestShadowUpdate } from './shadows'
import { cutWalls } from './cutWalls'

/** Height of the wall stub left standing when dollhouse mode cuts a wall away. */
export const STUB_HEIGHT = 0.3
const XRAY_ALPHA = 0.14
const FADE_SPEED = 9

/** Longest step a fade takes in one frame: after an idle spell (on-demand rendering) dt can be seconds. */
const MAX_DT = 1 / 30

export function Walls() {
  // Partitions taken out in this layout are not mounted at all: no meshes, no draw calls.
  const { walls, soffits, parts } = useActiveShell()
  // Paintable faces of the walls standing now, per wall.
  const faces = useMemo(() => {
    const byWall = new Map<string, PaintFace[]>()
    for (const f of paintFaces(walls)) byWall.set(f.wall, [...(byWall.get(f.wall) ?? []), f])
    return byWall
  }, [walls])
  // The fade runs in useFrame; a mode switch has to wake the render loop.
  useEffect(
    () => useView.subscribe((s, prev) => void ((s.mode !== prev.mode || s.walking !== prev.walking) && invalidate())),
    [],
  )
  // Walls came or went: the shadow maps are stale.
  useEffect(() => {
    requestShadowUpdate()
    invalidate()
  }, [walls, soffits])
  return (
    <group>
      {[...walls, ...soffits].map((w) => {
        const p = parts.get(w.id)
        return (
          <WallView
            key={w.id}
            wall={w}
            bulges={p?.bulges ?? NONE}
            accents={p?.accents ?? NONE}
            faces={faces.get(w.id) ?? NO_FACES}
          />
        )
      })}
      <WallGhosts />
    </group>
  )
}

const NONE: never[] = []

/**
 * A dashed outline on the floor where removed walls stood, to compare with the
 * plan as built. One line mesh for all of them; nothing when no wall is removed.
 */
function WallGhosts() {
  const { ghosts } = useActiveShell()
  const on = useStructure((s) => s.ghosts)
  const lines = useMemo(() => {
    if (!ghosts.length) return null
    const pts: number[] = []
    const y = 0.008
    for (const {
      rect: [x0, z0, x1, z1],
    } of ghosts) {
      const c = [
        [x0, z0],
        [x1, z0],
        [x1, z1],
        [x0, z1],
      ]
      for (let i = 0; i < 4; i++) pts.push(c[i][0], y, c[i][1], c[(i + 1) % 4][0], y, c[(i + 1) % 4][1])
    }
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    const material = new THREE.LineDashedMaterial({
      color: '#8a8378',
      dashSize: 0.05,
      gapSize: 0.035,
      transparent: true,
      opacity: 0.75,
    })
    const obj = new THREE.LineSegments(geometry, material)
    obj.computeLineDistances()
    obj.raycast = () => {}
    obj.userData.wallGhosts = true
    return obj
  }, [ghosts])
  useEffect(() => {
    invalidate()
    return () => {
      if (!lines) return
      lines.geometry.dispose()
      ;(lines.material as THREE.Material).dispose()
    }
  }, [lines])
  useEffect(() => void invalidate(), [on])
  return lines && on ? <primitive object={lines} /> : null
}

type MatPool = (id: string) => THREE.MeshStandardMaterial

interface BulgePiece {
  key: string
  size: [number, number, number]
  position: [number, number, number]
  material: THREE.MeshStandardMaterial
  stub: boolean
  /** Accent paint layers have no outline: they are the wall's own surface. */
  edges: boolean
}

type AccentPanel = Shell['accentPanels'][number]

const NO_FACES: PaintFace[] = []
/** Paint sits this far in front of the plaster: enough to win the depth test, too thin to see. */
const PAINT_T = 0.001

function WallView({
  wall,
  bulges,
  accents,
  faces,
}: {
  wall: Wall
  bulges: Bulge[]
  accents: AccentPanel[]
  faces: PaintFace[]
}) {
  const frame = useMemo(() => wallFrame(wall), [wall])
  const pieces = useMemo(() => wallPieces(wall, STUB_HEIGHT), [wall])
  const outward = useMemo(() => outwardNormal(wall, INSIDE), [wall])
  const groupRef = useRef<THREE.Group>(null)

  // Each wall owns its materials so it can fade on its own. Everything lands
  // in either the stub set or the upper set.
  const mats = useMemo(() => {
    const stubSet = new Set<THREE.Material>()
    const upperSet = new Set<THREE.Material>()
    const pool = new Map<string, THREE.MeshStandardMaterial>()
    const get: MatPool = (id) => {
      let m = pool.get(id)
      if (!m) {
        pool.set(id, (m = makeMaterial(id)))
        upperSet.add(m)
      }
      return m
    }
    const stub = makeMaterial(wall.material)
    const stubEdge = makeEdgeMaterial()
    const upper = makeMaterial(wall.material)
    const upperEdge = makeEdgeMaterial()
    stubSet.add(stub).add(stubEdge)
    upperSet.add(upper).add(upperEdge)

    const bulgePieces: BulgePiece[] = []
    // Accent paint: one material per half (stub / upper) whatever the number of panels; hidden unless chosen.
    const accentId = `accent:${wall.id}`
    const accentMats = accents.length ? { stub: makeMaterial(accentId), upper: makeMaterial(accentId) } : null
    const layers = [
      ...bulges.map((b) => ({ ...b, accent: false })),
      ...accents.map((a, i) => ({ id: `accent-${i}`, min: a.min, max: a.max, material: accentId, accent: true })),
    ]
    for (const b of layers) {
      const spans: [number, number, boolean][] =
        b.min[1] < STUB_HEIGHT && b.max[1] > STUB_HEIGHT
          ? [
              [b.min[1], STUB_HEIGHT, true],
              [STUB_HEIGHT, b.max[1], false],
            ]
          : [[b.min[1], b.max[1], b.max[1] <= STUB_HEIGHT]]
      // Patterns (tiles) are scaled to the whole bulge so the grid stays continuous across the cut.
      const full: Vec3 = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]]
      for (const [y0, y1, isStub] of spans) {
        const size: [number, number, number] = [full[0], y1 - y0, full[2]]
        const material = b.accent
          ? accentMats![isStub ? 'stub' : 'upper']
          : makeMaterial(b.material, faceDims(size), [0, isStub ? 0 : y0 - b.min[1]])
        ;(isStub ? stubSet : upperSet).add(material)
        bulgePieces.push({
          key: `${b.id}:${isStub ? 's' : 'u'}`,
          size,
          position: [(b.min[0] + b.max[0]) / 2, (y0 + y1) / 2, (b.min[2] + b.max[2]) / 2],
          material,
          stub: isStub,
          edges: !b.accent,
        })
      }
    }
    // Paint layers: one per face and wall piece (around the openings), hidden unless that face is painted.
    const paint: { key: string; size: Vec3; position: Vec3; material: THREE.MeshStandardMaterial }[] = []
    for (const face of faces) {
      const m = { stub: makeMaterial(`paint:${face.id}`), upper: makeMaterial(`paint:${face.id}`) }
      stubSet.add(m.stub)
      upperSet.add(m.upper)
      const z = face.side * (wall.thickness / 2 + PAINT_T / 2)
      pieces.forEach((p, i) => {
        const a = Math.max(p.s0, face.s0)
        const b = Math.min(p.s1, face.s1)
        if (b - a < 0.005) return
        paint.push({
          key: `${face.id}:${i}`,
          size: [b - a, p.y1 - p.y0, PAINT_T],
          position: [(a + b) / 2, (p.y0 + p.y1) / 2, z],
          material: p.stub ? m.stub : m.upper,
        })
      })
    }
    return { stub, stubEdge, upper, upperEdge, get, stubSet, upperSet, bulgePieces, paint }
  }, [wall, bulges, accents, faces, pieces])

  // A wall taken out (or shortened) in the open layout: free what it built.
  // Deferred a tick so a StrictMode remount (same materials) keeps them.
  const live = useRef<unknown>(null)
  useEffect(() => {
    live.current = mats
    return () => {
      live.current = null
      setTimeout(() => {
        if (live.current === mats) return
        if (!live.current) cutWalls.delete(wall.id)
        for (const m of [...mats.stubSet, ...mats.upperSet]) {
          ;(m as THREE.MeshStandardMaterial).map?.dispose()
          m.dispose()
        }
      }, 0)
    }
  }, [mats, wall.id])

  const alpha = useRef({ stub: 1, upper: 1, shadows: true })

  useFrame(({ camera }, dt) => {
    const { mode, walking } = useView.getState()
    let stub = 1
    let upper = 1
    if (mode === 'xray') {
      stub = upper = XRAY_ALPHA
    } else if (wall.kind === 'exterior' && !walking) {
      // Walking, the camera is a person in the flat: nothing is cut away, even out on the balcony.
      const mx = (wall.a[0] + wall.b[0]) / 2
      const mz = (wall.a[1] + wall.b[1]) / 2
      const beyond = (camera.position.x - mx) * outward[0] + (camera.position.z - mz) * outward[1]
      if (beyond > 0.05) upper = 0
    }
    if (upper === 0) cutWalls.add(wall.id)
    else cutWalls.delete(wall.id)
    const k = 1 - Math.exp(-FADE_SPEED * Math.min(dt, MAX_DT))
    const a = alpha.current
    a.stub += (stub - a.stub) * k
    a.upper += (upper - a.upper) * k
    // Keep rendering until the fade settles, then snap to the target.
    if (Math.abs(stub - a.stub) > 0.002 || Math.abs(upper - a.upper) > 0.002) invalidate()
    else {
      a.stub = stub
      a.upper = upper
    }
    applyFade(mats.stubSet, a.stub)
    applyFade(mats.upperSet, a.upper)

    // Faded parts should not keep casting shadows into the room.
    const shadows = mode !== 'xray' && upper > 0.5
    if (shadows !== a.shadows && groupRef.current) {
      a.shadows = shadows
      requestShadowUpdate()
      groupRef.current.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && !mats.stubSet.has((o as THREE.Mesh).material as THREE.Material))
          o.castShadow = shadows
      })
    }
  })

  return (
    <group ref={groupRef} userData={{ host: wall.id }}>
      {/* One draw call per material instead of one per box and outline. */}
      <Merged>
        <group position={[frame.origin[0], 0, frame.origin[1]]} rotation={[0, frame.rotY, 0]}>
          {pieces.map((p, i) => (
            <Box
              key={i}
              size={[p.s1 - p.s0, p.y1 - p.y0, wall.thickness]}
              position={[(p.s0 + p.s1) / 2, (p.y0 + p.y1) / 2, 0]}
              material={p.stub ? mats.stub : mats.upper}
              edgeMaterial={p.stub ? mats.stubEdge : mats.upperEdge}
            />
          ))}
          {mats.paint.map((p) => (
            <Box key={p.key} size={p.size} position={p.position} material={p.material} castShadow={false} />
          ))}
          {wall.openings?.map((o) => (
            <OpeningView key={o.id} opening={o} wall={wall} get={mats.get} edge={mats.upperEdge} />
          ))}
        </group>
        {mats.bulgePieces.map((p) => (
          <Box
            key={p.key}
            size={p.size}
            position={p.position}
            material={p.material}
            edgeMaterial={p.edges ? (p.stub ? mats.stubEdge : mats.upperEdge) : undefined}
            castShadow={p.edges}
          />
        ))}
      </Merged>
    </group>
  )
}

interface OpeningProps {
  opening: Opening
  wall: Wall
  get: MatPool
  edge: THREE.Material
}

function OpeningView({ opening, wall, get, edge }: OpeningProps) {
  if (opening.kind === 'door' && opening.leaf) return <DoorView opening={opening} wall={wall} get={get} edge={edge} />
  if (opening.kind === 'window' && opening.glazing)
    return <SlidingDoorView opening={opening} wall={wall} get={get} edge={edge} />
  return null
}

const FRAME = 0.045

function DoorView({ opening: o, wall, get, edge }: OpeningProps) {
  const leaf = o.leaf!
  const frameMat = get(leaf.frameMaterial)
  const leafMat = get(leaf.material)
  const handleMat = get('steel')
  const depth = wall.thickness + 0.02
  const s0 = o.offset
  const s1 = o.offset + o.width
  const leafW = o.width - FRAME * 2
  const leafH = o.height - FRAME - 0.01
  const leafT = 0.04
  const hingeS = leaf.hinge === 'a' ? s0 + FRAME : s1 - FRAME
  const dir = leaf.hinge === 'a' ? 1 : -1
  const pivotZ = leaf.swing * (wall.thickness / 2 - leafT / 2)
  const phi = -dir * leaf.swing * THREE.MathUtils.degToRad(leaf.openDeg)

  return (
    <group>
      <Box
        size={[FRAME, o.height, depth]}
        position={[s0 + FRAME / 2, o.height / 2, 0]}
        material={frameMat}
        edgeMaterial={edge}
      />
      <Box
        size={[FRAME, o.height, depth]}
        position={[s1 - FRAME / 2, o.height / 2, 0]}
        material={frameMat}
        edgeMaterial={edge}
      />
      <Box
        size={[o.width, FRAME, depth]}
        position={[(s0 + s1) / 2, o.height - FRAME / 2, 0]}
        material={frameMat}
        edgeMaterial={edge}
      />
      <group position={[hingeS, 0, pivotZ]} rotation={[0, phi, 0]}>
        <Box
          size={[leafW, leafH, leafT]}
          position={[(dir * leafW) / 2, 0.01 + leafH / 2, 0]}
          material={leafMat}
          edgeMaterial={edge}
        />
        {[1, -1].map((side) => (
          <Box
            key={side}
            size={[0.12, 0.02, 0.02]}
            position={[dir * (leafW - 0.09), 1.0, side * (leafT / 2 + 0.03)]}
            material={handleMat}
          />
        ))}
      </group>
    </group>
  )
}

function SlidingDoorView({ opening: o, get, edge }: OpeningProps) {
  const g = o.glazing!
  const frameMat = get(g.frameMaterial)
  const glassMat = get('glass')
  const handleMat = get('blackGlass')
  const sill = o.sill ?? 0
  const s0 = o.offset
  const s1 = o.offset + o.width
  const outerD = 0.1
  const panelW = (o.width - FRAME * 2) / g.panels + 0.04
  const panelH = o.height - FRAME * 2
  const bar = 0.055

  const panels = Array.from({ length: g.panels }, (_, i) => {
    const left = s0 + FRAME + i * ((o.width - FRAME * 2 - panelW) / Math.max(1, g.panels - 1))
    const z = (i % 2 === 0 ? 1 : -1) * 0.022
    return { cx: left + panelW / 2, z }
  })

  return (
    <group>
      {/* Outer frame */}
      <Box
        size={[FRAME, o.height, outerD]}
        position={[s0 + FRAME / 2, sill + o.height / 2, 0]}
        material={frameMat}
        edgeMaterial={edge}
      />
      <Box
        size={[FRAME, o.height, outerD]}
        position={[s1 - FRAME / 2, sill + o.height / 2, 0]}
        material={frameMat}
        edgeMaterial={edge}
      />
      <Box
        size={[o.width, FRAME, outerD]}
        position={[(s0 + s1) / 2, sill + o.height - FRAME / 2, 0]}
        material={frameMat}
        edgeMaterial={edge}
      />
      <Box
        size={[o.width, FRAME, outerD]}
        position={[(s0 + s1) / 2, sill + FRAME / 2, 0]}
        material={frameMat}
        edgeMaterial={edge}
      />
      {panels.map((p, i) => (
        <group key={i} position={[p.cx, sill + FRAME + panelH / 2, p.z]}>
          <Box
            size={[bar, panelH, 0.035]}
            position={[-panelW / 2 + bar / 2, 0, 0]}
            material={frameMat}
            edgeMaterial={edge}
          />
          <Box
            size={[bar, panelH, 0.035]}
            position={[panelW / 2 - bar / 2, 0, 0]}
            material={frameMat}
            edgeMaterial={edge}
          />
          <Box
            size={[panelW, bar, 0.035]}
            position={[0, panelH / 2 - bar / 2, 0]}
            material={frameMat}
            edgeMaterial={edge}
          />
          <Box
            size={[panelW, bar * 1.6, 0.035]}
            position={[0, -panelH / 2 + bar * 0.8, 0]}
            material={frameMat}
            edgeMaterial={edge}
          />
          <Box
            size={[panelW - bar * 2, panelH - bar * 2.6, 0.006]}
            position={[0, bar * 0.3, 0]}
            material={glassMat}
            castShadow={false}
          />
          {/* Pull handle on the meeting stile */}
          <Box
            size={[0.02, 0.22, 0.03]}
            position={[(i === 0 ? 1 : -1) * (panelW / 2 - bar / 2), -0.1, (i % 2 === 0 ? 1 : -1) * 0.03]}
            material={handleMat}
          />
        </group>
      ))}
    </group>
  )
}
