// @vitest-environment node
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import type { Bulge, SceneObject } from '../../src/model/types'
import plan from '../../examples/monoambiente/plans/monoambiente.plan.json'
import { cornerShelf, SHELF, showerFrame } from '../../src/scene/showerFrame'

const tray = plan.fixtures.find((o) => o.type === 'showerTray') as unknown as SceneObject
const bulges = plan.shell.bulges as unknown as Bulge[]
const tiles = bulges.filter((b) => b.material === 'tile')

function trayMatrix(t: SceneObject) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...t.position),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(t.rotation ?? 0)),
    new THREE.Vector3(1, 1, 1),
  )
}

/** The shelf's world bounds and how deep it cuts into the tiles (≤ 0: it does not). */
function shelfAgainst(t: SceneObject, tileBoxes: Bulge[]) {
  const f = showerFrame(t, tileBoxes)
  const { geometry, position } = cornerShelf(f)
  geometry.computeBoundingBox()
  const local = geometry.boundingBox!.clone().translate(new THREE.Vector3(...position))
  const world = local.clone().applyMatrix4(trayMatrix(t))
  let depth = -Infinity
  for (const b of tileBoxes) {
    const tb = new THREE.Box3(new THREE.Vector3(...b.min), new THREE.Vector3(...b.max))
    const i = world.clone().intersect(tb)
    if (!i.isEmpty()) depth = Math.max(depth, Math.min(i.max.x - i.min.x, i.max.y - i.min.y, i.max.z - i.min.z))
  }
  return { f, world, depth }
}

describe('shower frame from the plan', () => {
  it('finds the tile faces around the tray', () => {
    const f = showerFrame(tray, bulges)
    // Back tiles at x 2.09–2.10, side tiles at z 0–0.01 and 0.69–0.70; tray centered at (1.725, 0.35).
    expect(f.back).toBeCloseTo(2.09 - 1.725, 6)
    expect(f.z0).toBeCloseTo(0.01 - 0.35, 6)
    expect(f.z1).toBeCloseTo(0.69 - 0.35, 6)
    expect(f.wallZ0 && f.wallZ1).toBe(true)
  })

  it('without the shower ↔ niche wall (its tiles go), that side is open', () => {
    const f = showerFrame(
      tray,
      bulges.filter((b) => b.host !== 'shower-niche'),
    )
    expect(f.wallZ1).toBe(false)
    expect(f.z1).toBeCloseTo(0.35, 6)
  })

  it('the corner shelf sits flush in the corner without cutting into the tiles', () => {
    const { f, world, depth } = shelfAgainst(tray, tiles)
    expect(depth).toBeLessThanOrEqual(0.001)
    // Flush: touching the back tiles (x = 2.09) and the side tiles (z = 0.01) within a millimeter.
    expect(world.max.x).toBeCloseTo(2.09, 2)
    expect(world.min.z).toBeCloseTo(0.01, 2)
    expect(world.max.y).toBeCloseTo(SHELF.top, 6)
    // And it reaches into the shower, not out of it.
    expect(world.min.x).toBeCloseTo(2.09 - SHELF.r, 2)
    expect(world.max.z).toBeCloseTo(0.01 + SHELF.r, 2)
    expect(f.back).toBeGreaterThan(0)
  })

  it.each([90, 180, 270])('works for a tray turned %i° with its tiles', (deg) => {
    // Turn the whole shower corner about the tray center.
    const turned: SceneObject = { ...tray, rotation: deg }
    const m = trayMatrix(turned).multiply(trayMatrix(tray).invert())
    const turnedTiles = tiles.map((b) => {
      const box = new THREE.Box3(new THREE.Vector3(...b.min), new THREE.Vector3(...b.max)).applyMatrix4(m)
      return { ...b, min: box.min.toArray(), max: box.max.toArray() } as Bulge
    })
    const { f, depth } = shelfAgainst(turned, turnedTiles)
    expect(f.back).toBeCloseTo(0.365, 6)
    expect(f.z0).toBeCloseTo(-0.34, 6)
    expect(depth).toBeLessThanOrEqual(0.001)
  })
})
