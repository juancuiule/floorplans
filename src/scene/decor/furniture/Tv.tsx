import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { screenImageSrc } from '../../../decor/api'
import { TV_BEZEL, TV_LIFT, tvPanel } from '../../../decor/furnitureCatalog'
import { embedUrl, parseYouTube } from '../../../decor/youtube'
import type { FurnitureItem } from '../../../model/decor'
import type { Vec3 } from '../../../model/types'
import { decorIdOf } from '../../pick'
import { B } from './common'
import { mat } from './furnitureMaterials'

// The TV: a panel on feet, a pedestal or the wall, its screen off, showing a
// picture from any image link, or playing YouTube in a real embed laid over the
// screen in 3D. Origin at the footprint center on the supporting surface (or on
// the wall for the wall model), +z front.

// ---------- TV ----------

let tvOff: THREE.MeshStandardMaterial | undefined
let tvOn: THREE.MeshStandardMaterial | undefined

/** Screen glass: glossy black when off; a soft picture (a dusk sky over a skyline) when on. */
function tvScreenMaterial(on: boolean): THREE.MeshStandardMaterial {
  if (!on) return (tvOff ??= new THREE.MeshStandardMaterial({ color: '#0b0c0e', roughness: 0.12, metalness: 0.1 }))
  if (tvOn) return tvOn
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 144
  const g = c.getContext('2d')!
  const sky = g.createLinearGradient(0, 0, 0, 144)
  sky.addColorStop(0, '#27406b')
  sky.addColorStop(0.55, '#c97a5a')
  sky.addColorStop(1, '#f2c27a')
  g.fillStyle = sky
  g.fillRect(0, 0, 256, 144)
  g.fillStyle = '#1c2230'
  let x = 0
  for (let i = 0; x < 256; i++) {
    const w = 10 + ((i * 37) % 23)
    const h = 22 + ((i * 53) % 48)
    g.fillRect(x, 144 - h, w, h)
    x += w + 2
  }
  const map = new THREE.CanvasTexture(c)
  map.colorSpace = THREE.SRGBColorSpace
  tvOn = new THREE.MeshStandardMaterial({
    color: '#000000',
    roughness: 0.2,
    emissive: '#ffffff',
    emissiveMap: map,
    emissiveIntensity: 0.9,
  })
  return tvOn
}

/**
 * A screen material showing the picture at `link`, cropped to the screen (cover),
 * glowing like a lit screen. Null without a link; the default picture shows
 * while it loads or when it cannot be loaded.
 */
function useScreenImage(link: string, aspect: number): THREE.MeshStandardMaterial | null {
  const invalidate = useThree((s) => s.invalidate)
  const src = screenImageSrc(link)
  const material = useMemo(
    () =>
      src
        ? new THREE.MeshStandardMaterial({
            color: '#000000',
            roughness: 0.2,
            emissive: '#ffffff',
            emissiveIntensity: 0.9,
            emissiveMap: tvScreenMaterial(true).emissiveMap,
          })
        : null,
    [src],
  )
  useEffect(() => {
    if (!src || !material) return
    let texture: THREE.Texture | null = null
    let alive = true
    new THREE.TextureLoader().load(
      src,
      (t) => {
        if (!alive) return t.dispose()
        texture = t
        t.colorSpace = THREE.SRGBColorSpace
        t.anisotropy = 8
        const img = t.image as { width: number; height: number }
        const a = img.width / img.height
        if (a > aspect) {
          t.repeat.set(aspect / a, 1)
          t.offset.set((1 - aspect / a) / 2, 0)
        } else {
          t.repeat.set(1, a / aspect)
          t.offset.set(0, (1 - a / aspect) / 2)
        }
        material.emissiveMap = t
        material.needsUpdate = true
        invalidate()
      },
      undefined,
      () => console.warn(`The TV picture could not be loaded: ${link}`),
    )
    return () => {
      alive = false
      texture?.dispose()
      material.dispose()
    }
  }, [src, material, aspect, link, invalidate])
  return material
}

/**
 * A 16:9 flat TV sized by its diagonal. On a stand: origin at the footprint center,
 * feet or a pedestal lift the panel. On the wall: origin on the wall, y = bottom edge,
 * a slim bracket holds the panel a few cm off the wall.
 */
