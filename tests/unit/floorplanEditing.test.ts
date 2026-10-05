import { describe, expect, it } from 'vitest'
import { isRectilinear, rectPoints } from '../../src/model/polygon'
import type { ReferenceImage, SketchRoom } from '../../src/model/sketch'
import type { Vec2 } from '../../src/model/types'
import {
  calibrated,
  closeGaps,
  closeOutline,
  edgeLines,
  moveCorner,
  moveEdge,
  moveShared,
  openingSpot,
  overlapping,
  rectFrom,
  referenceRect,
  resized,
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

describe('closeGaps', () => {
  const pointsOf = (id: string, rooms: SketchRoom[]) => rooms.find((r) => r.id === id)!.points

  it('meets a neighbor traced across a wall halfway, on the wall’s centerline', () => {
    // Traced along the inside of a 10 cm wall: 2.0 and 2.1.
    const rooms = closeGaps([room('a', [0, 0, 2, 3]), room('b', [2.1, 0, 5, 3])], 'b')
    expect(pointsOf('a', rooms)).toEqual(rectPoints([0, 0, 2.05, 3]))
    expect(pointsOf('b', rooms)).toEqual(rectPoints([2.05, 0, 5, 3]))
  })

  it('leaves a gap wider than a wall, and rooms that already touch', () => {
    const apart = [room('a', [0, 0, 2, 3]), room('b', [2.5, 0, 5, 3])]
    expect(closeGaps(apart, 'b')).toEqual(apart)
    const touching = [room('a', [0, 0, 2, 3]), room('b', [2, 0, 5, 3])]
    expect(closeGaps(touching, 'b')).toEqual(touching)
  })

  it('closes every side an L shares with its neighbor: a kitchen around a bathroom’s niche', () => {
    const l = (id: string, points: Vec2[]): SketchRoom => ({ id, name: '', kind: 'bath', points })
    const rooms = closeGaps(
      [
        l('bath', [
          [0, 0],
          [2.1, 0],
          [2.1, 0.7],
          [1.25, 0.7],
          [1.25, 1.3],
          [0, 1.3],
        ]),
        l('kitchen', [
          [0, 1.4],
          [1.35, 1.4],
          [1.35, 0.8],
          [2.1, 0.8],
          [2.1, 3],
          [0, 3],
        ]),
      ],
      'kitchen',
    )
    // Three walls, each on the middle line of its gap: z 1.35, x 1.3, z 0.75.
    expect(pointsOf('kitchen', rooms)).toEqual([
      [0, 1.35],
      [1.3, 1.35],
      [1.3, 0.75],
      [2.1, 0.75],
      [2.1, 3],
      [0, 3],
    ])
    expect(pointsOf('bath', rooms)).toEqual([
      [0, 0],
      [2.1, 0],
      [2.1, 0.75],
      [1.3, 0.75],
      [1.3, 1.35],
      [0, 1.35],
    ])
    expect(overlapping(rooms)).toEqual([])
  })
})

describe('resized', () => {
  it('moves the far sides of a rectangle to the size typed in', () => {
    expect(resized(rectPoints([1, 2, 3, 4]), 4.7, 3)).toEqual(rectPoints([1, 2, 5.7, 5]))
  })
})

describe('moveShared', () => {
  const pts = (rooms: SketchRoom[], id: string) => rooms.find((r) => r.id === id)!.points
  // A living room with a bathroom and a kitchen side by side against its right wall.
  const rooms = [room('living', [0, 0, 4, 3]), room('bath', [4, 0, 6, 1.5]), room('kitchen', [4, 1.5, 6, 3])]
  const door = { id: 'd', kind: 'door' as const, at: [4, 0.75] as Vec2, width: 0.8 }

  it('moves the rooms on the other side of a wall with it, and the doors in it', () => {
    // The living room's right edge (index 1) pushed from x 4 to 4.5.
    const out = moveShared(rooms, [door], 'living', moveEdge(pts(rooms, 'living'), 1, 4.5))
    expect(pts(out.rooms, 'bath')).toEqual(rectPoints([4.5, 0, 6, 1.5]))
    expect(pts(out.rooms, 'kitchen')).toEqual(rectPoints([4.5, 1.5, 6, 3]))
    expect(out.openings[0].at).toEqual([4.5, 0.75])
  })

  it('leaves rooms that only meet the edge end to end, or at a corner', () => {
    // The bathroom's top edge is on the same line as the living room's, but they only meet at x = 4.
    const out = moveShared(rooms, [], 'bath', moveEdge(pts(rooms, 'bath'), 0, -0.5))
    expect(pts(out.rooms, 'living')).toEqual(pts(rooms, 'living'))
    // Its bottom edge, shared with the kitchen, did not move.
    expect(pts(out.rooms, 'kitchen')).toEqual(pts(rooms, 'kitchen'))
  })

  it('carries the walls a corner moves, and keeps a neighbor that would fold up', () => {
    // The bathroom's bottom-left corner (index 3) to (4.5, 2): its wall with the kitchen moves down, and its
    // left wall right, taking the living room's whole right wall, which the kitchen shares too.
    const out = moveShared(rooms, [], 'bath', moveCorner(pts(rooms, 'bath'), 3, [4.5, 2]))
    expect(pts(out.rooms, 'living')).toEqual(rectPoints([0, 0, 4.5, 3]))
    expect(pts(out.rooms, 'kitchen')).toEqual(rectPoints([4.5, 2, 6, 3]))
    // Pushing the shared wall right through the kitchen would fold it: it stays.
    const far = moveShared(rooms, [], 'bath', moveEdge(pts(rooms, 'bath'), 2, 3))
    expect(pts(far.rooms, 'kitchen')).toEqual(pts(rooms, 'kitchen'))
  })
})
