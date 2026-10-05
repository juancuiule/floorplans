// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { boxIn, FLOOR_FRAME, wallFrameOf, type Box } from '../../src/decor/extent'
import { buildGuideCtx, GALLERY_LINE, guideMove, snapBox, worldGuides } from '../../src/decor/guides'
import type { ArtworkItem, FurnitureItem } from '../../src/model/decor'

const box = (u0: number, u1: number, v0: number, v1: number): Box => ({ u0, u1, v0, v1 })

const art = (id: string, x: number, y: number, w = 0.3, h = 0.4): ArtworkItem => ({
  kind: 'artwork',
  id,
  image: '/artwork/a.png',
  at: [x, y, 0.1],
  facing: 'z+',
  host: 'w',
  size: { preset: 'custom', w, h },
  fit: 'cover',
  frame: { style: 'none', color: '#000', mat: 0 },
})

const sideboard = (id: string, x: number, z: number, rotation = 0): FurnitureItem => ({
  kind: 'furniture',
  id,
  type: 'sideboard',
  at: [x, 0, z],
  rotation,
  size: [1.2, 0.6, 0.4],
  finish: { body: '#fff', metal: '#000', fabric: '#888' },
  options: {},
})

describe('snapBox: alignment', () => {
  it('snaps a left edge within 3 cm and draws one guide spanning both boxes', () => {
    const r = snapBox(box(1.02, 1.32, 1, 1.4), [box(1, 1.3, 1.6, 2)])
    expect(r.du).toBeCloseTo(-0.02, 6)
    expect(r.dv).toBe(0)
    const align = r.lines.filter((l) => l.kind === 'align')
    // Same width: left edges, centers and right edges all line up after the move.
    expect(align.map((l) => l.a[0]).sort()).toEqual([1, 1.15, 1.3])
    expect(align[0].a[1]).toBeCloseTo(1, 6)
    expect(align[0].b[1]).toBeCloseTo(2, 6)
  })

  it('leaves the box alone beyond the tolerance', () => {
    const r = snapBox(box(1.05, 1.35, 1, 1.4), [box(1, 1.3, 1.6, 2)])
    expect([r.du, r.dv]).toEqual([0, 0])
    expect(r.lines).toEqual([])
  })

  it('lines up centers with centers, and edges with the other box’s center', () => {
    const r = snapBox(box(2, 2.2, 1.01, 1.41), [box(0, 0.4, 1, 1.4)])
    expect(r.dv).toBeCloseTo(-0.01, 6)
    const edgeToCenter = snapBox(box(0.21, 0.5, 0, 0.1), [box(0, 0.4, 1, 1.4)])
    expect(edgeToCenter.du).toBeCloseTo(-0.01, 6)
  })

  it('takes the nearest candidate', () => {
    const r = snapBox(box(1.02, 1.32, 0, 0.1), [box(1, 1.1, 1, 2), box(1.035, 1.2, 1, 2)])
    expect(r.du).toBeCloseTo(0.015, 6)
  })

  it('respects a locked axis', () => {
    const r = snapBox(box(1.02, 1.32, 1.01, 1.41), [box(1, 1.3, 1, 1.4)], { lockU: true })
    expect(r.du).toBe(0)
    expect(r.dv).toBeCloseTo(-0.01, 6)
  })
})

describe('snapBox: equal spacing', () => {
  it('matches an existing gap in the row and marks every equal gap', () => {
    // A and B are 10 cm apart; the moving box lands 10 cm right of B.
    const r = snapBox(box(0.81, 1.11, 1, 1.4), [box(0, 0.3, 1, 1.4), box(0.4, 0.7, 1, 1.4)])
    expect(r.du).toBeCloseTo(-0.01, 6)
    const labels = r.labels.filter((l) => l.kind === 'spacing').map((l) => l.text)
    expect(labels).toEqual(['10 cm', '10 cm'])
    expect(r.lines.filter((l) => l.kind === 'spacing').length).toBe(6)
  })

  it('centers between two neighbors', () => {
    // 1 m free between A and B; a 30 cm box is centered when both gaps are 35 cm.
    const r = snapBox(box(0.62, 0.92, 1, 1.4), [box(0, 0.3, 1, 1.4), box(1.3, 1.6, 1, 1.4)])
    expect(r.du).toBeCloseTo(0.03, 6)
    expect(r.labels.map((l) => l.text)).toEqual(['35 cm', '35 cm'])
  })

  it('ignores boxes that are not in the same row', () => {
    const r = snapBox(box(0.81, 1.11, 1, 1.4), [box(0, 0.3, 2, 2.4), box(0.4, 0.7, 2, 2.4)])
    expect(r.du).toBe(0)
  })
})

