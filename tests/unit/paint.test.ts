// @vitest-environment node
import { plan } from '../../src/project/plan'
import { describe, expect, it } from 'vitest'
import { DEFAULT_FINISHES, normalizeFinishes } from '../../src/model/finishes'
import { materials, shell } from '../../src/project'
import { finishDef } from '../../src/project/finishes'
import { faceAt, migrateAccent, paintFaces } from '../../src/project/paintFaces'

const faces = paintFaces(shell.walls)
const ids = faces.map((f) => f.id)

describe('paintable faces', () => {
  it('splits a long wall by the rooms it faces, and leaves out faces toward the outside', () => {
    expect(ids).toContain('side-kitchen:-:hall-kitchen')
    expect(ids).toContain('side-kitchen:-:main-room')
    expect(ids).toContain('entry-main:-:main-room')
    expect(ids).toContain('facade:-:balcony')
    // The party walls' outer faces are the neighbors'.
    expect(ids.some((id) => id.startsWith('side-kitchen:+'))).toBe(false)
  })

  it('finds the face under a click from the wall and the side the normal points to', () => {
    // A point on the main-room face of the bath-side wall (its normal points into the room, +z).
    expect(faceAt(faces, shell.walls, 'side-bath', 4.5, 0, [0, 1])?.id).toBe('side-bath:+:main-room')
    expect(faceAt(faces, shell.walls, 'side-bath', 1.0, 0, [0, 1])?.id).toBe('side-bath:+:bathroom')
  })
})

describe('paint finishes', () => {
  it('reads face colors and the ceiling, dropping junk', () => {
    const f = normalizeFinishes(
      {
        paint: { 'side-bath:+:main-room': '#5B5C5F', bad: '#fff', 'x:+:y': 'red' },
        ceilingPaint: '#ece4d6',
      },
      plan,
    )
    expect(f.paint).toEqual({ 'side-bath:+:main-room': '#5b5c5f' })
    expect(f.ceilingPaint).toBe('#ece4d6')
    expect(normalizeFinishes({}, plan).paint).toEqual({})
  })

  it('shows a face layer only when that face is painted', () => {
    const f = { ...DEFAULT_FINISHES, paint: { 'side-bath:+:main-room': '#5b5c5f' } }
    expect(finishDef('paint:side-bath:+:main-room', f, materials)).toMatchObject({ color: '#5b5c5f', hidden: false })
    expect(finishDef('paint:side-kitchen:-:main-room', f, materials)).toMatchObject({ hidden: true })
    expect(finishDef('ceiling', { ...f, ceilingPaint: '#ece4d6' }, materials)?.color).toBe('#ece4d6')
  })

  it('turns an old accent wall into the painted face it was on', () => {
    const old = normalizeFinishes({ accentWall: 'side-bath', accentColor: '#5b5c5f' }, plan)
    const f = migrateAccent(old, faces, shell.walls)
    expect(f.accentWall).toBe('none')
    expect(f.paint).toEqual({ 'side-bath:+:main-room': '#5b5c5f' })
    expect(migrateAccent(normalizeFinishes({}, plan), faces, shell.walls).paint).toEqual({})
  })
})
