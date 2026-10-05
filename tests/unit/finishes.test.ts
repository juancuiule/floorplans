import * as THREE from 'three'
import { plan } from '../../src/project/plan'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FINISHES,
  isDefaultFinishes,
  normalizeFinishes,
  showsHexBlend,
  ZONE_FLOORS,
  type Finishes,
} from '../../src/model/finishes'
import { materials } from '../../src/project'
import { FLOORS, finishDef } from '../../src/project/finishes'
import { makeMaterial, setFinishes } from '../../src/scene/materials'
import { patternFor, patternSize, pow2 } from '../../src/scene/patterns'

const withFloors = (floors: Partial<Finishes['floors']>, rest: Partial<Finishes> = {}): Finishes => ({
  ...DEFAULT_FINISHES,
  ...rest,
  floors: { ...DEFAULT_FINISHES.floors, ...floors },
})

describe('normalizeFinishes', () => {
  it('defaults to the original look for missing or broken input', () => {
    for (const raw of [undefined, null, 42, 'x', {}, { floors: 'oak' }])
      expect(normalizeFinishes(raw, plan)).toEqual(DEFAULT_FINISHES)
    expect(isDefaultFinishes(normalizeFinishes(undefined, plan))).toBe(true)
  })

  it('keeps valid values and replaces invalid ones field by field', () => {
    const f = normalizeFinishes(
      {
        floors: { main: 'walnut', hall: 'nope', bath: 'cementQuarter', balcony: 'oakLight' },
        hexBlend: 'yes',
        wallPaint: '#ABCDEF',
        accentWall: 'facade',
        accentColor: 'red',
        bathTile: { layout: 'subway', color: '#123' },
      },
      plan,
    )
    expect(f.floors).toEqual({ main: 'walnut', hall: 'oakLight', bath: 'cementQuarter', balcony: 'balconyGrey' })
    expect(f.hexBlend).toBe(false)
    expect(f.wallPaint).toBe('#abcdef')
    expect(f.accentWall).toBe('none')
    expect(f.accentColor).toBe(DEFAULT_FINISHES.accentColor)
    expect(f.bathTile).toEqual({ layout: 'subway', color: DEFAULT_FINISHES.bathTile.color })
  })

  it('round-trips through JSON', () => {
    const f = withFloors({ main: 'herringbone', hall: 'hexGrey' }, { hexBlend: true, accentWall: 'entry-main' })
    expect(normalizeFinishes(JSON.parse(JSON.stringify(f)), plan)).toEqual(f)
  })

  it('every zone default is the first allowed floor', () => {
    for (const [zone, ids] of Object.entries(ZONE_FLOORS))
      expect(DEFAULT_FINISHES.floors[zone as keyof Finishes['floors']]).toBe(ids[0])
  })

  it('shows the hex blend only for hexagons into a non-hex main room', () => {
    expect(showsHexBlend(withFloors({ hall: 'hexGrey' }, { hexBlend: true }))).toBe(true)
    expect(showsHexBlend(withFloors({ hall: 'hexGrey' }))).toBe(false)
    expect(showsHexBlend(withFloors({ hall: 'oakLight' }, { hexBlend: true }))).toBe(false)
    expect(showsHexBlend(withFloors({ hall: 'hexGrey', main: 'hexCharcoal' }, { hexBlend: true }))).toBe(false)
  })
})

describe('finishDef', () => {
  it('reproduces the original materials by default', () => {
    expect(finishDef('floorMain', DEFAULT_FINISHES, materials)).toBe(FLOORS.oakLight.def)
    expect(FLOORS.oakLight.def.color).toBe(materials.oakFloor.color)
    expect(finishDef('bathFloor', DEFAULT_FINISHES, materials)).toEqual(materials.bathFloor)
    expect(finishDef('balconyFloor', DEFAULT_FINISHES, materials)).toEqual(materials.balconyFloor)
    expect(finishDef('plaster', DEFAULT_FINISHES, materials)).toEqual(materials.plaster)
    expect(finishDef('tile', DEFAULT_FINISHES, materials)).toEqual(materials.tile)
    expect(finishDef('oakDoor', DEFAULT_FINISHES, materials)).toBeNull()
  })

  it('colors only the chosen accent wall and hides the others', () => {
    const f = { ...DEFAULT_FINISHES, accentWall: 'side-bath' as const, accentColor: '#9fae95' }
    expect(finishDef('accent:side-bath', f, materials)).toMatchObject({ color: '#9fae95', hidden: false })
    expect(finishDef('accent:side-kitchen', f, materials)).toMatchObject({ hidden: true })
  })
})

