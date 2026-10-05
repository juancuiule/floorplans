// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { outwardNormal, openingById, wallFrame, wallPieces, type WallPiece } from '../../src/geometry/walls'
import type { Wall } from '../../src/model/types'
import { shell } from '../../src/project'

const wall = (id: string) => {
  const w = shell.walls.find((x) => x.id === id)
  if (!w) throw new Error(`no wall ${id}`)
  return w
}
const STUB = 0.3
const r6 = (v: number) => Math.round(v * 1e6) / 1e6
/** Sorted and rounded to the micron, so float noise (1.6 + 1.0) does not matter. */
const sortPieces = (ps: WallPiece[]) =>
  ps
    .map((p) => ({ ...p, s0: r6(p.s0), s1: r6(p.s1), y0: r6(p.y0), y1: r6(p.y1) }))
    .sort((a, b) => a.s0 - b.s0 || a.y0 - b.y0)
/** Sum of piece areas: the solid part of the wall face. */
const area = (ps: WallPiece[]) => ps.reduce((s, p) => s + (p.s1 - p.s0) * (p.y1 - p.y0), 0)

describe('wallFrame', () => {
  it('gives the entry wall a +z direction, a -x normal and its full length', () => {
    const f = wallFrame(wall('entry'))
    expect(f.length).toBeCloseTo(3.4)
    expect(f.u[0]).toBeCloseTo(0)
    expect(f.u[1]).toBeCloseTo(1)
    expect(f.n[0]).toBeCloseTo(-1)
    expect(f.n[1]).toBeCloseTo(0)
    expect(f.rotY).toBeCloseTo(-Math.PI / 2)
    expect(f.origin).toEqual([-0.1, -0.2])
  })

  it('rotY maps local +x onto u for every wall', () => {
    for (const w of shell.walls) {
      const f = wallFrame(w)
      // Rotation about +y by θ maps (1,0,0) to (cos θ, 0, -sin θ).
      expect(Math.cos(f.rotY)).toBeCloseTo(f.u[0])
      expect(-Math.sin(f.rotY)).toBeCloseTo(f.u[1])
      expect(Math.hypot(...f.u)).toBeCloseTo(1)
      expect(f.u[0] * f.n[0] + f.u[1] * f.n[1]).toBeCloseTo(0)
    }
  })
})

describe('wallPieces', () => {
  it('splits the entry wall around the front door, cut at the stub height', () => {
    const ps = sortPieces(wallPieces(wall('entry'), STUB))
    expect(ps).toEqual(
      sortPieces([
        // Left of the door, split into stub + upper.
        { s0: 0, s1: 1.6, y0: 0, y1: STUB, stub: true },
        { s0: 0, s1: 1.6, y0: STUB, y1: 2.6, stub: false },
        // Header above the door (2.05 → 2.60), entirely above the cut.
        { s0: 1.6, s1: 2.6, y0: 2.05, y1: 2.6, stub: false },
        // Right of the door.
        { s0: 2.6, s1: 3.4, y0: 0, y1: STUB, stub: true },
        { s0: 2.6, s1: 3.4, y0: STUB, y1: 2.6, stub: false },
      ]),
    )
    // Nothing fills the doorway itself below the header.
    expect(ps.some((p) => p.s0 < 2.6 && p.s1 > 1.6 && p.y0 < 2.05)).toBe(false)
    expect(area(ps)).toBeCloseTo(3.4 * 2.6 - 1.0 * 2.05)
  })

  it('leaves only the header above the full-width balcony window', () => {
    const ps = wallPieces(wall('facade'), STUB)
    expect(ps).toHaveLength(1)
    expect(ps[0].s0).toBeCloseTo(0)
    expect(ps[0].s1).toBeCloseTo(3.0)
    expect(ps[0].y0).toBeCloseTo(2.2)
    expect(ps[0].y1).toBeCloseTo(2.6)
    expect(ps[0].stub).toBe(false)
  })

  it('keeps the bath-hall partition solid around the bathroom door', () => {
    const ps = wallPieces(wall('bath-hall'), STUB)
    expect(area(ps)).toBeCloseTo(1.25 * 2.6 - 0.9 * 2.05)
    expect(ps.filter((p) => p.stub)).toHaveLength(2)
  })

  it('returns a plain wall as a stub and an upper box', () => {
    const ps = sortPieces(wallPieces(wall('side-bath'), STUB))
    expect(ps).toEqual([
      { s0: 0, s1: 7.1, y0: 0, y1: STUB, stub: true },
      { s0: 0, s1: 7.1, y0: STUB, y1: 2.6, stub: false },
    ])
  })

  it('splits a sill that rises above the stub and clamps openings that overhang the wall', () => {
    const w: Wall = {
      id: 't',
      a: [0, 0],
      b: [4, 0],
      thickness: 0.2,
      height: 2.6,
      kind: 'exterior',
      material: 'plaster',
      openings: [
        // Deliberately out of order to check sorting.
        { id: 'w2', kind: 'window', offset: 3.5, width: 1.0, height: 1.2, sill: 0.9 },
        { id: 'w1', kind: 'window', offset: 1, width: 1, height: 1.2, sill: 0.9 },
      ],
    }
    const ps = wallPieces(w, STUB)
    for (const p of ps) {
      expect(p.s0).toBeGreaterThanOrEqual(0)
      expect(p.s1).toBeLessThanOrEqual(4 + 1e-9)
      expect(p.s1).toBeGreaterThan(p.s0)
      expect(p.y1).toBeGreaterThan(p.y0)
      expect(p.stub).toBe(p.y1 <= STUB + 1e-9)
    }
    // Sill under w1 is split at the cut: 0–0.3 stub and 0.3–0.9 upper.
    expect(ps).toContainEqual({ s0: 1, s1: 2, y0: 0, y1: STUB, stub: true })
    expect(ps).toContainEqual({ s0: 1, s1: 2, y0: STUB, y1: 0.9, stub: false })
    // w2 is clamped to the wall end, so there is no solid piece after it.
    expect(ps.some((p) => p.s0 >= 4 - 1e-9)).toBe(false)
    expect(area(ps)).toBeCloseTo(4 * 2.6 - 1 * 1.2 - 0.5 * 1.2)
  })

  it('puts every piece in the stub when the cut is above the wall', () => {
    const ps = wallPieces(wall('entry'), 10)
    expect(ps.every((p) => p.stub)).toBe(true)
    expect(area(ps)).toBeCloseTo(3.4 * 2.6 - 2.05)
  })
})

describe('outwardNormal', () => {
  const inside: [number, number] = [3.5, 1.5]
  it.each([
    ['entry', [-1, 0]],
    ['facade', [1, 0]],
    ['side-bath', [0, -1]],
    ['side-kitchen', [0, 1]],
  ] as const)('points %s away from the room', (id, expected) => {
    const n = outwardNormal(wall(id), inside)
    expect(n[0]).toBeCloseTo(expected[0])
    expect(n[1]).toBeCloseTo(expected[1])
  })
})

describe('openingById', () => {
  it('finds openings on their wall and nothing elsewhere', () => {
    expect(openingById(wall('entry'), 'front-door')?.width).toBe(1.0)
    expect(openingById(wall('facade'), 'front-door')).toBeUndefined()
    expect(openingById(wall('side-bath'), 'x')).toBeUndefined()
  })
})