describe('snapBox: gallery line', () => {
  it('pulls the center to the gallery line when nothing else is near', () => {
    const r = snapBox(box(0, 0.3, 1.33, 1.73), [], { magnetV: GALLERY_LINE })
    expect(r.dv).toBeCloseTo(-0.03, 6)
    expect(r.lines.some((l) => l.kind === 'gallery' && l.a[1] === 1.5)).toBe(true)
    expect(r.labels[0]).toMatchObject({ text: '150 cm', kind: 'gallery' })
  })

  it('is weaker than lining up with another piece', () => {
    const r = snapBox(box(0, 0.3, 1.33, 1.73), [box(1, 1.3, 1.32, 1.72)], { magnetV: GALLERY_LINE })
    expect(r.dv).toBeCloseTo(-0.01, 6)
  })

  it('lets go past 5 cm', () => {
    expect(snapBox(box(0, 0.3, 1.4, 1.8), [], { magnetV: GALLERY_LINE }).dv).toBe(0)
  })
})

describe('frames and guideMove', () => {
  it('measures artwork on its wall: along the wall and in height, outer frame included', () => {
    const a = art('a', 2, 1.5)
    const b = boxIn(a, wallFrameOf(a))
    expect(b.u0).toBeCloseTo(1.85, 6)
    expect(b.u1).toBeCloseTo(2.15, 6)
    expect(b.v0).toBeCloseTo(1.3, 6)
    expect(b.v1).toBeCloseTo(1.7, 6)
  })

  it('uses the bounding box of a turned floor piece', () => {
    const b = boxIn(sideboard('s', 3, 1, 90), FLOOR_FRAME)
    expect(b.u1 - b.u0).toBeCloseTo(0.4, 6)
    expect(b.v1 - b.v0).toBeCloseTo(1.2, 6)
  })

  it('snaps artwork to other artwork on the same wall only', () => {
    const lead = art('m', 2.51, 1.62)
    const same = art('o', 2.5, 1.2)
    const otherWall: ArtworkItem = { ...art('x', 2.52, 1.2), facing: 'x+', at: [0.1, 1.2, 2.52] }
    const ctx = buildGuideCtx([lead, same, otherWall], new Set(['m']))
    const g = guideMove(ctx, lead, [lead])!
    expect(g.frame.kind).toBe('wall')
    expect(g.delta[0]).toBeCloseTo(-0.01, 6)
    expect(g.delta[2]).toBeCloseTo(0, 6)
    const world = worldGuides(g)!
    // A vertical guide on the wall plane, just off its surface.
    expect(world.align.length).toBeGreaterThan(0)
    expect(world.align[0][2]).toBeCloseTo(0.106, 6)
  })

  it('centers artwork over furniture standing against its wall, not over furniture out in the room', () => {
    // A sideboard backed onto the art's wall (surface at z = 0.1), centered at x = 3.
    const against = sideboard('s', 3, 0.304)
    const lead = art('m', 3.02, 1.5)
    const g = guideMove(buildGuideCtx([lead, against], new Set(['m'])), lead, [lead])!
    expect(g.delta[0]).toBeCloseTo(-0.02, 6)
    const away = sideboard('s', 3, 1.2)
    const g2 = guideMove(buildGuideCtx([lead, away], new Set(['m'])), lead, [lead])!
    expect(g2.delta[0]).toBe(0)
  })

  it('moves a whole selection by its combined box', () => {
    const a = art('a', 1.01, 1.5)
    const b = art('b', 1.41, 1.5)
    const ref = art('r', 1, 0.8)
    const g = guideMove(buildGuideCtx([a, b, ref], new Set(['a', 'b'])), a, [a, b])!
    expect(g.delta[0]).toBeCloseTo(-0.01, 6)
  })

  it('snaps floor pieces edge to edge in plan and draws the guides at floor level', () => {
    const lead = sideboard('m', 3.02, 2)
    const other = sideboard('o', 3, 1)
    const g = guideMove(buildGuideCtx([lead, other], new Set(['m'])), lead, [lead])!
    expect(g.frame.kind).toBe('floor')
    expect(g.delta[0]).toBeCloseTo(-0.02, 6)
    expect(worldGuides(g)!.align[0][1]).toBeCloseTo(0.012, 6)
  })

  it('has nothing to do for ceiling pieces', () => {
    const pendant = {
      kind: 'lamp',
      id: 'p',
      type: 'pendant',
      at: [2, 2.6, 1],
      rotation: 0,
      on: true,
      brightness: 1,
      warmth: 2700,
      color: '#000',
    } as const
    expect(guideMove(buildGuideCtx([], new Set()), { ...pendant, at: [2, 2.6, 1] }, [])).toBeNull()
  })
})
