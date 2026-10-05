// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { FURNITURE } from '../../src/decor/furnitureCatalog'
import { autoDrop, HEAD_CLEARANCE, OVER_TABLE, pendantBottom, pendantDrop } from '../../src/decor/pendant'
import type { FurnitureItem, LampItem, LampType } from '../../src/model/decor'
import { EYE, lowPendants, walkObstacles } from '../../src/plan/walk'

const lamp = (type: LampType, at: [number, number, number] = [5.59, 2.6, 1.71], drop?: number): LampItem => ({
  kind: 'lamp',
  id: `l-${type}`,
  type,
  at,
  rotation: 0,
  on: true,
  brightness: 1,
  warmth: 2700,
  color: '#fff',
  ...(drop !== undefined ? { drop } : {}),
})
const table = (at: [number, number, number], rotation = 0): FurnitureItem => ({
  kind: 'furniture',
  id: 'table',
  type: 'diningTable',
  at,
  rotation,
  size: [1.2, 0.75, 0.75],
  finish: { ...FURNITURE.diningTable.finish },
  options: { ...FURNITURE.diningTable.options },
})

describe('pendant height', () => {
  it.each(['pendant', 'globe', 'lantern'] as const)(
    'a %s under the 2.60 ceiling keeps its bottom clear of heads by default',
    (t) => {
      const l = lamp(t)
      expect(pendantBottom(l, [l])).toBeGreaterThanOrEqual(HEAD_CLEARANCE - 0.005)
      expect(pendantBottom(l, [l])).toBeGreaterThan(EYE + 0.3)
    },
  )

  it('the owner’s paper lantern used to hang to 1.48 m; now its cord is short', () => {
    const l = lamp('lantern')
    expect(autoDrop(l, [l])).toBe(0.05)
    expect(pendantBottom(l, [l])).toBeCloseTo(1.95, 2)
  })

  it('hangs low over a dining table (also a turned one)', () => {
    for (const rotation of [0, 90]) {
      const t = table([3, 0, 1.5], rotation)
      const l = lamp('pendant', [3.2, 2.6, 1.5])
      expect(pendantBottom(l, [l, t])).toBeCloseTo(0.75 + OVER_TABLE, 2)
    }
    // Past the end of a table turned a quarter (its 1.2 m run along z), it goes back up.
    const l = lamp('pendant', [3.5, 2.6, 1.5])
    expect(pendantBottom(l, [l, table([3, 0, 1.5], 90)])).toBeGreaterThanOrEqual(HEAD_CLEARANCE - 0.005)
  })

  it('a cord set by hand wins, within limits', () => {
    const l = lamp('globe', undefined, 1)
    expect(pendantDrop(l, [l])).toBe(1)
    expect(pendantDrop(lamp('globe', undefined, 5), [])).toBe(1.6)
  })
})

describe('walking under pendants', () => {
  it('leaves pendants clear of heads out of the way', () => {
    const l = lamp('lantern')
    expect(lowPendants([l])).toEqual([])
  })

  it('walks around a pendant hung at head height', () => {
    const l = lamp('lantern', undefined, 0.8)
    const obs = lowPendants([l])
    expect(obs).toHaveLength(1)
    expect(obs[0]).toMatchObject({ cx: 5.59, cz: 1.71, hw: 0.3 })
    expect(walkObstacles([l]).some((o) => o.id === l.id)).toBe(true)
  })
})
