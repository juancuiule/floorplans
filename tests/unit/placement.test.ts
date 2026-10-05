// @vitest-environment node
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  alongWall,
  ceilingAt,
  facingOf,
  facingRotation,
  mountOf,
  placeAt,
  snapToWalls,
  type SurfaceHit,
} from '../../src/decor/placement'
import { FURNITURE } from '../../src/decor/furnitureCatalog'
import type { ArtworkItem, Facing, FurnitureItem, FurnitureType, LampItem, PlantItem } from '../../src/model/decor'

const furniture = (type: FurnitureType, size = FURNITURE[type].size): FurnitureItem => ({
  kind: 'furniture',
  id: `f-${type}`,
  type,
  at: [0, -100, 0],
  rotation: 0,
  size: [...size],
  finish: { ...FURNITURE[type].finish },
  options: { ...FURNITURE[type].options },
})
const artwork: ArtworkItem = {
  kind: 'artwork',
  id: 'a',
  image: '/artwork/x.png',
  at: [0, -100, 0],
  facing: 'z+',
  size: { preset: 'A4', w: 0.21, h: 0.297 },
  fit: 'cover',
  frame: { style: 'thin', color: '#000000', mat: 0 },
}
const plant = (species: PlantItem['species']): PlantItem => ({
  kind: 'plant',
  id: 'p',
  species,
  pot: 'clay',
  at: [0, -100, 0],
  rotation: 0,
  scale: 1,
})
const lamp = (type: LampItem['type']): LampItem => ({
  kind: 'lamp',
  id: 'l',
  type,
  at: [0, -100, 0],
  rotation: 0,
  on: true,
  brightness: 1,
  warmth: 2700,
  color: '#ffffff',
})

const floorHit = (x: number, z: number, y = 0): SurfaceHit => ({
  point: new THREE.Vector3(x, y, z),
  normal: new THREE.Vector3(0, 1, 0),
  kind: 'up',
})
const wallHit = (p: [number, number, number], n: [number, number, number], host?: string): SurfaceHit => ({
  point: new THREE.Vector3(...p),
  normal: new THREE.Vector3(...n),
  kind: 'wall',
  host,
})

describe('facingOf', () => {
  it.each([
    [[1, 0, 0], 'x+'],
    [[-1, 0, 0], 'x-'],
    [[0, 0, 1], 'z+'],
    [[0, 0, -1], 'z-'],
    [[0.6, 0, -0.4], 'x+'],
    [[0.2, 0.1, -0.9], 'z-'],
    // Ties go to x.
    [[-0.5, 0, 0.5], 'x-'],
  ] as const)('%j → %s', (n, f) => {
    expect(facingOf(new THREE.Vector3(...n))).toBe(f)
  })
})

describe('alongWall', () => {
  const normals: Record<Facing, [number, number]> = { 'x+': [1, 0], 'x-': [-1, 0], 'z+': [0, 1], 'z-': [0, -1] }
  it.each(Object.keys(normals) as Facing[])('is a unit vector along the %s wall', (f) => {
    const [ax, az] = alongWall(f)
    expect(Math.hypot(ax, az)).toBeCloseTo(1)
    expect(ax * normals[f][0] + az * normals[f][1]).toBeCloseTo(0)
  })
  it('matches the item rotation (local +x after rotating by facingRotation)', () => {
    for (const f of Object.keys(facingRotation) as Facing[]) {
      const v = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), facingRotation[f])
      const [ax, az] = alongWall(f)
      expect(ax).toBeCloseTo(v.x)
      expect(az).toBeCloseTo(v.z)
      // And local +z lands on the facing normal.
      const z = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), facingRotation[f])
      expect(z.x).toBeCloseTo(normals[f][0])
      expect(z.z).toBeCloseTo(normals[f][1])
    }
  })
})

describe('ceilingAt', () => {
  it('is 2.40 under the dropped ceiling of the entry zone', () => {
    expect(ceilingAt(1.0, 2.0)).toBe(2.4)
    expect(ceilingAt(0.1, 0.1)).toBe(2.4)
  })
  it('is 2.60 in the main room and on the balcony', () => {
    expect(ceilingAt(4.5, 1.5)).toBe(2.6)
    expect(ceilingAt(7.5, 1.5)).toBe(2.6)
  })
  it('falls back to 2.60 outside any ceiling', () => {
    expect(ceilingAt(20, 20)).toBe(2.6)
  })
})

