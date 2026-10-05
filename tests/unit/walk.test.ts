// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { FURNITURE } from '../../src/decor/furnitureCatalog'
import type { FurnitureItem, FurnitureType } from '../../src/model/decor'
import type { Vec2 } from '../../src/model/types'
import { pushOut, rayHit } from '../../src/plan/obstacles'
import { BODY_RADIUS, ENTRY_SPOT, insideFlat, resolve, walk, walkObstacles } from '../../src/plan/walk'

const piece = (
  type: FurnitureType,
  at: [number, number, number],
  rotation = 0,
  size = FURNITURE[type].size,
): FurnitureItem => ({
  kind: 'furniture',
  id: `f-${type}`,
  type,
  at,
  rotation,
  size: [...size],
  finish: { ...FURNITURE[type].finish },
  options: { ...FURNITURE[type].options },
})

const obstacles = walkObstacles([])

/** Walks in small steps, like frames. */
function stroll(from: Vec2, dir: Vec2, meters: number, obs = obstacles): Vec2 {
  let p = from
  const steps = Math.ceil(meters / 0.03)
  for (let i = 0; i < steps; i++) p = walk(p, [(dir[0] * meters) / steps, (dir[1] * meters) / steps], obs)
  return p
}

describe('rectangle helpers', () => {
  const box = { cx: 0, cz: 0, hw: 1, hd: 0.5, rotation: 0 }
  it('pushes a disc out of the nearest side', () => {
    expect(pushOut(box, [1.1, 0], 0.2)).toEqual([1.2, 0])
    expect(pushOut(box, [0, 0.4], 0.2)?.[1]).toBeCloseTo(0.7)
    expect(pushOut(box, [2, 0], 0.2)).toBeNull()
  })
  it('handles turned rectangles', () => {
    const turned = { ...box, rotation: 90 }
    // Local x now runs along -z: the long side spans z −1..1.
    expect(pushOut(turned, [0, 1.1], 0.2)?.[1]).toBeCloseTo(1.2)
    expect(pushOut(turned, [0.6, 0], 0.2)?.[0]).toBeCloseTo(0.7)
  })
  it('casts rays at rectangles', () => {
    expect(rayHit(box, [-3, 0], [1, 0])).toBeCloseTo(2)
    expect(rayHit(box, [-3, 2], [1, 0])).toBe(Infinity)
    expect(rayHit(box, [0, 0], [1, 0])).toBe(0)
    expect(rayHit(box, [3, 0], [1, 0])).toBe(Infinity)
  })
})

describe('walk collision', () => {
  it('starts at the entry in free space', () => {
    expect(resolve(ENTRY_SPOT, obstacles)).toEqual(ENTRY_SPOT)
  })

  it('stops at the entry wall, a body radius from its face', () => {
    const p = stroll([1, 1.9], [-1, 0], 2)
    // The front door is shut: its opening counts as wall.
    expect(p[0]).toBeCloseTo(BODY_RADIUS, 2)
  })

  it('walks through the passage into the main room', () => {
    const p = stroll([1.2, 1.9], [1, 0], 3)
    expect(p[0]).toBeCloseTo(4.2, 1)
  })

  it('does not pass through the partition beside the passage', () => {
    // z = 0.9 is solid wall between the entry and the main room.
    const p = stroll([1.8, 1.05], [1, 0], 2)
    expect(p[0]).toBeLessThan(2.1 - BODY_RADIUS + 0.001)
  })

  it('slides along a wall instead of sticking to it', () => {
    const p = stroll([4, 2.5], [1, 1], 1)
    expect(p[1]).toBeCloseTo(3 - BODY_RADIUS, 2)
    expect(p[0]).toBeGreaterThan(4.6)
  })

  it('goes out through the balcony door and stops at the railing', () => {
    const p = stroll([6, 1.5], [1, 0], 4)
    expect(p[0]).toBeGreaterThan(7.9)
    expect(p[0]).toBeLessThan(8.35 - BODY_RADIUS + 0.001)
  })

  it('never tunnels through a wall on a long step', () => {
    const p = walk([1.8, 1.05], [2, 0], obstacles)
    expect(p[0]).toBeLessThan(2.1)
  })

  it('bumps into floor furniture but not into rugs', () => {
    const wardrobe = piece('wardrobe', [4.5, 0, 1.5])
    const withWardrobe = walkObstacles([wardrobe])
    const p = stroll([3, 1.5], [1, 0], 3, withWardrobe)
    expect(p[0]).toBeCloseTo(4.5 - wardrobe.size[0] / 2 - BODY_RADIUS, 2)
    const withRug = walkObstacles([piece('rug', [4.5, 0, 1.5])])
    expect(stroll([3, 1.5], [1, 0], 1.5, withRug)[0]).toBeCloseTo(4.5, 2)
  })

  it('pushes a start spot out of a wall', () => {
    const p = resolve([2.15, 0.9], obstacles)
    expect(Math.abs(p[0] - 2.15)).toBeGreaterThanOrEqual(0.05 + BODY_RADIUS - 1e-9)
  })

  it('knows the floor of the flat and the balcony', () => {
    expect(insideFlat(3, 1.5)).toBe(true)
    expect(insideFlat(8, 3.1)).toBe(true)
    expect(insideFlat(-0.5, 1)).toBe(false)
    expect(insideFlat(9, 1)).toBe(false)
  })
})