describe('patterns', () => {
  it('every floor texture is power-of-two sized, at most 2048 px, mipmapped and anisotropic', () => {
    for (const { def } of Object.values(FLOORS)) {
      const p = patternFor(def)!
      const canvas = p.texture.image as HTMLCanvasElement
      for (const side of [canvas.width, canvas.height]) {
        expect(Math.log2(side) % 1).toBe(0)
        expect(side).toBeLessThanOrEqual(2048)
      }
      expect(p.texture.generateMipmaps).toBe(true)
      expect(p.texture.anisotropy).toBeGreaterThan(1)
      expect(p.texture.wrapS).toBe(THREE.RepeatWrapping)
      expect(p.size).toEqual(patternSize(def.pattern!))
    }
    expect(pow2(1700)).toBe(2048)
    expect(pow2(5000)).toBe(2048)
  })
})

describe('setFinishes', () => {
  it('updates finish materials in place and leaves others alone', () => {
    const floor = makeMaterial('floorMain', [4.95, 3], [2.15, 0])
    const wall = makeMaterial('plaster')
    const accent = makeMaterial('accent:side-kitchen')
    const door = makeMaterial('oakDoor')
    const firstMap = floor.map
    expect(accent.visible).toBe(false)

    expect(
      setFinishes(
        withFloors({ main: 'walnut' }, { wallPaint: '#dfe3d6', accentWall: 'side-kitchen', accentColor: '#c98a6b' }),
      ),
    ).toBe(true)
    expect(floor.map).not.toBe(firstMap)
    expect(floor.map!.repeat.x).toBeCloseTo(4.95 / patternSize(FLOORS.walnut.def.pattern!)[0])
    expect(floor.map!.offset.x).toBeCloseTo(2.15 / patternSize(FLOORS.walnut.def.pattern!)[0])
    expect(`#${wall.color.getHexString()}`).toBe('#dfe3d6')
    expect(accent.visible).toBe(true)
    expect(`#${accent.color.getHexString()}`).toBe('#c98a6b')
    expect(`#${door.color.getHexString()}`).toBe(materials.oakDoor.color)

    // Same finishes again: nothing to do.
    const map = floor.map
    expect(
      setFinishes(
        withFloors({ main: 'walnut' }, { wallPaint: '#dfe3d6', accentWall: 'side-kitchen', accentColor: '#c98a6b' }),
      ),
    ).toBe(false)
    expect(floor.map).toBe(map)
    setFinishes(DEFAULT_FINISHES)
    expect(accent.visible).toBe(false)
  })
})

describe('shower finishes', () => {
  it('defaults to a glass door with brushed chrome fittings', () => {
    expect(DEFAULT_FINISHES.shower).toEqual({ screen: 'glass', curtainColor: '#f2f0ea', fittings: 'chrome' })
    expect(normalizeFinishes({}, plan).shower).toEqual(DEFAULT_FINISHES.shower)
  })

  it('keeps valid choices and falls back on unknown ones', () => {
    expect(
      normalizeFinishes({ shower: { screen: 'curtain', curtainColor: '#C07A5C', fittings: 'brass' } }, plan).shower,
    ).toEqual({
      screen: 'curtain',
      curtainColor: '#c07a5c',
      fittings: 'brass',
    })
    expect(
      normalizeFinishes({ shower: { screen: 'bathtub', curtainColor: 'red', fittings: 'gold' } }, plan).shower,
    ).toEqual(DEFAULT_FINISHES.shower)
  })
})
