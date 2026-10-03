import { describe, expect, it } from 'vitest'
import { isRectilinear, rectPoints } from '../../src/model/polygon'
import type { ReferenceImage, SketchRoom } from '../../src/model/sketch'
import type { Vec2 } from '../../src/model/types'
import {
  calibrated,
  closeOutline,
  edgeLines,
  moveCorner,
  moveEdge,
  openingSpot,
  overlapping,
  rectFrom,
  referenceRect,
  roomAt,
  snap,
  squareTo,
  toGrid,
} from '../../src/pages/floorplan/editing'

const room = (id: string, rect: [number, number, number, number]): SketchRoom => ({
  id,
  name: '',
  kind: 'living',
  points: rectPoints(rect),
})
const L: Vec2[] = [
  [0, 0],
  [3, 0],
  [3, 2],
  [6, 2],
  [6, 5],
  [0, 5],
]

describe('floor plan editing', () => {
  it('snaps to another room’s corner line when close, else to the 5 cm grid', () => {
    expect(snap(4.08, [4])).toBe(4)
    expect(snap(4.32, [4])).toBe(4.3)
    expect(toGrid(1.024)).toBe(1)
  })

  it('collects the corners of the other rooms only', () => {
    expect(edgeLines([room('a', [0, 0, 4, 3]), room('b', [4, 0, 6, 3])], 'b')).toEqual({
      x: [0, 4, 4, 0],
      z: [0, 0, 3, 3],
    })
  })

  it('orders a dragged rectangle and keeps it at least 60 cm a side', () => {
    expect(rectFrom([4, 3], [0, 0])).toEqual(rectPoints([0, 0, 4, 3]))
    expect(rectFrom([1, 1], [1.2, 1.1])).toEqual(rectPoints([1, 1, 1.6, 1.6]))
  })

  it('squares each new corner to the last one', () => {
    expect(squareTo([0, 0], [3, 0.4])).toEqual([3, 0])
    expect(squareTo([3, 0], [3.3, 2])).toEqual([3, 2])
  })

  it('closes an outline, adding the corner that squares the ends', () => {
    // Clicked: 0,0 → 3,0 → 3,2 → 6,2 → 6,5; the last corner (0,5) is implied.
    expect(
      closeOutline([
        [0, 0],
        [3, 0],
        [3, 2],
        [6, 2],
        [6, 5],
      ]),
    ).toEqual([
      [0, 0],
      [3, 0],
      [3, 2],
      [6, 2],
      [6, 5],
      [0, 5],
    ])
    expect(
      closeOutline([
        [0, 0],
        [3, 0],
      ]),
    ).toBeNull()
  })

  it('moves a corner and keeps the room right-angled', () => {
    const moved = moveCorner(L, 2, [4, 1])
    expect(moved).toEqual([
      [0, 0],
      [4, 0],
      [4, 1],
      [6, 1],
      [6, 5],
      [0, 5],
    ])
    expect(isRectilinear(moved)).toBe(true)
  })

  it('pushes an edge out, taking both its corners', () => {
    expect(moveEdge(L, 4, 6)).toEqual([
      [0, 0],
      [3, 0],
      [3, 2],
      [6, 2],
      [6, 6],
      [0, 6],
    ])
  })

  it('finds rooms that overlap, but not rooms that only share a wall', () => {
    expect(overlapping([room('a', [0, 0, 4, 3]), room('b', [4, 0, 6, 3])])).toEqual([])
    expect(overlapping([{ ...room('l', [0, 0, 1, 1]), points: L }, room('b', [2, 1, 4, 3])]).sort()).toEqual(['b', 'l'])
    // The notch of the L is free.
    expect(overlapping([{ ...room('l', [0, 0, 1, 1]), points: L }, room('b', [3, 0, 6, 2])])).toEqual([])
  })

  it('picks the innermost room under the pointer, and nothing in the notch of an L', () => {
    const rooms = [{ ...room('l', [0, 0, 1, 1]), points: L }, room('small', [1, 1, 2, 2])]
    expect(roomAt(rooms, [1.5, 1.5])?.id).toBe('small')
    expect(roomAt(rooms, [5, 4])?.id).toBe('l')
    expect(roomAt(rooms, [5, 1])).toBeUndefined()
  })

  it('puts an opening on the nearest wall, including the walls of an L, kept inside it', () => {
    const rooms = [{ ...room('l', [0, 0, 1, 1]), points: L }]
    expect(openingSpot(rooms, [4.5, 2.2], 0.9)).toEqual([4.5, 2])
    expect(openingSpot(rooms, [0.1, 0.1], 0.9)).toEqual([0.5, 0])
    expect(openingSpot(rooms, [1.5, 2.5], 0.9)).toBeNull()
  })

  it('calibrates a reference image from a known length, keeping the first point in place', () => {
    const ref: ReferenceImage = { url: '/x.png', width: 1000, height: 500, origin: [0, 0], scale: 0.01, opacity: 0.5 }
    // Two points 2 m apart on the image as shown are really 5 m apart.
    const out = calibrated(ref, [1, 1], [3, 1], 5)
    expect(out.scale).toBeCloseTo(0.025)
    expect(out.origin[0]).toBeCloseTo(-1.5)
    expect(out.origin[1]).toBeCloseTo(-1.5)
    expect(referenceRect(out)[2]).toBeCloseTo(23.5)
    expect(calibrated(ref, [1, 1], [1, 1], 5)).toBe(ref)
  })
})