describe('mountOf', () => {
  it('uses the catalogs', () => {
    expect(mountOf(artwork)).toBe('wall')
    expect(mountOf(plant('monstera'))).toBe('surface')
    expect(mountOf(plant('pothos'))).toBe('ceiling')
    expect(mountOf(plant('windowBox'))).toBe('wall')
    expect(mountOf(lamp('arc'))).toBe('surface')
    expect(mountOf(lamp('pendant'))).toBe('ceiling')
    expect(mountOf(lamp('sconce'))).toBe('wall')
    expect(mountOf(furniture('standingDesk'))).toBe('surface')
    expect(mountOf(furniture('gridShelf'))).toBe('wall')
    expect(mountOf(furniture('hangingRack'))).toBe('ceiling')
  })
})

describe('placeAt', () => {
  it('rejects floor and ceiling hits for artwork', () => {
    expect(placeAt(artwork, floorHit(4, 1.5))).toBeNull()
    expect(placeAt(artwork, { ...floorHit(4, 1.5, 2.6), kind: 'down', normal: new THREE.Vector3(0, -1, 0) })).toBeNull()
  })

  it('hangs artwork on a wall with its facing and host, rounded to cm', () => {
    const patch = placeAt(artwork, wallHit([3.4567, 1.5012, 2.999], [0, 0, -1], 'side-kitchen'))
    expect(patch).toEqual({ at: [3.46, 1.5, 3], facing: 'z-', host: 'side-kitchen' })
  })

  it('anchors wall furniture by its bottom edge, centered on the pointer', () => {
    const shelf = furniture('gridShelf')
    const patch = placeAt(shelf, wallHit([4, 1.6, 0], [0, 0, 1], 'side-bath')) as Partial<FurnitureItem>
    expect(patch.at?.[1]).toBeCloseTo(1.6 - shelf.size[1] / 2, 2)
    expect(patch.facing).toBe('z+')
    // Never below the floor.
    const low = placeAt(shelf, wallHit([4, 0.05, 0], [0, 0, 1])) as Partial<FurnitureItem>
    expect(low.at?.[1]).toBe(0)
  })

  it('rejects wall hits for floor plants and lamps', () => {
    expect(placeAt(plant('monstera'), wallHit([4, 1, 0], [0, 0, 1]))).toBeNull()
    expect(placeAt(lamp('arc'), wallHit([4, 1, 0], [0, 0, 1]))).toBeNull()
    expect(placeAt(plant('windowBox'), floorHit(4, 1))).toBeNull()
  })

  it('sets plants down where the pointer is', () => {
    expect(placeAt(plant('monstera'), floorHit(4.123, 1.456))).toEqual({ at: [4.12, 0, 1.46] })
    // On top of furniture too.
    expect(placeAt(plant('succulent'), floorHit(4, 0.3, 0.72))).toEqual({ at: [4, 0.72, 0.3] })
  })

  it('hangs ceiling items at the ceiling height of the zone', () => {
    expect(placeAt(lamp('pendant'), floorHit(4, 1.5))).toEqual({ at: [4, 2.6, 1.5] })
    expect(placeAt(lamp('pendant'), floorHit(1, 2))).toEqual({ at: [1, 2.4, 2] })
    expect(placeAt(plant('pothos'), floorHit(1, 2))).toEqual({ at: [1, 2.4, 2] })
  })

  it('snaps wall-hugging furniture on the floor, unless free or on a raised surface', () => {
    const desk = furniture('standingDesk')
    expect(placeAt(desk, floorHit(4, 0.2))).toEqual({ at: [4, 0, 0.35], rotation: 0 })
    expect(placeAt(desk, floorHit(4, 0.2), { free: true })).toEqual({ at: [4, 0, 0.2] })
    expect(placeAt(desk, floorHit(4, 0.2, 0.4))).toEqual({ at: [4, 0.4, 0.2] })
  })

  it('leaves tables, chairs and rugs where they are dropped', () => {
    for (const t of ['diningTable', 'chair', 'butterflyChair', 'rug'] as const) {
      expect(placeAt(furniture(t), floorHit(4, 0.2))).toEqual({ at: [4, 0, 0.2] })
    }
  })
})

