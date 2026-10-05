// @vitest-environment node
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  FURNITURE,
  FURNITURE_GROUPS,
  FURNITURE_KEYWORDS,
  TV_BEZEL,
  TV_INCHES,
  tvPanel,
} from '../../src/decor/furnitureCatalog'
import { placeAt } from '../../src/decor/placement'
import type { FurnitureItem, FurnitureType } from '../../src/model/decor'
import { FURNITURE_ICON } from '../../src/ui/itemIcons'

const DEVICES: FurnitureType[] = [
  'speakers',
  'standMixer',
  'espressoMachine',
  'turntable',
  'acIndoor',
  'acOutdoor',
  'tv',
  'tvWall',
]

const item = (type: FurnitureType, options = {}): FurnitureItem => {
  const s = FURNITURE[type]
  return {
    kind: 'furniture',
    id: `t-${type}`,
    type,
    at: [0, 0, 0],
    rotation: 0,
    size: [...s.size],
    finish: { ...s.finish },
    options: { ...s.options, ...options },
  }
}

describe('appliances & electronics', () => {
  it('has its own panel group holding every device', () => {
    expect(FURNITURE_GROUPS).toContain('Appliances & electronics')
    for (const t of DEVICES) {
      expect(FURNITURE[t].group, t).toBe('Appliances & electronics')
      expect(FURNITURE[t].note.length, t).toBeGreaterThan(0)
      expect(FURNITURE_KEYWORDS[t], t).toBeTruthy()
      expect(FURNITURE_ICON[t], t).toBe(t)
    }
  })

  it('uses the real products’ dimensions', () => {
    const near = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 2))
    near(FURNITURE.standMixer.size, [0.24, 0.36, 0.36])
    near(FURNITURE.espressoMachine.size, [0.22, 0.3, 0.28])
    near(FURNITURE.turntable.size, [0.45, 0.157, 0.352])
    near(FURNITURE.acIndoor.size, [0.8, 0.28, 0.21])
    near(FURNITURE.acOutdoor.size, [0.78, 0.55, 0.29])
    // Two 15.5 cm speakers with the default 60 cm gap between them.
    near(FURNITURE.speakers.size, [0.91, 0.24, 0.2])
  })

  it('mounts the indoor AC unit and the wall TV on a wall and everything else on a surface', () => {
    const onWall: FurnitureType[] = ['acIndoor', 'tvWall']
    for (const t of onWall) expect(FURNITURE[t].mount, t).toBe('wall')
    for (const t of DEVICES.filter((t) => !onWall.includes(t))) expect(FURNITURE[t].mount, t).toBe('surface')
  })

  it('sizes TVs by their 16:9 diagonal, bezel included', () => {
    // A 55″ picture is 121.8 × 68.5 cm; 8 mm of bezel on each side.
    expect(tvPanel(55)[0]).toBeCloseTo(1.234, 3)
    expect(tvPanel(55)[1]).toBeCloseTo(0.701, 3)
    for (const n of TV_INCHES) {
      const [w, h] = tvPanel(n)
      expect(Math.hypot(w - 2 * TV_BEZEL, h - 2 * TV_BEZEL) / 0.0254, `${n}″`).toBeCloseTo(n, 0)
    }
    const stand = FURNITURE.tv
    expect(stand.sizeFor!({ ...stand.options, inches: 32 }, stand.size)).toEqual([
      tvPanel(32)[0],
      Number((tvPanel(32)[1] + 0.07).toFixed(3)),
      0.25,
    ])
    expect(stand.sizeFor!({ ...stand.options, inches: 75, stand: 'pedestal' }, stand.size)[1]).toBeCloseTo(
      tvPanel(75)[1] + 0.1,
      3,
    )
    const wall = FURNITURE.tvWall
    expect(wall.sizeFor!({ ...wall.options, inches: 65 }, wall.size)).toEqual([...tvPanel(65), 0.06])
  })

  it('a wall TV settles with a 55″ screen centered near seated eye height', () => {
    const tv = item('tvWall')
    const at = placeAt(tv, { point: new THREE.Vector3(4, 1.0, 0.1), normal: new THREE.Vector3(0, 0, 1), kind: 'wall' })!
      .at as number[]
    expect(at[1]).toBe(0.75)
    expect(at[1] + tv.size[1] / 2).toBeCloseTo(1.1, 1)
  })

  it('default sizes agree with the default options', () => {
    for (const t of Object.keys(FURNITURE) as FurnitureType[]) {
      const s = FURNITURE[t]
      if (s.sizeFor) expect(s.sizeFor(s.options, s.size), t).toEqual(s.size)
    }
  })

  it('speaker spacing and the condenser bracket resize the footprint', () => {
    const sp = FURNITURE.speakers
    expect(sp.sizeFor!({ ...sp.options, spacing: 100 }, sp.size)[0]).toBeCloseTo(1.31, 3)
    const ac = FURNITURE.acOutdoor
    expect(ac.sizeFor!({ ...ac.options, bracket: true, lift: 120 }, ac.size)[1]).toBeCloseTo(1.75, 3)
    expect(ac.sizeFor!({ ...ac.options, bracket: false, lift: 120 }, ac.size)[1]).toBeCloseTo(0.55, 3)
  })

  it('the indoor AC unit settles at its usual height when placed near it', () => {
    const hit = (y: number) => ({
      point: new THREE.Vector3(3, y, 0.1),
      normal: new THREE.Vector3(0, 0, 1),
      kind: 'wall' as const,
    })
    const ac = item('acIndoor')
    // Pointer at the unit's center: bottom edge 14 cm below it.
    expect((placeAt(ac, hit(2.1))!.at as number[])[1]).toBe(2.1)
    expect((placeAt(ac, hit(2.5))!.at as number[])[1]).toBe(2.1)
    expect((placeAt(ac, hit(1.2))!.at as number[])[1]).toBeCloseTo(1.06, 2)
    // Other wall pieces keep following the pointer.
    expect((placeAt(item('floatingShelf'), hit(2.1))!.at as number[])[1]).toBeCloseTo(2.08, 2)
  })
})
