// @vitest-environment node
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { FURNITURE } from '../../src/decor/furnitureCatalog'
import { isTabletop, placeAt, readIntersection, slidesOnFloor } from '../../src/decor/placement'
import { restHeight, restPoints, settleMoved, surfaceBelow } from '../../src/decor/rest'
import type { FurnitureItem, FurnitureType, LampItem } from '../../src/model/decor'

const furniture = (
  type: FurnitureType,
  at: [number, number, number] = [0, -100, 0],
  id = `f-${type}`,
): FurnitureItem => ({
  kind: 'furniture',
  id,
  type,
  at,
  rotation: 0,
  size: [...FURNITURE[type].size],
  finish: { ...FURNITURE[type].finish },
  options: { ...FURNITURE[type].options },
})
const lamp = (at: [number, number, number]): LampItem => ({
  kind: 'lamp',
  id: 'lamp',
  type: 'table',
  at,
  rotation: 0,
  on: true,
  brightness: 1,
  warmth: 2700,
  color: '#fff',
})

const mat = new THREE.MeshStandardMaterial()
/** A box standing on y = 0 with its top at `h`, centered on (x, z), as a scene would draw it (with outline edges). */
function box(size: [number, number, number], at: [number, number, number], userData: Record<string, unknown> = {}) {
  const g = new THREE.Group()
  g.position.set(...at)
  g.userData = userData
  const geo = new THREE.BoxGeometry(...size)
  const m = new THREE.Mesh(geo, mat)
  m.position.y = size[1] / 2
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial())
  edges.position.y = size[1] / 2
  g.add(m, edges)
  return g
}

/** The flat's kitchen, roughly: floor, a 90 cm counter with a cooktop inset 6 mm proud, and a wall. */
function kitchen() {
  const root = new THREE.Group()
  root.add(box([6, 0.02, 3], [3, -0.02, 1.5]))
  // Counter: carcass and a 4 cm top, like Fixtures.tsx draws it.
  const counter = new THREE.Group()
  counter.position.set(1.365, 0, 2.7)
  counter.add(box([1.45, 0.86, 0.56], [0, 0, -0.02]), box([1.45, 0.04, 0.6], [0, 0.86, 0]))
  root.add(counter)
  root.add(box([0.3, 0.006, 0.5], [1.74, 0.9, 2.72]))
  // A wall with a host (its top is not a place to set things down).
  root.add(box([0.1, 2.6, 3], [0, 0, 1.5], { host: 'entry' }))
  // A bookshelf (decor) 72 cm tall.
  root.add(box([1.4, 0.72, 0.33], [3.47, 0, 2.83], { decorId: 'shelf' }))
  root.updateMatrixWorld(true)
  return root
}

const rc = new THREE.Raycaster()
function pointerHit(root: THREE.Object3D, x: number, z: number) {
  rc.set(new THREE.Vector3(x, 3, z), new THREE.Vector3(0, -1, 0))
  for (const i of rc.intersectObject(root, true)) {
    const h = readIntersection(i)
    if (h) return h
  }
  return null
}

describe('surface placement on a fixture top', () => {
  it('placeAt on the counter returns the top height exactly', () => {
    const root = kitchen()
    const hit = pointerHit(root, 1.1, 2.7)!
    expect(hit.kind).toBe('up')
    expect(placeAt(furniture('espressoMachine'), hit)!.at![1]).toBe(0.9)
  })

  it('keeps millimeters: a cooktop 6 mm proud and a balcony floor at 6 mm are not rounded to 1 cm', () => {
    const root = kitchen()
    expect(placeAt(furniture('mugs'), pointerHit(root, 1.74, 2.72)!)!.at![1]).toBe(0.906)
    const floorHit = {
      point: new THREE.Vector3(7.8, 0.006, 1),
      normal: new THREE.Vector3(0, 1, 0),
      kind: 'up' as const,
    }
    expect(placeAt(lamp([0, -100, 0]), floorHit)!.at![1]).toBe(0.006)
  })

  it('a wall-hung piece (a floating shelf) is a surface, not a wall top', () => {
    const shelf = box([0.6, 0.035, 0.22], [1, 1.41, 2.89], { decorId: 'shelf', host: 'side-kitchen' })
    shelf.updateMatrixWorld(true)
    const hit = pointerHit(shelf, 1, 2.89)!
    expect(hit.host).toBeUndefined()
    expect(placeAt(furniture('mugs'), hit)!.at![1]).toBeCloseTo(1.445, 3)
  })
})

