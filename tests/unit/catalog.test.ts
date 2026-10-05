// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  COLLECTION_SPECIES,
  DEFAULT_POT_SIZE,
  FRAME_COLORS,
  FRAME_STYLES,
  LAMPS,
  MAT_WIDTHS,
  PLANTS,
  POT_SIZES,
  POTS,
  SIZE_PRESETS,
  WARMTH,
  warmthColor,
} from '../../src/decor/catalog'
import {
  BODY_FINISHES,
  FABRIC_FINISHES,
  FURNITURE,
  FURNITURE_GROUPS,
  METAL_FINISHES,
} from '../../src/decor/furnitureCatalog'
import type { FurnitureType } from '../../src/model/decor'

const HEX = /^#[0-9a-f]{6}$/i
const TYPES = Object.keys(FURNITURE) as FurnitureType[]

/** The FurnitureType union, read from the model so a new type without a spec is caught. */
function furnitureTypesFromModel(): string[] {
  const src = readFileSync(new URL('../../src/model/decor.ts', import.meta.url), 'utf8')
  const block = src.match(/export type FurnitureType =([\s\S]*?)\n\n/)![1]
  return [...block.matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1])
}

/** Keys of the VIEWS map in Furniture.tsx (not exported, so read from source). */
function rendererKeys(): string[] {
  const src = readFileSync(new URL('../../src/scene/decor/furniture/Furniture.tsx', import.meta.url), 'utf8')
  const block = src.match(/const VIEWS\b[\s\S]*?=\s*{\n([\s\S]*?)\n}/)![1]
  return [...block.matchAll(/^\s*([a-zA-Z]+)\s*:/gm)].map((m) => m[1])
}

describe('furniture catalog', () => {
  it('has a spec for every FurnitureType', () => {
    expect([...TYPES].sort()).toEqual(furnitureTypesFromModel().sort())
  })

  it('has a renderer for every FurnitureType in Furniture.tsx', () => {
    expect(rendererKeys().sort()).toEqual([...TYPES].sort())
  })

  it.each(TYPES)('%s has a sane spec', (t) => {
    const s = FURNITURE[t]
    expect(s.label.length).toBeGreaterThan(0)
    expect(FURNITURE_GROUPS).toContain(s.group)
    expect(['surface', 'wall', 'ceiling']).toContain(s.mount)
    for (const v of s.size) expect(v).toBeGreaterThan(0)
    expect(s.size[0]).toBeLessThan(4)
    expect(s.size[1]).toBeLessThanOrEqual(2.6)
    for (const p of s.presets ?? []) for (const v of p.size) expect(v, p.label).toBeGreaterThan(0)
    // Note: the default size is not always a preset (the sofa defaults to 190 cm, between its 2- and 3-seat presets).
    for (const c of Object.values(s.finish)) expect(c).toMatch(HEX)
    expect(s.uses.length).toBeGreaterThan(0)
    for (const f of s.editable) expect(['w', 'h', 'd']).toContain(f)
  })

  it.each(TYPES)('%s option specs match its default options', (t) => {
    const s = FURNITURE[t]
    const keys = s.optionSpecs.map((o) => o.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const o of s.optionSpecs) {
      const v = s.options[o.key]
      expect(v, `${t}.${o.key} default`).toBeDefined()
      if (o.kind === 'toggle') expect(typeof v).toBe('boolean')
      if (o.kind === 'chips') expect(o.choices.map((c) => c.id)).toContain(v)
      if (o.kind === 'range') {
        expect(typeof v).toBe('number')
        expect(v as number).toBeGreaterThanOrEqual(o.min)
        expect(v as number).toBeLessThanOrEqual(o.max)
        expect(o.step).toBeGreaterThan(0)
      }
    }
  })

  it('offers only hex finishes', () => {
    for (const f of [...BODY_FINISHES, ...METAL_FINISHES, ...FABRIC_FINISHES]) expect(f.color).toMatch(HEX)
  })

  it('every furniture type and lamp has a line icon', async () => {
    const { FURNITURE_ICON, LAMP_ICON } = await import('../../src/ui/itemIcons')
    for (const t of TYPES) expect(FURNITURE_ICON[t], t).toBeTruthy()
    for (const t of Object.keys(LAMPS)) expect(LAMP_ICON[t as keyof typeof LAMP_ICON], t).toBeTruthy()
  })

  it('wall-backed floor pieces snap to walls; free-standing ones do not', async () => {
    const { placeAt } = await import('../../src/decor/placement')
    const THREE = await import('three')
    const hit = { point: new THREE.Vector3(4.5, 0, 0.3), normal: new THREE.Vector3(0, 1, 0), kind: 'up' as const }
    const piece = (type: FurnitureType) => ({
      kind: 'furniture' as const,
      id: 'x',
      type,
      at: [0, 0, 0] as [number, number, number],
      rotation: 0,
      size: [...FURNITURE[type].size] as [number, number, number],
      finish: FURNITURE[type].finish,
      options: {},
    })
    for (const t of ['loftBed', 'windowBench', 'balconyBench', 'planterWall'] as FurnitureType[]) {
      const patch = placeAt(piece(t), hit) as { at: number[] }
      // Snapped flush against the bathroom-side wall (z = 0): the back sits on it.
      expect(patch.at[2], t).toBeCloseTo(FURNITURE[t].size[2] / 2, 1)
    }
    const free = placeAt(piece('officeChair'), hit) as { at: number[] }
    expect(free.at[2]).toBeCloseTo(0.3)
  })

  it('sizes that follow options: tube chair type, mug count', () => {
    const bistro = FURNITURE.bistroChair.sizeFor!
    expect(bistro({ variant: 'stool' }, FURNITURE.bistroChair.size)[1]).toBeCloseTo(0.46)
    expect(bistro({ variant: 'bar' }, FURNITURE.bistroChair.size)[1]).toBeCloseTo(0.66)
    expect(bistro({ variant: 'chair' }, FURNITURE.bistroChair.size)).toEqual(FURNITURE.bistroChair.size)
    const mugs = FURNITURE.mugs.sizeFor!
    expect(mugs({ count: 2 }, FURNITURE.mugs.size)[0]).toBeCloseTo(0.22)
    expect(mugs({ count: 4 }, FURNITURE.mugs.size)).toEqual(FURNITURE.mugs.size)
    expect(FURNITURE.railTable.mountHeight! + FURNITURE.railTable.size[1]).toBeCloseTo(0.75)
  })

  it('groups the panel shows are all in use', () => {
    for (const g of FURNITURE_GROUPS)
      expect(
        TYPES.some((t) => FURNITURE[t].group === g),
        g,
      ).toBe(true)
  })
})

