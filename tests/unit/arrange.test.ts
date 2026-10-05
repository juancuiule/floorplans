// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  align,
  distribute,
  followLead,
  hangGallery,
  matchSize,
  rotateAround,
  selectionFrame,
  unitsOf,
  type Patches,
} from '../../src/decor/arrange'
import { boxIn, FLOOR_FRAME, wallFrameOf, type Frame } from '../../src/decor/extent'
import type { ArtworkItem, DecorItem, FurnitureItem } from '../../src/model/decor'

const art = (id: string, x: number, y: number, w = 0.3, h = 0.4, groupId?: string): ArtworkItem => ({
  kind: 'artwork',
  id,
  image: '/artwork/a.png',
  at: [x, y, 0.1],
  facing: 'z+',
  host: 'w',
  size: { preset: 'custom', w, h },
  fit: 'cover',
  frame: { style: 'none', color: '#000', mat: 0 },
  ...(groupId ? { groupId } : {}),
})

const chair = (id: string, x: number, z: number): FurnitureItem => ({
  kind: 'furniture',
  id,
  type: 'chair',
  at: [x, 0, z],
  rotation: 0,
  size: [0.4, 0.8, 0.4],
  finish: { body: '#fff', metal: '#000', fabric: '#888' },
  options: {},
})

const apply = (items: DecorItem[], p: Patches) => items.map((i) => (p[i.id] ? ({ ...i, ...p[i.id] } as DecorItem) : i))
const boxes = (items: DecorItem[], f: Frame) => items.map((i) => boxIn(i, f))

describe('selectionFrame', () => {
  it('is the wall for pieces on walls facing the same way, the floor for floor pieces, none for a mix', () => {
    expect(selectionFrame([art('a', 1, 1.5), art('b', 2, 1.5)])).toMatchObject({ kind: 'wall', facing: 'z+' })
    expect(selectionFrame([chair('c', 1, 1), chair('d', 2, 1)])).toMatchObject({ kind: 'floor' })
    expect(selectionFrame([art('a', 1, 1.5), chair('c', 1, 1)])).toBeNull()
    expect(selectionFrame([art('a', 1, 1.5), { ...art('b', 1, 1.5), facing: 'x+' }])).toBeNull()
  })
})

describe('align', () => {
  const items = [art('a', 1, 1.4), art('b', 1.6, 1.55, 0.5, 0.7), art('c', 2.2, 1.3)]
  const f = wallFrameOf(items[0])

  it('aligns tops to the highest top, in one patch per moved piece', () => {
    const p = align(items, f, 'top')
    const tops = boxes(apply(items, p), f).map((b) => b.v1)
    expect(tops[0]).toBeCloseTo(1.9, 6)
    expect(tops[1]).toBeCloseTo(1.9, 6)
    expect(tops[2]).toBeCloseTo(1.9, 6)
    expect(Object.keys(p).sort()).toEqual(['a', 'c'])
    // Only height changed: still on the wall at the same spot along it.
    expect(p.a!.at![0]).toBe(1)
    expect(p.a!.at![2]).toBe(0.1)
  })

  it('aligns left edges and centers along the wall', () => {
    const left = boxes(apply(items, align(items, f, 'left')), f).map((b) => b.u0)
    left.forEach((u) => expect(u).toBeCloseTo(0.85, 6))
    const mid = boxes(apply(items, align(items, f, 'vmiddle')), f).map((b) => (b.v0 + b.v1) / 2)
    mid.forEach((v) => expect(v).toBeCloseTo(mid[0], 6))
  })

  it('moves whole groups as units when the selection holds more than one', () => {
    const g = [art('g1', 1, 1.5, 0.3, 0.4, 'G'), art('g2', 1.5, 1.7, 0.3, 0.4, 'G')]
    const loose = art('l', 3, 1.0)
    const all = [...g, loose]
    expect(unitsOf(all).map((u) => u.length)).toEqual([2, 1])
    const p = align(all, f, 'bottom')
    // The group's lowest piece lands on the loose piece's bottom; the group keeps its shape.
    const after = apply(all, p)
    expect(after[1].at[1] - after[0].at[1]).toBeCloseTo(0.2, 6)
    expect(boxIn(after[0], f).v0).toBeCloseTo(0.8, 6)
    // A selection that is one group aligns its members.
    expect(unitsOf(g).map((u) => u.length)).toEqual([1, 1])
  })

  it('aligns floor pieces in plan', () => {
    const cs = [chair('c1', 1, 1), chair('c2', 2, 1.3)]
    const p = align(cs, FLOOR_FRAME, 'top')
    expect(apply(cs, p).map((c) => c.at[2])).toEqual([1.3, 1.3])
  })
})

