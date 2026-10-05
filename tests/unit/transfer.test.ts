import { describe, expect, it } from 'vitest'
import monoambiente from '../../examples/monoambiente/plans/monoambiente.plan.json'
import { fitLayout } from '../../src/decor/transfer'
import type { ArtworkItem, DecorFile, FurnitureItem } from '../../src/model/decor'
import type { Plan } from '../../src/model/plan'
import { emptySketch, planFromSketch, type SketchRoom } from '../../src/model/sketch'
import type { Vec2 } from '../../src/model/types'

// The Monoambiente traced again from a picture of its plan, as in the floor plan
// editor: the same rooms, 1.1 m right and 1.35 m down, walls where tracing put them.
const room = (id: string, name: string, kind: SketchRoom['kind'], points: Vec2[]): SketchRoom => ({
  id,
  name,
  kind,
  points,
})
const traced = planFromSketch(
  {
    ...emptySketch(),
    rooms: [
      room('bath', 'Bathroom', 'bath', [
        [1.1, 1.35],
        [3.25, 1.35],
        [3.25, 2.1],
        [2.4, 2.1],
        [2.4, 2.7],
        [1.1, 2.7],
      ]),
      room('kitchen', 'Kitchen', 'kitchen', [
        [1.1, 2.7],
        [2.4, 2.7],
        [2.4, 2.1],
        [3.25, 2.1],
        [3.25, 4.35],
        [1.1, 4.35],
      ]),
      room('living', 'Living', 'living', [
        [3.25, 1.35],
        [8.1, 1.35],
        [8.1, 4.35],
        [3.25, 4.35],
      ]),
      room('balcony', 'Balcony', 'balcony', [
        [8.1, 1.35],
        [9.5, 1.35],
        [9.5, 4.35],
        [8.1, 4.35],
      ]),
    ],
  },
  { id: 'traced', name: 'Traced', location: monoambiente.location },
)
const original = monoambiente as unknown as Plan

const art = (id: string, at: [number, number, number], facing: ArtworkItem['facing'], host: string): ArtworkItem => ({
  kind: 'artwork',
  id,
  image: '/a.png',
  at,
  facing,
  host,
  size: { preset: 'A4', w: 0.21, h: 0.297 },
  fit: 'cover',
  frame: { style: 'thin', color: '#000', mat: 0 },
})
const bed: FurnitureItem = {
  kind: 'furniture',
  id: 'bed',
  type: 'platformBed',
  at: [3.22, 0, 0.7],
  rotation: 90,
  size: [1.4, 0.7, 2.04],
  finish: { body: '#dcc196', metal: '#1d1d1d', fabric: '#e6e0d4' },
  options: {},
}
const layout: DecorFile = {
  version: 1,
  items: [
    // On the wall between the entry and the main room, and on the side wall the bathroom shares.
    art('gallery', [2.2, 1.5, 0.38], 'x+', 'entry-main'),
    art('side', [3, 1.5, 0], 'z+', 'side-bath'),
    bed,
  ],
  finishes: {
    wallPaint: '#f8f7f3',
    paint: { 'side-bath:+:main-room': '#5b5c5f' },
    structure: { removedWalls: ['entry-main'], raiseEntryCeiling: true },
  },
}

describe('fitLayout', () => {
  const fitted = fitLayout(layout, original, traced)
  const item = (id: string) => fitted.items.find((i) => i.id === id)!
  const wall = (id: string) => traced.shell.walls.find((w) => w.id === id)!

  it('moves what stands on the floor from the old inside to the new one', () => {
    // The insides are the same size, 1.1 m right and 1.35 m down.
    expect(item('bed').at).toEqual([4.32, 0, 2.05])
    expect(fitted.plan).toBe('traced')
  })

  it('hangs wall items on the wall of the new plan facing the same way, on its face', () => {
    const gallery = item('gallery') as ArtworkItem
    const host = wall(gallery.host!)
    // The partition between the bathroom and the living room, x = 3.25; its living-room face is at 3.3.
    expect(host.a[0]).toBe(3.25)
    expect(host.b[0]).toBe(3.25)
    expect(gallery.at).toEqual([3.3, 1.5, 1.73])
    const side = item('side') as ArtworkItem
    // The outer wall stands outside the traced rooms: its inner face is the rooms' edge, z = 1.35.
    expect(wall(side.host!).kind).toBe('exterior')
    expect(side.at[2]).toBe(1.35)
  })

  it('moves paint onto the matching wall face, and puts taken-out walls back', () => {
    const keys = Object.keys(fitted.finishes!.paint!)
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatch(/^outer-\d+:[+-]:living$/)
    expect(keys[0].split(':')[0]).toBe((item('side') as ArtworkItem).host)
    expect(fitted.finishes!.structure).toBeUndefined()
    expect(fitted.finishes!.wallPaint).toBe('#f8f7f3')
  })
})
