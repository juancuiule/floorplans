import * as THREE from 'three'

/** The decor item an object belongs to, if any. */
export function decorIdOf(o: THREE.Object3D | null): string | null {
  for (; o; o = o.parent) if (o.userData.decorId) return o.userData.decorId as string
  return null
}

/** Not drawn at all: a hidden object or parent, or only invisible materials (a faded-out wall). */
export function hidden(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return true
  const m = (o as THREE.Mesh).material
  const mats = Array.isArray(m) ? m : m ? [m] : []
  return mats.length > 0 && mats.every((x) => !x.visible)
}

/**
 * Whether the pointer sees through this hit when picking items: hidden or
 * editor-helper objects, and architecture faded by x-ray or dollhouse mode.
 */
function seeThrough(o: THREE.Object3D): boolean {
  // Edge lines and points are picked from far away (raycaster line threshold): never let them block.
  if (!(o as THREE.Mesh).isMesh || o.userData.editHelper || hidden(o)) return true
  if (decorIdOf(o)) return false
  const m = (o as THREE.Mesh).material
  const mats = Array.isArray(m) ? m : m ? [m] : []
  return mats.length > 0 && mats.every((x) => !x.visible || (x.transparent && x.opacity < 0.5))
}

/** First hit the eye actually sees. */
export function firstSolid(list: THREE.Intersection[]) {
  return list.find((i) => !seeThrough(i.object))
}

const raycaster = new THREE.Raycaster()
const ndc = new THREE.Vector2()

/** The first surface the eye sees under a DOM pointer event (faded walls and helpers are looked past). */
export function pick(
  e: { clientX: number; clientY: number },
  dom: HTMLElement,
  camera: THREE.Camera,
  scene: THREE.Scene,
): THREE.Intersection | null {
  const r = dom.getBoundingClientRect()
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
  raycaster.setFromCamera(ndc, camera)
  return firstSolid(raycaster.intersectObjects(scene.children, true)) ?? null
}

/** World-space normal of an intersection's face. */
export function worldNormal(i: THREE.Intersection): THREE.Vector3 {
  const n = i.face ? i.face.normal.clone() : new THREE.Vector3(0, 1, 0)
  return n.transformDirection(i.object.matrixWorld)
}
