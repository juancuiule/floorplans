// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { carry, supportOf } from '../../src/decor/carry'
import type { DecorItem, FurnitureItem, LampItem, PlantItem } from '../../src/model/decor'
import type { Vec3 } from '../../src/model/types'

const finish = { body: '#c49c6c', metal: '#1d1d1d', fabric: '#e6e0d4' }
const desk = (at: Vec3, rotation = 0, size: Vec3 = [1.4, 0.72, 0.7]): FurnitureItem => ({
  kind: 'furniture',
  id: 'desk',
  type: 'standingDesk',
  at,
  rotation,
  size,
  finish,
  options: {},
})
const lamp = (at: Vec3, id = 'lamp'): LampItem => ({
  kind: 'lamp',
  id,
  type: 'table',
  at,
  rotation: 0,
  on: true,
  brightness: 1,
  warmth: 2700,
  color: '#eee',
})
const plant = (at: Vec3, id = 'plant'): PlantItem => ({
  kind: 'plant',
  id,
  species: 'succulent',
  pot: 'clay',
  at,
  rotation: 0,
  scale: 1,
})
const byId = (items: DecorItem[]) => Object.fromEntries(items.map((i) => [i.id, i]))

describe('what rests on what', () => {
  it('finds the piece an item stands on, and not the floor under it', () => {
    const d = desk([4, 0, 1])
    expect(supportOf(lamp([4.3, 0.72, 1.1]), [d])?.id).toBe('desk')
    expect(supportOf(plant([4.3, 0, 1.1]), [d])).toBeNull()
    expect(supportOf(lamp([5.2, 0.72, 1]), [d])).toBeNull()
  })

  it('reads wall shelves in their own frame (out from the wall)', () => {
    const shelf: FurnitureItem = {
      kind: 'furniture',
      id: 'shelf',
      type: 'floatingShelf',
      at: [3, 1.2, 0],
      rotation: 0,
      facing: 'z+',
      host: 'side-bath',
      size: [0.9, 0.035, 0.22],
      finish,
      options: {},
    }
    expect(supportOf(plant([3.2, 1.235, 0.1]), [shelf])?.id).toBe('shelf')
    expect(supportOf(plant([3.2, 1.235, -0.1]), [shelf])).toBeNull()
  })
})

describe('carrying', () => {
  it('moves riders with a piece that moves', () => {
    const prev = [desk([4, 0, 1]), lamp([4.3, 0.72, 1.1])]
    const out = byId(carry(prev, [desk([5, 0, 1.5]), prev[1]]))
    expect(out.lamp.at).toEqual([5.3, 0.72, 1.6])
  })

  it('turns riders around the piece and turns them too', () => {
    const prev = [desk([4, 0, 1]), lamp([4.5, 0.72, 1])]
    const out = byId(carry(prev, [desk([4, 0, 1], 90), prev[1]])) as Record<string, LampItem>
    // Local +x turned 90° points to plan −z.
    expect(out.lamp.at[0]).toBeCloseTo(4, 3)
    expect(out.lamp.at[2]).toBeCloseTo(0.5, 3)
    expect(out.lamp.rotation).toBe(90)
  })

  it('keeps things on top when the top changes height (the standing desk goes up)', () => {
    const prev = [desk([4, 0, 1]), lamp([4.3, 0.72, 1.1])]
    const out = byId(carry(prev, [desk([4, 0, 1], 0, [1.4, 1.1, 0.7]), prev[1]]))
    expect(out.lamp.at[1]).toBe(1.1)
  })

  it('keeps the load on a piece that gets smaller', () => {
    const prev = [desk([4, 0, 1]), lamp([4.65, 0.72, 1.3])]
    const out = byId(carry(prev, [desk([4, 0, 1], 0, [1.0, 0.72, 0.5]), prev[1]]))
    expect(out.lamp.at[0]).toBeCloseTo(4.5, 3)
    expect(out.lamp.at[2]).toBeCloseTo(1.25, 3)
  })

  it('carries a stack: a plant on a turntable on a sideboard', () => {
    const sideboard: FurnitureItem = {
      kind: 'furniture',
      id: 'sb',
      type: 'sideboard',
      at: [4, 0, 2.8],
      rotation: 180,
      size: [1.6, 0.5, 0.42],
      finish,
      options: {},
    }
    const deck: FurnitureItem = {
      kind: 'furniture',
      id: 'tt',
      type: 'turntable',
      at: [4.2, 0.5, 2.8],
      rotation: 180,
      size: [0.45, 0.157, 0.352],
      finish,
      options: {},
    }
    const p = plant([4.25, 0.657, 2.8])
    const out = byId(carry([sideboard, deck, p], [{ ...sideboard, at: [5, 0, 2.8] }, deck, p]))
    expect(out.tt.at).toEqual([5.2, 0.5, 2.8])
    expect(out.plant.at).toEqual([5.25, 0.657, 2.8])
  })

  it('leaves alone what moved on its own, and pieces with nothing on them', () => {
    const prev = [desk([4, 0, 1]), lamp([4.3, 0.72, 1.1])]
    const next = [desk([5, 0, 1]), lamp([2, 0, 2])]
    expect(carry(prev, next)).toBe(next)
    const alone = [desk([4, 0, 1])]
    const moved = [desk([5, 0, 1])]
    expect(carry(alone, moved)).toBe(moved)
  })
})
