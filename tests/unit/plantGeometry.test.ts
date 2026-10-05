// @vitest-environment node
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { PLANTS, POTS } from '../../src/decor/catalog'
import type { PlantSpecies, PotStyle } from '../../src/model/decor'
import { buildPlant, POT_SIZES, seeded, type PlantModel } from '../../src/scene/decor/plantGeometry'

const SPECIES = Object.keys(PLANTS) as PlantSpecies[]
const TRAILING = new Set<PlantSpecies>(['pothos', 'burro', 'collection', 'windowBox'])
const POT_STYLES = POTS.map((p) => p.id) as PotStyle[]

const vertexCount = (m: PlantModel) => m.parts.reduce((n, p) => n + p.geometry.getAttribute('position').count, 0)
const positions = (m: PlantModel) =>
  m.parts.map((p) => `${p.mat}:${Array.from(p.geometry.getAttribute('position').array as Float32Array).join(',')}`)

function expectSane(m: PlantModel) {
  expect(m.parts.length).toBeGreaterThan(0)
  expect(m.height).toBeGreaterThan(0)
  expect(m.height).toBeLessThan(3)
  const mats = m.parts.map((p) => p.mat)
  // One merged geometry per material.
  expect(new Set(mats).size).toBe(mats.length)
  for (const p of m.parts) {
    const pos = p.geometry.getAttribute('position')
    expect(pos, p.mat).toBeDefined()
    expect(pos.count, p.mat).toBeGreaterThan(0)
    expect(p.geometry.getAttribute('normal'), p.mat).toBeDefined()
    const arr = pos.array as Float32Array
    for (let i = 0; i < arr.length; i++)
      if (!Number.isFinite(arr[i])) throw new Error(`${p.mat}: non-finite position at ${i}`)
  }
  const box = new THREE.Box3()
  for (const p of m.parts) {
    p.geometry.computeBoundingBox()
    box.union(p.geometry.boundingBox!)
  }
  return box
}

describe('seeded', () => {
  it('is deterministic per seed and spread over [0, 1)', () => {
    const a = seeded('abc')
    const b = seeded('abc')
    const xs = Array.from({ length: 1000 }, () => a())
    expect(Array.from({ length: 1000 }, () => b())).toEqual(xs)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...xs)).toBeLessThan(1)
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length
    expect(mean).toBeGreaterThan(0.4)
    expect(mean).toBeLessThan(0.6)
    expect(seeded('abd')()).not.toBe(seeded('abc')())
  })
})

describe('buildPlant', () => {
  it('has a pot size for every species', () => {
    for (const sp of SPECIES) expect(POT_SIZES[sp], sp).toBeDefined()
  })

  it.each(SPECIES)('builds %s in its default pot', (sp) => {
    const box = expectSane(buildPlant(sp, PLANTS[sp].pot, 'seed-1'))
    // The plant is roughly centered on its origin.
    expect(Math.abs((box.min.x + box.max.x) / 2)).toBeLessThan(sp === 'collection' ? 0.6 : 0.5)
    // Trailing species (pothos, burro, the window box and the burro in a collection) hang below.
    if (!TRAILING.has(sp)) expect(box.min.y).toBeGreaterThan(-0.05)
  })

  it.each(SPECIES)('builds %s in every pot style', (sp) => {
    for (const pot of POT_STYLES) expect(() => expectSane(buildPlant(sp, pot, 'x')), `${sp}/${pot}`).not.toThrow()
  })

  it.each(SPECIES)('%s is deterministic for a seed', (sp) => {
    const a = buildPlant(sp, PLANTS[sp].pot, 'same')
    const b = buildPlant(sp, PLANTS[sp].pot, 'same')
    expect(positions(b)).toEqual(positions(a))
    expect(b.height).toBe(a.height)
  })

  it('varies with the seed', () => {
    // Species with random leaf layouts.
    for (const sp of ['monstera', 'fern', 'olive', 'collection'] as const) {
      expect(positions(buildPlant(sp, PLANTS[sp].pot, 'one')), sp).not.toEqual(
        positions(buildPlant(sp, PLANTS[sp].pot, 'two')),
      )
    }
  })

  it('a collection fills its strip with the requested number of pots', () => {
    const few = buildPlant('collection', 'clay', 's', { count: 3, spread: 0.4 })
    const many = buildPlant('collection', 'clay', 's', { count: 12, spread: 1.2 })
    expectSane(few)
    const box = expectSane(many)
    expect(vertexCount(many)).toBeGreaterThan(vertexCount(few))
    const width = box.max.x - box.min.x
    expect(width).toBeGreaterThan(0.6)
    expect(width).toBeLessThan(1.2 + 0.3)
    // Small clay pots only.
    expect(box.max.y).toBeLessThan(0.6)
  })

  it('a collection survives edge-case counts', () => {
    for (const count of [1, 2, 30])
      expect(
        () => expectSane(buildPlant('collection', 'clay', 's', { count, spread: 0.9 })),
        String(count),
      ).not.toThrow()
  })

  it('a window box is a box planter with trailing plants', () => {
    const m = buildPlant('windowBox', 'terracotta', 'w')
    const box = expectSane(m)
    expect(m.parts.map((p) => p.mat)).toContain('pot')
    // It is a long planter, wider than deep.
    expect(box.max.x - box.min.x).toBeGreaterThan(box.max.z - box.min.z)
  })

  it('a clay pot comes with a saucer', () => {
    expect(buildPlant('succulent', 'clay', 's').parts.map((p) => p.mat)).toContain('saucer')
    expect(buildPlant('succulent', 'ceramic', 's').parts.map((p) => p.mat)).not.toContain('saucer')
  })
})
