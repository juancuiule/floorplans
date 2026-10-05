import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useDecor } from '../decor/store'
import type { Vec3 } from '../model/types'
import { structureOf, type Finishes } from '../model/finishes'
import { project } from '../project'
import { ROOM_CENTER as PLAN_CENTER, SCENE_BOX } from '../project/derived'
import { ceilingFitting, setStructure, useStructure } from '../project/structure'
import { useView } from '../store'
import { CameraRig } from './CameraRig'
import { setFinishes } from './materials'
import { requestShadowUpdate, shadowOnly, takeShadowUpdate } from './shadows'
import { SunOccluders } from './SunOccluders'
import { daylight } from '../sun/daylight'
import { sunDirection, type SunPosition } from '../sun/solar'
import { Clearances } from './Clearances'
import { DecorLayer, SurfaceEvents } from './decor/DecorLayer'
import { Ceilings, Floors } from './Floors'
import { Fixtures } from './Fixtures'
import { Labels } from './Labels'
import { Measure } from './Measure'
import { Walk } from './Walk'
import { Walls } from './Walls'

declare global {
  interface Window {
    __frames?: number
    /** Renderer counters for the last rendered frame (all passes, shadows included). */
    /** Requests one render (the canvas renders on demand). */
    __invalidate?: () => void
    /** Dev only: the scene graph, for scripts that inspect it. */
    __scene?: THREE.Scene
    __stats?: {
      calls: number
      triangles: number
      lines: number
      points: number
      programs: number
      geometries: number
      textures: number
    }
  }
}

const WARMUP_FRAMES = 60

/**
 * Counts rendered frames (scripts wait on window.__frames) and publishes
 * renderer.info for the whole frame. Runs after the EffectComposer (priority 1).
 */
function FrameCounter() {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    gl.info.autoReset = false
    window.__invalidate = () => invalidate()
    if (import.meta.env.DEV) window.__scene = scene
    return () => {
      gl.info.autoReset = true
      delete window.__invalidate
    }
  }, [gl, invalidate, scene])
  useFrame(() => {
    const n = (window.__frames = (window.__frames ?? 0) + 1)
    // Warm up: render continuously for the first frames while programs
    // compile and textures upload; after that frames are rendered on demand.
    if (n < WARMUP_FRAMES) invalidate()
    const { render, memory, programs } = gl.info
    window.__stats = {
      calls: render.calls,
      triangles: render.triangles,
      lines: render.lines,
      points: render.points,
      programs: programs?.length ?? 0,
      geometries: memory.geometries,
      textures: memory.textures,
    }
    gl.info.reset()
  }, 2)
  return null
}

/**
 * Pushes the layout's finishes into the materials: in place, no remount, one
 * render. Its structure (walls taken out) goes to the active shell, which
 * remounts only the walls, floors and ceilings it changes.
 */
function FinishesSync() {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const apply = (f: Finishes) => {
      const walls = setStructure(structureOf(f))
      if (setFinishes(f) || walls) invalidate()
    }
    apply(useDecor.getState().finishes)
    return useDecor.subscribe((s, prev) => {
      if (s.finishes !== prev.finishes) apply(s.finishes)
    })
  }, [invalidate])
  return null
}

/** Renders shadow maps only on request (see shadows.ts). */
function ShadowController() {
  const gl = useThree((s) => s.gl)
  const lighting = useView((s) => s.lighting)
  useEffect(() => {
    gl.shadowMap.autoUpdate = false
    return () => void (gl.shadowMap.autoUpdate = true)
  }, [gl])
  useEffect(() => requestShadowUpdate(), [lighting])
  useFrame(() => {
    if (!takeShadowUpdate()) return
    gl.shadowMap.needsUpdate = true
    shadowOnly.forEach((o) => (o.visible = true))
  })
  // After the frame is drawn (the composer renders at priority 1).
  useFrame(() => shadowOnly.forEach((o) => (o.visible = false)), 3)
  return null
}

/** The sun aims here; the shadow camera is fitted around BOUNDS (the unit and its balcony). */
const ROOM_CENTER = new THREE.Vector3(...PLAN_CENTER)
const BOUNDS = new THREE.Box3(new THREE.Vector3(...SCENE_BOX.min), new THREE.Vector3(...SCENE_BOX.max))
const SUN_DISTANCE = 20

/** Fits the orthographic shadow camera tightly around BOUNDS as seen from the sun, for sharp shadows. */
function fitShadowCamera(light: THREE.DirectionalLight) {
  const view = new THREE.Matrix4()
    .lookAt(light.position, ROOM_CENTER, THREE.Object3D.DEFAULT_UP)
    .setPosition(light.position)
    .invert()
  const min = new THREE.Vector3(Infinity, Infinity, Infinity)
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity)
  const p = new THREE.Vector3()
  for (let i = 0; i < 8; i++) {
    p.set(
      i & 1 ? BOUNDS.max.x : BOUNDS.min.x,
      i & 2 ? BOUNDS.max.y : BOUNDS.min.y,
      i & 4 ? BOUNDS.max.z : BOUNDS.min.z,
    ).applyMatrix4(view)
    min.min(p)
    max.max(p)
  }
  const cam = light.shadow.camera
  const pad = 0.1
  cam.left = min.x - pad
  cam.right = max.x + pad
  cam.bottom = min.y - pad
  cam.top = max.y + pad
  cam.near = Math.max(0.1, -max.z - pad)
  cam.far = -min.z + pad
  cam.updateProjectionMatrix()
}

