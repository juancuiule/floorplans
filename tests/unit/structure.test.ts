import { afterEach, describe, expect, it } from 'vitest'
import { plan } from '../../src/project/plan'
import { collisionsOf, snapToWalls } from '../../src/decor/placement'
import { FURNITURE } from '../../src/decor/furnitureCatalog'
import { serialize } from '../../src/decor/layoutFile'
import type { FurnitureItem, FurnitureType } from '../../src/model/decor'
import { DEFAULT_FINISHES, normalizeFinishes, structureOf, withStructure } from '../../src/model/finishes'
import { DEFAULT_STRUCTURE, normalizeStructure, toggleWall, type Structure } from '../../src/model/structure'
import type { Vec2 } from '../../src/model/types'
import { passable, shellObstacles } from '../../src/plan/obstacles'
import { walk, walkObstacles } from '../../src/plan/walk'
import { shell } from '../../src/project'
import {
  activeShell,
  activeWalls,
  ceilingFitting,
  currentStructure,
  lostWallOf,
  setStructure,
} from '../../src/project/structure'

const piece = (type: FurnitureType, at: [number, number, number], rotation = 0): FurnitureItem => ({
  kind: 'furniture',
  id: `f-${type}`,
  type,
  at,
  rotation,
  size: [...FURNITURE[type].size],
  finish: { ...FURNITURE[type].finish },
  options: { ...FURNITURE[type].options },
})

const removed = (...ids: Structure['removedWalls']): Structure => ({ removedWalls: ids, raiseEntryCeiling: false })

afterEach(() => void setStructure(DEFAULT_STRUCTURE))

describe('structure in the layout file', () => {
  it('reads missing or broken input as the flat as built', () => {
    for (const raw of [undefined, null, 3, 'x', {}, { removedWalls: 'entry-main' }])
      expect(normalizeStructure(raw, plan)).toEqual(DEFAULT_STRUCTURE)
  })

  it('keeps only removable partitions, in plan order, without duplicates', () => {
    const s = normalizeStructure(
      {
        removedWalls: ['entry-main', 'facade', 'side-bath', 'bath-hall', 'entry-main', 'column-kitchen'],
        raiseEntryCeiling: true,
      },
      plan,
    )
    expect(s).toEqual({ removedWalls: ['bath-hall', 'entry-main'], raiseEntryCeiling: true })
  })

  it('toggles a wall out and back', () => {
    const out = toggleWall(DEFAULT_STRUCTURE, 'entry-main', plan)
    expect(out.removedWalls).toEqual(['entry-main'])
    expect(toggleWall(out, 'entry-main', plan).removedWalls).toEqual([])
  })

  it('is left out of finishes (and the file) unless something differs', () => {
    expect('structure' in normalizeFinishes({}, plan)).toBe(false)
    expect('structure' in normalizeFinishes({ structure: { removedWalls: ['facade'] } }, plan)).toBe(false)
    const f = normalizeFinishes({ structure: { removedWalls: ['entry-main'] } }, plan)
    expect(structureOf(f)).toEqual({ removedWalls: ['entry-main'], raiseEntryCeiling: false })
    expect(structureOf(DEFAULT_FINISHES)).toEqual(DEFAULT_STRUCTURE)
    // Back to as built: the key goes.
    expect('structure' in withStructure(f, DEFAULT_STRUCTURE)).toBe(false)

    expect(JSON.parse(serialize([], DEFAULT_FINISHES)).finishes).toBeUndefined()
    const saved = JSON.parse(serialize([], f))
    expect(saved.finishes.structure).toEqual({ removedWalls: ['entry-main'], raiseEntryCeiling: false })
    // Round trip.
    expect(normalizeFinishes(saved.finishes, plan)).toEqual(f)
    // Other finishes without walls removed: no structure key in the file.
    expect(JSON.parse(serialize([], { ...DEFAULT_FINISHES, hexBlend: true })).finishes).not.toHaveProperty('structure')
  })
})