describe('snapToWalls', () => {
  const desk = furniture('standingDesk') // 1.40 × 0.70

  it('backs a 70 cm desk flush onto the bath-side wall, facing into the room', () => {
    expect(snapToWalls(4, 0.2, desk)).toMatchObject({ x: 4, z: 0.35, rotation: 0 })
    // From the other side of its final spot too.
    expect(snapToWalls(4, 0.7, desk)).toMatchObject({ x: 4, z: 0.35, rotation: 0 })
  })

  it('faces the kitchen-side wall the other way', () => {
    expect(snapToWalls(4, 2.8, desk)).toMatchObject({ x: 4, z: 2.65, rotation: 180 })
  })

  it('turns to face the room against the facade and the entry-main partition', () => {
    const shelf = furniture('bookshelf') // 0.33 deep
    expect(snapToWalls(6.7, 1.0, shelf)).toMatchObject({ x: 6.73, z: 1.0, rotation: 270 })
    expect(snapToWalls(2.4, 1.0, shelf)).toMatchObject({ x: 2.37, z: 1.0, rotation: 90 })
  })

  it('slides into the balcony-side corner', () => {
    expect(snapToWalls(6.5, 0.2, desk)).toMatchObject({ x: 6.2, z: 0.35, rotation: 0 })
  })

  it('slides into the corner by the entry-main partition', () => {
    expect(snapToWalls(2.6, 0.2, desk)).toMatchObject({ x: 2.9, z: 0.35, rotation: 0 })
  })

  it('does not move pieces that already clear the side wall', () => {
    const r = snapToWalls(5.2, 0.2, desk)
    expect(r).toMatchObject({ x: 5.2, z: 0.35, rotation: 0 })
  })

  it('returns null in the middle of the room', () => {
    expect(snapToWalls(4.5, 1.5, desk)).toBeNull()
  })

  const insideMainRoom = (x: number, z: number) => {
    const r = snapToWalls(x, z, desk)
    expect(r).not.toBeNull()
    const along = r!.rotation % 180 === 0
    const hw = (along ? desk.size[0] : desk.size[2]) / 2
    const hd = (along ? desk.size[2] : desk.size[0]) / 2
    expect(r!.x - hw).toBeGreaterThanOrEqual(2.2 - 0.01)
    expect(r!.x + hw).toBeLessThanOrEqual(6.9 + 0.01)
    expect(r!.z - hd).toBeGreaterThanOrEqual(0 - 0.01)
    expect(r!.z + hd).toBeLessThanOrEqual(3.0 + 0.01)
  }

  it('keeps the whole footprint inside the main room when snapped into a corner', () => {
    insideMainRoom(6.8, 0.1)
    insideMainRoom(6.8, 2.9)
    insideMainRoom(2.3, 2.9)
    insideMainRoom(2.3, 0.3)
  })

  // KNOWN BUG (src/decor/placement.ts, snapToWalls, the "Perpendicular walls" loop):
  // the loop considers the bath-niche wall (x = 1.3, z 0.7–1.4) that sits behind the
  // entry-main partition, because the depth range [0, 0.704] touches its z-range by the
  // 4 mm GAP. It shifts the desk to x = 2.05, and the next wall face (entry-main, x = 2.1,
  // looking -x) then pushes it to x = 1.40, straight through the partition into the shower.
  // Actual: { x: 1.4, z: 0.35 }, expected { x: 2.9, z: 0.35 }.
  it('slides into the bath-side corner by the entry-main partition from x = 2.3', () => {
    expect(snapToWalls(2.3, 0.1, desk)).toMatchObject({ x: 2.9, z: 0.35, rotation: 0 })
  })

  it('never ends up inside a wall when dropped along the bath-side wall of the main room', () => {
    for (let x = 2.6; x <= 6.8; x += 0.1) insideMainRoom(x, 0.1)
  })
})