describe('decor catalog', () => {
  it('print presets are portrait and ascending', () => {
    for (const p of SIZE_PRESETS) expect(p.size[0]).toBeLessThan(p.size[1])
    const areas = SIZE_PRESETS.map((p) => p.size[0] * p.size[1])
    expect([...areas].sort((a, b) => a - b)).toEqual(areas)
    expect(SIZE_PRESETS.find((p) => p.id === 'A4')!.size).toEqual([0.21, 0.297])
  })

  it('frame styles have unique ids and non-negative dimensions', () => {
    expect(new Set(FRAME_STYLES.map((f) => f.id)).size).toBe(FRAME_STYLES.length)
    for (const f of FRAME_STYLES) {
      expect(f.width).toBeGreaterThanOrEqual(0)
      expect(f.depth).toBeGreaterThan(0)
      expect(MAT_WIDTHS).toContain(f.mat)
    }
    for (const c of FRAME_COLORS) expect(c.color).toMatch(HEX)
  })

  it('every plant uses a known pot style', () => {
    const pots = POTS.map((p) => p.id)
    for (const [sp, p] of Object.entries(PLANTS)) expect(pots, sp).toContain(p.pot)
  })

  it('default pot sizes are offered sizes', () => {
    const sizes = POT_SIZES.map((p) => p.id)
    for (const v of Object.values(DEFAULT_POT_SIZE)) expect(sizes).toContain(v)
  })

  it('collection species are small surface plants in standard clay sizes', () => {
    for (const c of COLLECTION_SPECIES) {
      expect(PLANTS[c.species].mount).toBe('surface')
      for (const d of c.sizes) expect([0.06, 0.08, 0.12]).toContain(d)
    }
  })

  it('lamps have positive power and hex colors; wall lights mount on walls', () => {
    for (const [t, l] of Object.entries(LAMPS)) {
      expect(l.power, t).toBeGreaterThan(0)
      expect(l.color).toMatch(HEX)
    }
    expect(LAMPS.sconce.mount).toBe('wall')
    expect(LAMPS.string.mount).toBe('wall')
    expect(LAMPS.pendant.mount).toBe('ceiling')
    expect(LAMPS.exitCeiling.mount).toBe('ceiling')
  })

  it('warmthColor maps each warmth and falls back for unknown values', () => {
    for (const w of WARMTH) expect(warmthColor(w.id)).toBe(w.color)
    expect(warmthColor(5000 as never)).toMatch(HEX)
  })
})