export function Tv({ item }: { item: FurnitureItem }) {
  const [pw, ph] = tvPanel(Number(item.options.inches ?? 55))
  const wall = item.type === 'tvWall'
  const pedestal = item.options.stand === 'pedestal'
  const video = item.options.screen === 'youtube' ? parseYouTube(String(item.options.youtube ?? '')) : null
  const picture = useScreenImage(
    item.options.screen === 'on' ? String(item.options.image ?? '') : '',
    (pw - 2 * TV_BEZEL) / (ph - 2 * TV_BEZEL),
  )
  // Frame and stand take the metal finish (black by default); the back stays dark.
  const frame = mat(item.finish.metal, 'matte')
  const back = mat('#26282b', 'matte')
  const lift = wall ? 0 : pedestal ? TV_LIFT.pedestal : TV_LIFT.feet
  const t = 0.03
  // Panel center depth: a few cm off the wall when hung, over the stand otherwise.
  const zc = wall ? 0.045 : 0.01
  const cy = lift + ph / 2
  const footX = pw / 2 - Math.min(0.16, pw * 0.14)
  return (
    <group>
      <B s={[pw, ph, t]} p={[0, cy, zc]} m={frame} />
      {/* the thicker electronics box at the back */}
      <B s={[pw * 0.62, ph * 0.5, 0.02]} p={[0, lift + ph * 0.42, zc - t / 2 - 0.01]} m={back} />
      <mesh
        position={[0, cy, zc + t / 2 + 0.0006]}
        material={picture ?? tvScreenMaterial(item.options.screen === 'on')}
      >
        <planeGeometry args={[pw - 2 * TV_BEZEL, ph - 2 * TV_BEZEL]} />
      </mesh>
      {video && (
        <TvVideo
          url={embedUrl(video)}
          width={pw - 2 * TV_BEZEL}
          height={ph - 2 * TV_BEZEL}
          position={[0, cy, zc + t / 2 + 0.003]}
          itemId={item.id}
        />
      )}
      {wall ? (
        <B s={[Math.min(0.4, pw * 0.4), Math.min(0.3, ph * 0.45), 0.025]} p={[0, cy, 0.0125]} m={back} />
      ) : pedestal ? (
        <group>
          <B s={[Math.min(0.42, pw * 0.36), 0.012, 0.22]} p={[0, 0.006, 0]} m={frame} />
          <B s={[0.07, lift + 0.12, 0.025]} p={[0, (lift + 0.12) / 2, zc - t / 2 - 0.0125]} m={frame} />
        </group>
      ) : (
        [-1, 1].map((sx) => (
          <group key={sx} position={[sx * footX, 0, 0]}>
            <B s={[0.035, 0.012, 0.23]} p={[0, 0.006, 0]} m={frame} />
            <B s={[0.03, lift + 0.03, 0.02]} p={[0, (lift + 0.03) / 2, zc - 0.005]} m={frame} />
          </group>
        ))
      )}
    </group>
  )
}

// ---------- TV: YouTube on the screen ----------

/** CSS size of the player; the transform maps it onto the screen. */
const PLAYER_W = 640

const occluder = new THREE.Raycaster()
const eye = new THREE.Vector3()
const spot = new THREE.Vector3()

/** Drawn and solid enough to hide what is behind it (faded dollhouse walls and hidden originals are not). */
function hides(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible || p.userData.editHelper) return false
  const m = (o as THREE.Mesh).material
  const mats = Array.isArray(m) ? m : m ? [m] : []
  return mats.some((x) => x.visible && x.colorWrite !== false && (!x.transparent || x.opacity > 0.6))
}

// CSS 3D, as drei's <Html transform> does it, but with plain DOM nodes: a React
// root per element (drei's way) does not survive the remounts of development
// StrictMode inside the 3D tree, and the player would sometimes never appear.
const eps = (v: number) => (Math.abs(v) < 1e-10 ? 0 : v)
function cssMatrix(m: THREE.Matrix4, mul: number[], prepend = '') {
  return `${prepend}matrix3d(${m.elements.map((e, i) => eps(mul[i] * e)).join(',')})`
}
const CAMERA_MUL = [1, -1, 1, 1, 1, -1, 1, 1, 1, -1, 1, 1, 1, -1, 1, 1]
const objectMul = (f: number) => [
  1 / f,
  1 / f,
  1 / f,
  1,
  -1 / f,
  -1 / f,
  -1 / f,
  -1,
  1 / f,
  1 / f,
  1 / f,
  1,
  1,
  1,
  1,
  1,
]