describe('restHeight', () => {
  it('reads the counter top under the piece, looking past edge lines', () => {
    const root = kitchen()
    expect(surfaceBelow(root, 1.1, 2.7, 0.95)).toBeCloseTo(0.9, 6)
    expect(restHeight(root, furniture('espressoMachine'), 1.1, 2.7, 0.95)).toBe(0.9)
  })

  it('rests on the highest surface under the footprint (a piece straddling the cooktop)', () => {
    const root = kitchen()
    // Mugs 44 cm wide centered 25 cm left of the cooktop: their right end is over it.
    expect(restHeight(root, furniture('mugs'), 1.5, 2.72, 0.95)).toBe(0.906)
  })

  it('drops to the floor when the grab offset puts the piece off the counter', () => {
    const root = kitchen()
    expect(restHeight(root, lamp([0, 0, 0]), 1.2, 1.5, 0.95)).toBe(0)
  })

  it('looks past the pieces being moved, and past all decor for floor pieces', () => {
    const root = kitchen()
    expect(restHeight(root, lamp([0, 0, 0]), 3.47, 2.83, 0.77)).toBe(0.72)
    expect(restHeight(root, lamp([0, 0, 0]), 3.47, 2.83, 0.77, { skipIds: new Set(['shelf']) })).toBe(0)
    expect(restHeight(root, lamp([0, 0, 0]), 3.47, 2.83, 0.77, { skipDecor: true })).toBe(0)
  })

  it('ignores hidden meshes (merged originals) and helpers', () => {
    const root = kitchen()
    const ghost = box([1, 0.5, 1], [5, 0, 1])
    ghost.visible = false
    const helper = box([1, 0.3, 1], [5, 0, 1], { editHelper: true })
    root.add(ghost, helper)
    root.updateMatrixWorld(true)
    expect(surfaceBelow(root, 5, 1, 1)).toBeCloseTo(0, 6)
  })

  it('never stands a piece on top of a wall', () => {
    const root = kitchen()
    expect(surfaceBelow(root, 0, 1.5, 3)).toBeNull()
  })

  it('samples the corners of a turned footprint', () => {
    const pts = restPoints({ ...furniture('mugs'), rotation: 90 }, 0, 0)
    expect(pts).toHaveLength(5)
    // Turned a quarter, the 44 cm length runs along z.
    expect(Math.max(...pts.map((p) => Math.abs(p[1])))).toBeCloseTo(0.176)
    expect(Math.max(...pts.map((p) => Math.abs(p[0])))).toBeCloseTo(0.06)
  })
})

describe('settleMoved', () => {
  it('drops a machine left floating 18 cm over the bookshelf onto it', () => {
    const root = kitchen()
    const m = furniture('espressoMachine', [3.87, 0.9, 2.82])
    expect(settleMoved([m], root)[0].at).toEqual([3.87, 0.72, 2.82])
  })

  it('moves a desk and the lamp on it rigidly', () => {
    const root = kitchen()
    const desk = furniture('standingDesk', [5, 0, 1])
    const l = lamp([5, 0.72, 1])
    expect(settleMoved([desk, l], root)[1].at[1]).toBe(0.72)
  })
})

describe('tabletop pieces', () => {
  it.each(['mugs', 'espressoMachine', 'standMixer', 'speakers', 'turntable', 'tv'] as const)(
    '%s climbs onto furniture',
    (t) => {
      expect(isTabletop(furniture(t))).toBe(true)
      expect(slidesOnFloor(furniture(t))).toBe(false)
    },
  )
  it.each(['bookshelf', 'standingDesk', 'sideboard', 'rug'] as const)('%s slides along the floor', (t) => {
    expect(slidesOnFloor(furniture(t))).toBe(true)
  })
})