describe('activeShell', () => {
  it('is the plan as built when nothing is removed (same objects, nothing extra)', () => {
    const a = activeShell(DEFAULT_STRUCTURE)
    expect(a.walls).toEqual(shell.walls)
    a.walls.forEach((w, i) => expect(w).toBe(shell.walls[i]))
    expect(a.bulges).toHaveLength(shell.bulges.length)
    expect(a.accentPanels).toHaveLength(shell.accentPanels.length)
    expect(a.soffits).toEqual([])
    expect(a.floorFills).toEqual([])
    expect(a.ghosts).toEqual([])
    expect(activeShell(DEFAULT_STRUCTURE)).toBe(a)
  })

  it('takes out the bathroom wall with its door and tiles', () => {
    const a = activeShell(removed('bath-hall'))
    expect(a.walls.map((w) => w.id)).not.toContain('bath-hall')
    expect(a.bulges.map((b) => b.id)).not.toEqual(expect.arrayContaining(['tile-door-l']))
    expect(a.bulges.filter((b) => b.id.startsWith('tile-door'))).toEqual([])
    // Bathroom floor runs on to the old centerline.
    expect(a.floorFills).toEqual([{ id: 'bath-hall:0', rect: [0, 1.3, 1.25, 1.35], material: 'bathFloor' }])
    expect(a.ghosts).toEqual([{ wall: 'bath-hall', rect: [0, 1.3, 1.25, 1.4] }])
    // Unaffected walls keep their objects (no remount).
    expect(a.walls.find((w) => w.id === 'entry-main')).toBe(shell.walls.find((w) => w.id === 'entry-main'))
  })

  it('keeps the shower’s back wall when the hall–main partition goes, and closes the dropped ceiling', () => {
    const a = activeShell(removed('entry-main'))
    const w = a.walls.find((x) => x.id === 'entry-main')!
    expect(w.a).toEqual([2.15, 0])
    expect(w.b).toEqual([2.15, 0.8])
    expect(w.openings).toEqual([])
    expect(a.parts.get('entry-main')!.bulges.map((b) => b.id)).toEqual(['tile-shower-back'])
    expect(a.accentPanels.filter((p) => p.wall === 'entry-main')).toEqual([])
    expect(a.ghosts).toHaveLength(1)
    expect(a.ghosts[0].rect[1]).toBeCloseTo(0.8)
    expect(a.ghosts[0].rect[3]).toBeCloseTo(3.0)
    // A bulkhead from the 2.40 dropped ceiling up to the slab, over where the wall was.
    expect(a.soffits).toHaveLength(1)
    expect(a.soffits[0].openings![0].height).toBe(2.4)
    expect(a.ceilings.find((c) => c.id === 'entry-dropped')!.height).toBe(2.4)
  })

  it('raises the entry ceiling (and its downlights) as a separate what-if', () => {
    const s: Structure = { removedWalls: ['entry-main'], raiseEntryCeiling: true }
    const a = activeShell(s)
    expect(a.ceilings.find((c) => c.id === 'entry-dropped')!.height).toBe(2.6)
    expect(a.soffits).toEqual([])
    expect(ceilingFitting([1.05, 2.4, 1.9], s)).toEqual([1.05, 2.6, 1.9])
    expect(ceilingFitting([3.4, 2.6, 1.5], s)).toEqual([3.4, 2.6, 1.5])
    expect(activeShell({ removedWalls: [], raiseEntryCeiling: true }).walls).toEqual(shell.walls)
  })

  it('fills the corner only when both neighbors are gone', () => {
    expect(activeShell(removed('shower-niche')).floorFills.map((f) => f.id)).toEqual(['shower-niche:0'])
    expect(activeShell(removed('bath-niche', 'shower-niche')).floorFills.map((f) => f.id)).toEqual([
      'bath-niche:0',
      'shower-niche:0',
      'shower-niche:1',
    ])
  })
})

