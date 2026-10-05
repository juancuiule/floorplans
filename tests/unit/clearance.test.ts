// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { FURNITURE } from '../../src/decor/furnitureCatalog'
import type { FurnitureItem, FurnitureType } from '../../src/model/decor'
import { clearancesOf, levelOf } from '../../src/plan/clearance'
import { axisLock, edgeLines, formatCm, snapPoint } from '../../src/plan/measure'

const piece = (
  id: string,
  type: FurnitureType,
  at: [number, number, number],
  rotation = 0,
  size = FURNITURE[type].size,
): FurnitureItem => ({
  kind: 'furniture',
  id,
  type,
  at,
  rotation,
  size: [...size],
  finish: { ...FURNITURE[type].finish },
  options: { ...FURNITURE[type].options },
})

const bySide = (list: ReturnType<typeof clearancesOf>) => Object.fromEntries(list.map((c) => [c.side, c]))

describe('clearances', () => {
  it('grades distances like a plan check', () => {
    expect(levelOf(0.8)).toBe('ok')
    expect(levelOf(0.59)).toBe('tight')
    expect(levelOf(0.44)).toBe('blocked')
  })

  it('measures to the walls on all four sides of a free piece', () => {
    // A 1.0 × 0.6 table in the main room (walls at x 2.2 and 6.9, z 0 and 3.0; beam and column are above the floor or in the corner).
    const t = piece('t', 'sideboard', [4, 0, 1.5], 0, [1, 0.8, 0.6])
    const c = bySide(clearancesOf(t, [t]))
    expect(c.left.dist).toBeCloseTo(4 - 0.5 - 2.2, 3)
    expect(c.right.dist).toBeCloseTo(6.9 - 4.5, 3)
    expect(c.back.dist).toBeCloseTo(1.2, 3)
    expect(c.front.dist).toBeCloseTo(1.2, 3)
    expect(c.left.hit).toMatch(/^entry-main/)
  })

  it('uses the piece’s own sides when it is turned', () => {
    const t = piece('t', 'sideboard', [4, 0, 1.5], 90, [1, 0.8, 0.6])
    const c = bySide(clearancesOf(t, [t]))
    // Turned a quarter: its front looks down +x.
    expect(c.front.dist).toBeCloseTo(6.9 - 4.3, 3)
    expect(c.left.dist).toBeCloseTo(1.5 - 0.5, 3)
  })

  it('finds the nearest furniture and flags a tight gap', () => {
    const a = piece('a', 'sideboard', [4, 0, 1.5], 0, [1, 0.8, 0.6])
    const b = piece('b', 'wardrobe', [5.05, 0, 1.5], 0, [0.6, 2, 0.6])
    const c = bySide(clearancesOf(a, [a, b]))
    expect(c.right.hit).toBe('b')
    expect(c.right.dist).toBeCloseTo(0.25, 3)
    expect(c.right.level).toBe('blocked')
  })

  it('leaves out a side that is flush against a wall', () => {
    const t = piece('t', 'bookshelf', [4, 0, 0.2], 0, [0.8, 1.5, 0.4])
    const sides = clearancesOf(t, [t]).map((c) => c.side)
    expect(sides).not.toContain('back')
    expect(sides).toContain('front')
  })

  it('reports nothing for rugs or wall pieces', () => {
    expect(clearancesOf(piece('r', 'rug', [4, 0, 1.5]), [])).toEqual([])
  })

  it('treats the balcony glass as a wall', () => {
    const t = piece('t', 'sideboard', [6, 0, 1.5], 0, [1, 0.8, 0.6])
    expect(bySide(clearancesOf(t, [t])).right.dist).toBeCloseTo(0.4, 3)
  })
})

describe('measure snapping', () => {
  const { lines, tops } = edgeLines([])
  it('snaps near a wall face and a jamb, and to the floor', () => {
    const s = snapPoint([2.23, 0.03, 1.43], lines, { tops })
    // Main-room face of the partition (x 2.2) and the passage jamb (z 1.4).
    expect(s.point).toEqual([2.2, 0, 1.4])
    expect(s.snapped).toBe(true)
  })
  it('leaves a point in the open alone', () => {
    const s = snapPoint([4, 1, 1.5], lines, { tops })
    expect(s).toEqual({ point: [4, 1, 1.5], snapped: false })
  })
  it('prefers an earlier endpoint', () => {
    expect(snapPoint([4.02, 1, 1.5], lines, { points: [[4, 1, 1.5]] }).point).toEqual([4, 1, 1.5])
  })
  it('locks to the dominant axis', () => {
    expect(axisLock([1, 0, 1], [3, 0.2, 1.4])).toEqual([3, 0, 1])
    expect(axisLock([1, 0, 1], [1.1, 2, 1.4])).toEqual([1, 2, 1])
  })
  it('formats centimeters', () => {
    expect(formatCm(2.346)).toBe('235 cm')
  })
})
