import { describe, expect, it } from 'vitest'
import { area, contains, isRectilinear, overlaps, rectangles, rectPoints, simplify } from '../../src/model/polygon'
import type { Vec2 } from '../../src/model/types'

// An L: 6 wide along the bottom, 3 wide up the left side.
const L: Vec2[] = [
  [0, 0],
  [3, 0],
  [3, 2],
  [6, 2],
  [6, 5],
  [0, 5],
]

describe('polygons', () => {
  it('measures area either way round', () => {
    expect(area(L)).toBe(24)
    expect(area([...L].reverse())).toBe(24)
  })

  it('tells inside from outside', () => {
    expect(contains(L, [1, 1])).toBe(true)
    expect(contains(L, [5, 1])).toBe(false)
    expect(contains(L, [5, 4])).toBe(true)
  })

  it('cuts an L into two rectangles that tile it, largest first', () => {
    const rs = rectangles(L)
    expect(rs).toEqual([
      [0, 0, 3, 5],
      [3, 2, 6, 5],
    ])
    expect(rs.reduce((s, r) => s + (r[2] - r[0]) * (r[3] - r[1]), 0)).toBe(area(L))
  })

  it('keeps a rectangle one rectangle, and cuts a U into three', () => {
    expect(rectangles(rectPoints([1, 1, 4, 3]))).toEqual([[1, 1, 4, 3]])
    const U: Vec2[] = [
      [0, 0],
      [1, 0],
      [1, 2],
      [2, 2],
      [2, 0],
      [3, 0],
      [3, 3],
      [0, 3],
    ]
    const rs = rectangles(U)
    expect(rs).toHaveLength(3)
    expect(rs.reduce((s, r) => s + (r[2] - r[0]) * (r[3] - r[1]), 0)).toBe(area(U))
  })

  it('knows right-angled polygons', () => {
    expect(isRectilinear(L)).toBe(true)
    expect(
      isRectilinear([
        [0, 0],
        [2, 0],
        [1, 2],
      ]),
    ).toBe(false)
  })

  it('drops repeated points and corners that are not corners', () => {
    expect(
      simplify([
        [0, 0],
        [2, 0],
        [2, 0],
        [4, 0],
        [4, 2],
        [0, 2],
      ]),
    ).toEqual([
      [0, 0],
      [4, 0],
      [4, 2],
      [0, 2],
    ])
  })

  it('finds overlaps, but not shared edges', () => {
    expect(overlaps(L, rectPoints([3, 0, 6, 2]))).toBe(false)
    expect(overlaps(L, rectPoints([2, 0, 6, 1]))).toBe(true)
  })
})