/**
 * Sun, sky and fill, driven by the time of day (store.sun). Updated in place
 * from a store subscription, so scrubbing the time re-renders no React
 * components, only the frames it needs (one shadow re-render per frame at most).
 */
function Lights() {
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)
  const evening = useView((s) => s.lighting === 'evening')
  const downlights = useView((s) => s.downlights)
  const structure = useStructure((s) => s.structure)
  const sunRef = useRef<THREE.DirectionalLight>(null)
  const hemiRef = useRef<THREE.HemisphereLight>(null)
  const ambientRef = useRef<THREE.AmbientLight>(null)
  const target = useMemo(() => new THREE.Object3D(), [])

  useEffect(() => {
    target.position.copy(ROOM_CENTER)
    scene.add(target)
    const background = new THREE.Color()
    scene.background = background
    const d = daylight(0)
    const apply = ({ solar, sun: { facing } }: { solar: SunPosition; sun: { facing: number } }) => {
      daylight(solar.elevation, d)
      background.copy(d.background)
      const hemi = hemiRef.current!
      hemi.color.copy(d.skyColor)
      hemi.groundColor.copy(d.groundColor)
      hemi.intensity = d.hemiIntensity
      ambientRef.current!.intensity = d.ambient
      const light = sunRef.current!
      light.intensity = d.sunIntensity
      light.color.copy(d.sunColor)
      const [x, y, z] = sunDirection(solar, facing)
      if (y > 0) {
        light.position.set(x, y, z).multiplyScalar(SUN_DISTANCE).add(ROOM_CENTER)
        fitShadowCamera(light)
        requestShadowUpdate(1)
      }
      invalidate()
    }
    apply(useView.getState())
    const unsubscribe = useView.subscribe((s, prev) => {
      if (s.solar !== prev.solar || s.sun.facing !== prev.sun.facing) apply(s)
    })
    return () => {
      unsubscribe()
      scene.remove(target)
      scene.background = null
    }
  }, [scene, target, invalidate])

  return (
    <>
      <hemisphereLight ref={hemiRef} />
      <ambientLight ref={ambientRef} />
      <directionalLight
        ref={sunRef}
        target={target}
        castShadow={!evening}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      {evening &&
        downlights &&
        project.objects
          .filter((o) => o.type === 'downlight')
          .map((o) => <Downlight key={o.id} at={ceilingFitting(o.position, structure)} />)}
      <SunOccluders />
    </>
  )
}

/** Warm recessed spot pointing straight down. */
function Downlight({ at }: { at: Vec3 }) {
  const scene = useThree((s) => s.scene)
  const target = useMemo(() => new THREE.Object3D(), [])
  useEffect(() => {
    target.position.set(at[0], 0, at[2])
    scene.add(target)
    return () => void scene.remove(target)
  }, [scene, target, at])
  return (
    <spotLight
      position={[at[0], at[1] - 0.02, at[2]]}
      target={target}
      angle={0.85}
      penumbra={0.7}
      intensity={4}
      decay={2}
      distance={6}
      color="#ffe6c8"
    />
  )
}

export function Scene() {
  return (
    <Canvas
      // Its own stacking context: overlays placed in the scene (the TV's video) stay under the toolbar and panel.
      className="scene"
      onPointerMissed={() => {
        const d = useDecor.getState()
        const v = useView.getState()
        if (!d.movingId && !v.walking && !v.tool) d.select(null)
      }}
      frameloop="demand"
      shadows
      // Every pixel pays for N8AO, SMAA and tone mapping; past 1.5x the extra
      // sharpness is hard to see and costs ~1.8x the fill of 1.5x.
      dpr={[1, 1.5]}
      camera={{ fov: 38, near: 0.05, far: 100, position: [11, 7.5, -4.5] }}
      gl={{ antialias: false }}
    >
      <ShadowController />
      <FinishesSync />
      <Lights />
      <SurfaceEvents>
        <Floors />
        <Walls />
        <Ceilings />
        <Fixtures />
        {/* Decor is a surface too: plants on the desk, lamps on shelves. */}
        <DecorLayer />
      </SurfaceEvents>
      <Labels />
      <CameraRig />
      <Walk />
      <Measure />
      <Clearances />
      <FrameCounter />
      <Effects />
    </Canvas>
  )
}

/**
 * Postprocessing. MSAA on the scene target only at 1x: on high-density
 * screens the pixels are small enough for SMAA alone, and 4x MSAA on a
 * half-float target at 1.5x DPR is a large share of the frame's bandwidth.
 */
function Effects() {
  const dpr = useThree((s) => s.viewport.dpr)
  return (
    <EffectComposer multisampling={dpr > 1.2 ? 0 : 4}>
      <N8AO aoRadius={0.6} intensity={2.2} distanceFalloff={0.8} halfRes />
      <SMAA />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
    </EffectComposer>
  )
}
