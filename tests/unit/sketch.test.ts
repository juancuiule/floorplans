import { describe, expect, it } from 'vitest'
import { rectPoints } from '../../src/model/polygon'
import { emptySketch, planFromSketch, readSketch, type Sketch, type SketchRoom } from '../../src/model/sketch'
import type { Wall } from '../../src/model/types'
import { validatePlan } from '../../src/model/validate'

const meta = { id: 'flat', name: 'Flat', location: { label: 'Madrid', lat: 40.4, lon: -3.7, tz: 1 } }
const room = (id: string, kind: SketchRoom['kind'], rect: [number, number, number, number]): SketchRoom => ({
  id,
  name: '',
  kind,
  points: rectPoints(rect),
})
const sketch = (patch: Partial<Sketch>): Sketch => ({ ...emptySketch(), ...patch })
const span = (w: Wall) => [w.a, w.b]

describe('planFromSketch', () => {
  it('turns one room into four exterior walls that close their corners, and a valid plan', () => {
    const plan = planFromSketch(sketch({ rooms: [room('r', 'living', [0, 0, 4, 3])] }), meta)
    expect(validatePlan(plan)).toEqual([])
    expect(plan.shell.walls).toHaveLength(4)
    expect(plan.shell.walls.every((w) => w.kind === 'exterior' && w.thickness === 0.2)).toBe(true)
    // Each runs 10 cm past the corner, so the corners are closed.
    expect(plan.shell.walls.map(span)).toContainEqual([
      [-0.1, 0],
      [4.1, 0],
    ])
    // The room's usable floor is inside the walls.
    expect(plan.shell.rooms[0].rect).toEqual([0.1, 0.1, 3.9, 2.9])
    expect(plan.shell.ceilings).toEqual([{ id: 'r', rect: [0, 0, 4, 3], height: 2.6, material: 'ceiling' }])
    expect(plan.subtitle).toBe('4.00 × 3.00 m · Madrid')
    expect(plan.sketch?.rooms).toHaveLength(1)
  })

  it('puts a partition between two rooms, one that can come out, and runs the outer walls on', () => {
    const plan = planFromSketch(
      sketch({ rooms: [room('a', 'living', [0, 0, 4, 3]), room('b', 'kitchen', [4, 0, 6, 3])] }),
      meta,
    )
    expect(validatePlan(plan)).toEqual([])
    const inner = plan.shell.walls.filter((w) => w.kind === 'interior')
    expect(inner.map(span)).toEqual([
      [
        [4, 0],
        [4, 3],
      ],
    ])
    expect(inner[0].thickness).toBe(0.1)
    expect(plan.walls.removable?.[inner[0].id]?.label).toBe('Living ↔ Kitchen')
    // The long walls are one wall each, across both rooms.
    expect(plan.shell.walls.filter((w) => w.kind === 'exterior')).toHaveLength(4)
    // Floors: living is the main zone, the kitchen the hall + kitchen zone.
    expect(plan.shell.baseFloors.map((f) => [f.id, f.material])).toEqual([
      ['a', 'floorMain'],
      ['b', 'floorHall'],
    ])
  })

  it('attaches doors and windows to the wall they sit on, and makes the glassiest wall the facade', () => {
    const plan = planFromSketch(
      sketch({
        rooms: [room('r', 'living', [0, 0, 5, 3])],
        openings: [
          { id: 'door', kind: 'door', at: [0, 1.5], width: 0.9 },
          { id: 'win', kind: 'window', at: [5, 1.5], width: 1.6 },
          { id: 'nowhere', kind: 'window', at: [2.5, 1.5], width: 1 },
        ],
      }),
      meta,
    )
    expect(validatePlan(plan)).toEqual([])
    const withOpenings = plan.shell.walls.filter((w) => w.openings?.length)
    expect(withOpenings.flatMap((w) => w.openings!.map((o) => o.id)).sort()).toEqual(['door', 'win'])
    const entry = plan.shell.walls.find((w) => w.openings?.some((o) => o.id === 'door'))!
    // The wall runs from z = -0.1; the door's center is at z = 1.5.
    expect(entry.openings![0]).toMatchObject({ kind: 'door', offset: 1.15, width: 0.9 })
    const facade = plan.shell.walls.find((w) => w.openings?.some((o) => o.id === 'win'))!
    expect(plan.walls.roles?.[facade.id]).toBe('facade')
    expect(Object.values(plan.walls.roles ?? {}).filter((r) => r === 'party')).toHaveLength(2)
  })

  it('makes a balcony: a facade wall onto it, railings round it, and no ceiling over it', () => {
    const plan = planFromSketch(
      sketch({
        rooms: [room('in', 'living', [0, 0, 4, 3]), room('out', 'balcony', [4, 0, 5.2, 3])],
        openings: [{ id: 'slide', kind: 'glassDoor', at: [4, 1.5], width: 2 }],
      }),
      meta,
    )
    expect(validatePlan(plan)).toEqual([])
    const railings = plan.fixtures.filter((f) => f.type === 'railing')
    expect(railings.map((r) => [r.position, r.rotation, r.size?.[0]])).toEqual([
      [[4.6, 0, 0], 0, 1.2],
      [[4.6, 0, 3], 0, 1.2],
      [[5.2, 0, 1.5], 90, 3],
    ])
    expect(plan.shell.ceilings.map((c) => c.id)).toEqual(['in'])
    expect(plan.shell.rooms.find((r) => r.id === 'out')?.floor).toBe('balconyFloor')
    const door = plan.shell.walls.find((w) => w.openings?.length)!
    expect(door.kind).toBe('exterior')
    expect(door.openings![0]).toMatchObject({ kind: 'window', sill: 0 })
    expect(plan.walls.roles?.[door.id]).toBe('facade')
  })

  it('places fittings and a downlight in each room', () => {
    const plan = planFromSketch(
      sketch({
        rooms: [room('b', 'bath', [0, 0, 2, 2])],
        fittings: [{ id: 'wc', type: 'toilet', at: [0.4, 1], rotation: 90 }],
      }),
      meta,
    )
    expect(plan.fixtures.map((f) => [f.id, f.type, f.position])).toEqual([
      ['wc', 'toilet', [0.4, 0, 1]],
      ['light-b', 'downlight', [1, 2.6, 1]],
    ])
    // A bathroom has its own floor, not a base floor zone.
    expect(plan.shell.baseFloors).toEqual([])
    expect(plan.shell.rooms[0].floor).toBe('bathFloor')
  })

  it('needs at least one indoor room', () => {
    expect(() => planFromSketch(sketch({ rooms: [room('o', 'balcony', [0, 0, 1, 1])] }), meta)).toThrow(
      /at least one room/,
    )
  })

  it('builds an L-shaped room: six outer walls, two floor pieces, one label with its area', () => {
    const L: SketchRoom = {
      id: 'l',
      name: 'Living',
      kind: 'living',
      points: [
        [0, 0],
        [3, 0],
        [3, 2],
        [6, 2],
        [6, 5],
        [0, 5],
      ],
    }
    const plan = planFromSketch(sketch({ rooms: [L] }), meta)
    expect(validatePlan(plan)).toEqual([])
    expect(plan.shell.walls).toHaveLength(6)
    expect(plan.shell.walls.every((w) => w.kind === 'exterior')).toBe(true)
    expect(plan.shell.baseFloors.map((f) => f.rect)).toEqual([
      [0, 0, 3, 5],
      [3, 2, 6, 5],
    ])
    // Usable floor: inside the outer walls, but not cut where the two pieces meet.
    expect(plan.shell.rooms.map((r) => [r.id, r.rect, r.label])).toEqual([
      ['l', [0.1, 0.1, 3, 4.9], true],
      ['l-2', [3, 2.1, 5.9, 4.9], false],
    ])
    expect(plan.shell.rooms[0].labelDims).toBe('24.0 m²')
    expect(plan.shell.ceilings).toHaveLength(2)
  })

  it('puts a partition only where an L-shaped room meets its neighbor', () => {
    const L: SketchRoom = {
      id: 'l',
      name: '',
      kind: 'living',
      points: [
        [0, 0],
        [3, 0],
        [3, 2],
        [6, 2],
        [6, 5],
        [0, 5],
      ],
    }
    const plan = planFromSketch(sketch({ rooms: [L, room('k', 'kitchen', [3, 0, 6, 2])] }), meta)
    expect(validatePlan(plan)).toEqual([])
    const inner = plan.shell.walls.filter((w) => w.kind === 'interior').map((w) => [w.a, w.b])
    expect(inner).toEqual([
      [
        [3, 2],
        [6, 2],
      ],
      [
        [3, 0],
        [3, 2],
      ],
    ])
  })

  it('refuses rooms with a slanted wall', () => {
    const slanted: SketchRoom = {
      id: 's',
      name: 'Odd',
      kind: 'living',
      points: [
        [0, 0],
        [4, 0],
        [3, 3],
        [0, 3],
      ],
    }
    expect(() => planFromSketch(sketch({ rooms: [slanted] }), meta)).toThrow(/Odd: every wall must run straight/)
  })

  it('reads version 1 sketches, whose rooms were rectangles', () => {
    const old = {
      version: 1 as const,
      rooms: [{ id: 'r', name: '', kind: 'living' as const, rect: [0, 0, 4, 3] as [number, number, number, number] }],
      openings: [],
      fittings: [],
      height: 2.6,
    }
    expect(readSketch(old).rooms[0].points).toEqual(rectPoints([0, 0, 4, 3]))
    expect(readSketch(old).version).toBe(2)
  })
})
