import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { applyFade, faceDims, makeEdgeMaterial, makeMaterial, sharedMaterial } from '../../src/scene/materials'
import { planks, tiles } from '../../src/scene/patterns'
import { materials } from '../../src/project'

describe('faceDims', () => {
  it('returns the footprint for a floor-like box (thin in y)', () => {
    expect(faceDims([4, 0.02, 3])).toEqual([4, 3])
  })
  it('returns [z, y] for a wall running along z (thin in x)', () => {
    expect(faceDims([0.2, 2.6, 3.4])).toEqual([3.4, 2.6])
  })
  it('returns [x, y] for a wall running along x (thin in z)', () => {
    expect(faceDims([7.1, 2.6, 0.2])).toEqual([7.1, 2.6])
  })
  it('handles cubes and ties deterministically', () => {
    expect(faceDims([1, 1, 1])).toEqual([1, 1])
    expect(faceDims([0.5, 0.5, 2])).toEqual([0.5, 2])
  })
})

describe('patterns', () => {
  it('planks cover plank length × 2 by plank width × rows and repeat', () => {
    const p = planks('#e2cba8', 0.19, 1.2)
    expect(p.size[0]).toBeCloseTo(2.4)
    expect(p.size[1]).toBeCloseTo(0.95)
    expect(p.texture).toBeInstanceOf(THREE.CanvasTexture)
    expect(p.texture.wrapS).toBe(THREE.RepeatWrapping)
    expect(p.texture.wrapT).toBe(THREE.RepeatWrapping)
    expect(p.texture.colorSpace).toBe(THREE.SRGBColorSpace)
    // Power-of-two canvases (clean mipmaps), drawn in meters.
    const canvas = p.texture.image as HTMLCanvasElement
    expect(canvas.width).toBe(2048)
    expect(canvas.height).toBe(1024)
  })

  it('tiles cover about 1.2 m each way in whole tiles', () => {
    const p = tiles('#f6f6f4', '#9c9a96', 0.6, 0.3)
    expect(p.size[0]).toBeCloseTo(1.2)
    expect(p.size[1]).toBeCloseTo(1.2)
  })

  it('caches by parameters', () => {
    expect(planks('#aaaaaa')).toBe(planks('#aaaaaa'))
    expect(planks('#aaaaaa')).not.toBe(planks('#bbbbbb'))
    expect(tiles('#fff', '#000', 0.3, 0.3)).toBe(tiles('#fff', '#000', 0.3, 0.3))
  })

  it('actually draws on the canvas', () => {
    const p = tiles('#123456', '#000000', 0.45, 0.45)
    const log = (globalThis as { __canvasCalls?: WeakMap<HTMLCanvasElement, string[]> }).__canvasCalls?.get(
      p.texture.image as HTMLCanvasElement,
    )
    // grout fill, then per tile (3 × 3): the tile and a two-strip bevel
    expect(log?.filter((c) => c === 'fillRect').length).toBe(1 + 3 * 3 * 3)
  })
})

describe('makeMaterial', () => {
  it('uses the plain color without dims', () => {
    const m = makeMaterial('oakFloor')
    expect(m.map).toBeNull()
    expect(`#${m.color.getHexString()}`).toBe(materials.oakFloor.color)
  })

  it('repeats a pattern at true scale with dims', () => {
    const m = makeMaterial('oakFloor', [4.8, 1.9])
    expect(m.map).not.toBeNull()
    expect(m.map!.repeat.x).toBeCloseTo(4.8 / 2.4)
    expect(m.map!.repeat.y).toBeCloseTo(1.9 / 0.95)
    // Clones: two surfaces do not share a repeat.
    const other = makeMaterial('oakFloor', [2.4, 0.95], [1.2, 0])
    expect(other.map!.offset.x).toBeCloseTo(0.5)
    expect(other.map).not.toBe(m.map)
    expect(other.map!.repeat.x).toBeCloseTo(1)
  })

  it('makes glass transparent, double-sided and non-depth-writing', () => {
    const m = makeMaterial('glass')
    expect(m.transparent).toBe(true)
    expect(m.opacity).toBeCloseTo(materials.glass.opacity!)
    expect(m.side).toBe(THREE.DoubleSide)
    expect(m.depthWrite).toBe(false)
    expect(m.userData.baseOpacity).toBeCloseTo(materials.glass.opacity!)
  })

  it('gives emissive materials a glow', () => {
    const m = makeMaterial('downlight')
    expect(m.emissiveIntensity).toBeGreaterThan(0)
    expect(m.emissive.getHex()).not.toBe(0)
  })

  it('flags unknown ids in magenta instead of throwing', () => {
    expect(makeMaterial('nope').color.getHexString()).toBe('ff00ff')
  })

  it('builds every project material', () => {
    for (const id of Object.keys(materials)) {
      expect(() => makeMaterial(id, [1, 1])).not.toThrow()
    }
  })

  it('sharedMaterial caches', () => {
    expect(sharedMaterial('plaster')).toBe(sharedMaterial('plaster'))
  })
})

describe('applyFade', () => {
  it('scales opacity from the base and toggles transparency and visibility', () => {
    const solid = makeMaterial('plaster')
    const glass = makeMaterial('glass')
    const edges = makeEdgeMaterial(0.5)
    applyFade([solid, glass, edges], 0.5)
    expect(solid.opacity).toBeCloseTo(0.5)
    expect(solid.transparent).toBe(true)
    expect(solid.depthWrite).toBe(false)
    expect(glass.opacity).toBeCloseTo(materials.glass.opacity! * 0.5)
    expect(edges.opacity).toBeCloseTo(0.25)

    applyFade([solid], 1)
    expect(solid.opacity).toBe(1)
    expect(solid.transparent).toBe(false)
    expect(solid.depthWrite).toBe(true)
    expect(solid.visible).toBe(true)

    applyFade([solid], 0)
    expect(solid.visible).toBe(false)
  })
})