describe('distribute', () => {
  it('makes the gaps equal and keeps the ends in place', () => {
    const items = [art('a', 1, 1.5), art('b', 1.5, 1.5, 0.2), art('c', 2.8, 1.5)]
    const f = wallFrameOf(items[0])
    const after = boxes(apply(items, distribute(items, f, 'u')), f).sort((p, q) => p.u0 - q.u0)
    const g1 = after[1].u0 - after[0].u1
    const g2 = after[2].u0 - after[1].u1
    expect(g1).toBeCloseTo(g2, 6)
    expect(after[0].u0).toBeCloseTo(0.85, 6)
    expect(after[2].u1).toBeCloseTo(2.95, 6)
  })

  it('needs three pieces', () => {
    const items = [art('a', 1, 1.5), art('b', 2, 1.5)]
    expect(distribute(items, wallFrameOf(items[0]), 'u')).toEqual({})
  })
})

describe('matchSize', () => {
  it('copies print size and frame to the other artwork', () => {
    const src = { ...art('a', 1, 1.5, 0.5, 0.7), frame: { style: 'classic', color: '#fff', mat: 0.05 } } as ArtworkItem
    const p = matchSize([src, art('b', 2, 1.5)], src)
    expect(p).toEqual({ b: { size: src.size, frame: src.frame } })
  })
})

describe('hangGallery', () => {
  it('hangs a row centered where the pieces are, on the line, with the chosen gap', () => {
    const items = [art('a', 2, 1.2), art('b', 1, 1.8, 0.5, 0.7), art('c', 3, 1.5, 0.2, 0.3)]
    const f = wallFrameOf(items[0])
    const before = boxes(items, f)
    const center = (Math.min(...before.map((b) => b.u0)) + Math.max(...before.map((b) => b.u1))) / 2
    const after = boxes(apply(items, hangGallery(items, f, { layout: 'row', gap: 0.08, centerV: 1.5 })), f)
    // Order kept (b, a, c from left to right), gaps equal, centers on the line.
    const [b, a, c] = [after[1], after[0], after[2]]
    expect(a.u0 - b.u1).toBeCloseTo(0.08, 6)
    expect(c.u0 - a.u1).toBeCloseTo(0.08, 6)
    after.forEach((x) => expect((x.v0 + x.v1) / 2).toBeCloseTo(1.5, 6))
    expect((b.u0 + c.u1) / 2).toBeCloseTo(center, 6)
  })

  it('hangs a grid in reading order with columns and rows the gap apart', () => {
    const items = [art('a', 1, 1.8), art('b', 2, 1.8), art('c', 1, 1.2), art('d', 2, 1.2)]
    const f = wallFrameOf(items[0])
    const after = boxes(apply(items, hangGallery(items, f, { layout: 'grid', gap: 0.05, centerV: 1.5 })), f)
    const [a, b, c, d] = after
    expect(b.u0 - a.u1).toBeCloseTo(0.05, 6)
    expect(a.v0 - c.v1).toBeCloseTo(0.05, 6)
    expect(c.u0).toBeCloseTo(a.u0, 6)
    expect(d.u0).toBeCloseTo(b.u0, 6)
    expect((a.v1 + c.v0) / 2).toBeCloseTo(1.5, 6)
  })
})

describe('followLead', () => {
  it('keeps a wall piece’s offset when the lead slides along the same wall', () => {
    const lead = art('a', 1, 1.5)
    const f = art('b', 1.4, 1.7)
    const p = followLead(lead, { ...lead, at: [2, 1.3, 0.1] }, f)
    expect(p.at).toEqual([2.4, 1.5, 0.1])
  })

  it('carries wall pieces onto another wall, keeping the arrangement along it', () => {
    const lead = art('a', 1, 1.5)
    const f = art('b', 1.4, 1.7)
    // Onto a wall facing x-, whose "right" (as you face it) is +z.
    const to = { ...lead, facing: 'x-', host: 'w2', at: [5, 1.5, 2] } as ArtworkItem
    const p = followLead(lead, to, f) as Partial<ArtworkItem>
    expect(p.facing).toBe('x-')
    expect(p.host).toBe('w2')
    expect(p.at![0]).toBeCloseTo(5, 6)
    expect(p.at![1]).toBeCloseTo(1.7, 6)
    expect(p.at![2]).toBeCloseTo(2.4, 6)
  })

  it('moves floor pieces by the lead’s plan offset', () => {
    const lead = chair('a', 1, 1)
    const p = followLead(lead, { ...lead, at: [1.5, 0, 0.8] }, chair('b', 2, 2))
    expect(p.at).toEqual([2.5, 0, 1.8])
  })
})

describe('rotateAround', () => {
  it('turns a selection rigidly about its center', () => {
    const p = rotateAround([chair('a', 1, 1), chair('b', 2, 1)], 90)
    // Around (1.5, 1): a goes to z = 1 + 0.5, b to z = 1 - 0.5; both turn 90°.
    expect(p.a).toMatchObject({ at: [1.5, 0, 1.5], rotation: 90 })
    expect(p.b).toMatchObject({ at: [1.5, 0, 0.5], rotation: 90 })
  })

  it('turns a single piece in place', () => {
    expect(rotateAround([chair('a', 1, 1)], -90).a).toMatchObject({ at: [1, 0, 1], rotation: 270 })
  })
})