/** The layer over the canvas that holds the players (one per canvas). */
function overlayOf(canvas: HTMLCanvasElement): HTMLDivElement {
  const host = canvas.parentElement!
  let layer = host.querySelector<HTMLDivElement>(':scope > .scene-overlay')
  if (!layer) {
    layer = document.createElement('div')
    layer.className = 'scene-overlay'
    host.appendChild(layer)
  }
  return layer
}

/**
 * A YouTube player laid over the screen: a real embed, placed in 3D with CSS
 * transforms, so it moves with the camera. It is an overlay, not part of the
 * picture: it hides when the TV is hidden (a cut-away wall) or when anything
 * solid stands between the camera and the screen.
 */
function TvVideo({
  url,
  width,
  height,
  position,
  itemId,
}: {
  url: string
  width: number
  height: number
  position: Vec3
  itemId: string
}) {
  const group = useRef<THREE.Group>(null)
  const nodes = useRef<{ outer: HTMLDivElement; inner: HTMLDivElement; frame: HTMLIFrameElement } | null>(null)
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const shown = useRef<boolean | null>(null)
  const playerH = Math.round((PLAYER_W * height) / width)

  useEffect(() => {
    const layer = overlayOf(gl.domElement)
    const outer = document.createElement('div')
    outer.className = 'tv-video-camera'
    const inner = document.createElement('div')
    inner.className = 'tv-video'
    inner.dataset.item = itemId
    const frame = document.createElement('iframe')
    frame.title = 'YouTube video on the TV'
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'
    frame.referrerPolicy = 'strict-origin-when-cross-origin'
    frame.allowFullscreen = true
    inner.appendChild(frame)
    outer.appendChild(inner)
    layer.appendChild(outer)
    nodes.current = { outer, inner, frame }
    shown.current = null
    invalidate()
    return () => {
      outer.remove()
      nodes.current = null
    }
  }, [gl, itemId, invalidate])

  useEffect(() => {
    const n = nodes.current
    if (!n) return
    n.inner.style.width = `${PLAYER_W}px`
    n.inner.style.height = `${playerH}px`
    n.frame.width = String(PLAYER_W)
    n.frame.height = String(playerH)
    if (n.frame.src !== url) n.frame.src = url
    invalidate()
  }, [url, playerH, invalidate])

  useFrame(({ camera }) => {
    const g = group.current
    const n = nodes.current
    if (!g || !n) return
    // Where it is: the camera's CSS matrix on the layer, the screen's on the player.
    const layer = n.outer.parentElement as HTMLDivElement
    const fov = camera.projectionMatrix.elements[5] * (size.height / 2)
    layer.style.width = `${size.width}px`
    layer.style.height = `${size.height}px`
    layer.style.perspective = `${fov}px`
    n.outer.style.width = `${size.width}px`
    n.outer.style.height = `${size.height}px`
    n.outer.style.transform = `translateZ(${fov}px)${cssMatrix(camera.matrixWorldInverse, CAMERA_MUL)}translate(${size.width / 2}px,${size.height / 2}px)`
    n.inner.style.transform = cssMatrix(g.matrixWorld, objectMul(PLAYER_W / width), 'translate(-50%,-50%)')

    // Whether it shows.
    let visible = true
    for (let o: THREE.Object3D | null = g; o; o = o.parent) if (!o.visible) visible = false
    if (visible) {
      g.getWorldPosition(spot)
      camera.getWorldPosition(eye)
      // Seen from behind, a screen shows nothing.
      const facing = new THREE.Vector3(0, 0, 1).transformDirection(g.matrixWorld)
      if (facing.dot(eye.clone().sub(spot)) <= 0) visible = false
      // Behind the camera, CSS 3D would draw it huge and mirrored.
      const ahead = new THREE.Vector3(0, 0, -1).transformDirection(camera.matrixWorld)
      if (ahead.dot(spot.clone().sub(eye)) <= 0.05) visible = false
    }
    if (visible) {
      const dist = eye.distanceTo(spot)
      occluder.set(eye, spot.clone().sub(eye).normalize())
      occluder.far = dist - 0.02
      for (const hit of occluder.intersectObject(scene, true)) {
        if (!(hit.object as THREE.Mesh).isMesh || decorIdOf(hit.object) === itemId || !hides(hit.object)) continue
        visible = false
        break
      }
    }
    if (visible !== shown.current) {
      shown.current = visible
      n.inner.style.visibility = visible ? 'visible' : 'hidden'
    }
  })

  return <group ref={group} position={position} userData={{ noMerge: true }} />
}