describe('the open layout’s structure', () => {
  it('drives activeWalls() and notices only real changes', () => {
    expect(setStructure(removed('bath-niche'))).toBe(true)
    expect(setStructure({ removedWalls: ['bath-niche'], raiseEntryCeiling: false })).toBe(false)
    expect(currentStructure().removedWalls).toEqual(['bath-niche'])
    expect(activeWalls().map((w) => w.id)).not.toContain('bath-niche')
  })

  it('marks decor hung where a wall was taken out', () => {
    const s = removed('entry-main')
    // On the part that stays (behind the shower), and past it.
    expect(lostWallOf({ at: [2.2, 1.4, 0.4], host: 'entry-main' }, s)).toBeNull()
    expect(lostWallOf({ at: [2.2, 1.4, 2.0], host: 'entry-main' }, s)).toBe('entry-main')
    expect(lostWallOf({ at: [2.2, 1.4, 2.0], host: 'entry-main' }, DEFAULT_STRUCTURE)).toBeNull()
    expect(lostWallOf({ at: [4, 1.4, 0.01], host: 'side-bath' }, s)).toBeNull()
    expect(lostWallOf({ at: [4, 1.4, 0.01] }, s)).toBeNull()
    // A 50 cm print centered near the end of what stays hangs half off it.
    expect(lostWallOf({ at: [2.2, 1.7, 0.76], host: 'entry-main', facing: 'x+', size: { w: 0.5 } }, s)).toBe(
      'entry-main',
    )
    expect(lostWallOf({ at: [2.2, 1.7, 0.4], host: 'entry-main', facing: 'x+', size: { w: 0.5 } }, s)).toBeNull()
    // On the passage jamb (facing along the wall): its width runs across the wall.
    expect(
      lostWallOf({ at: [2.14, 2.18, 0.8], host: 'entry-main', facing: 'z+', size: [0.09, 0.17, 0.38] }, s),
    ).toBeNull()
  })
})

describe('plan code follows removed walls', () => {
  /** Walks in small steps, like frames. */
  const stroll = (from: Vec2, dir: Vec2, meters: number): Vec2 => {
    const obs = walkObstacles([])
    let p = from
    const steps = Math.ceil(meters / 0.03)
    for (let i = 0; i < steps; i++) p = walk(p, [(dir[0] * meters) / steps, (dir[1] * meters) / steps], obs)
    return p
  }

  it('walks straight from the niche into the main room once the partition is gone', () => {
    // z 1.1: beside the passage (z 1.4–2.4), through the wall.
    expect(stroll([1.6, 1.1], [1, 0], 2)[0]).toBeLessThan(2.0)
    setStructure(removed('entry-main'))
    expect(stroll([1.6, 1.1], [1, 0], 2)[0]).toBeGreaterThan(3.5)
  })

  it('drops the wall from clearance and measure obstacles', () => {
    expect(shellObstacles(passable).some((o) => o.id.startsWith('bath-hall:'))).toBe(true)
    setStructure(removed('bath-hall'))
    expect(shellObstacles(passable).some((o) => o.id.startsWith('bath-hall:'))).toBe(false)
    expect(shellObstacles(passable).some((o) => o.id === 'tile-door-l')).toBe(false)
  })

  it('no longer snaps against a removed wall', () => {
    const shelf = piece('bookshelf', [2.4, 0, 2.0])
    expect(snapToWalls(2.4, 2.0, shelf)).toMatchObject({ x: 2.37, rotation: 90 })
    setStructure(removed('entry-main'))
    expect(snapToWalls(2.4, 2.0, shelf)).toBeNull()
    // Behind the shower the wall stays.
    expect(snapToWalls(2.4, 0.5, shelf)).toMatchObject({ x: 2.37, rotation: 90 })
  })

  it('no longer flags pieces standing where a wall was', () => {
    // Beside the passage, clear of the stretch that stays behind the shower.
    const stool = piece('chair', [2.15, 0, 1.1])
    expect(collisionsOf(stool, [stool]).wall).toBe(true)
    setStructure(removed('entry-main'))
    expect(collisionsOf(stool, [stool]).wall).toBe(false)
  })
})
