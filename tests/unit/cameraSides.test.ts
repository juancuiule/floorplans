import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isFlippable, mirrorCamera, sideNames, sideOf } from '../../src/project/cameraSides'
import { CAMERAS, CENTER_Z, FLOOR_BOUNDS, SIDE_NAMES } from '../../src/project/derived'
import loft from '../../examples/loft/plans/loft.plan.json'
import { openTestPlan } from './plans'

describe('iso views from either side', () => {
  it('mirrors position and target across the center z, keeping x, height and label', () => {
    const cam = {
      label: 'Iso',
      position: [11.2, 7.6, -4.6] as [number, number, number],
      target: [4, 0.4, 1.4] as [number, number, number],
    }
    const m = mirrorCamera(cam, 1.5)
    expect(m.label).toBe('Iso')
    expect(m.position[0]).toBe(11.2)
    expect(m.position[1]).toBe(7.6)
    expect(m.position[2]).toBeCloseTo(7.6)
    expect(m.target).toEqual([4, 0.4, expect.closeTo(1.6)])
    // Twice is the original view.
    const back = mirrorCamera(m, 1.5)
    expect(back.position[2]).toBeCloseTo(-4.6)
    expect(back.target[2]).toBeCloseTo(1.4)
  })

  it('keeps the distance to the target, so the view is the same size from the other side', () => {
    const cam = CAMERAS['iso-balcony']
    const m = mirrorCamera(cam, CENTER_Z)
    const dist = (c: typeof cam) => Math.hypot(...c.position.map((v, i) => v - c.target[i]))
    expect(dist(m)).toBeCloseTo(dist(cam))
  })

  it('flips the monoambiente iso views from the bathroom side to the kitchen side and back', () => {
    expect(CENTER_Z).toBeCloseTo((FLOOR_BOUNDS[1] + FLOOR_BOUNDS[3]) / 2)
    expect(SIDE_NAMES).toEqual(['bathroom', 'hall + kitchen'])
    const bal = CAMERAS['iso-balcony']
    const ent = CAMERAS['iso-entry']
    expect(sideOf(bal, CENTER_Z)).toBe(-1)
    expect(sideOf(mirrorCamera(bal, CENTER_Z), CENTER_Z)).toBe(1)
    expect(sideOf(ent, CENTER_Z)).toBe(1)
    expect(sideOf(mirrorCamera(ent, CENTER_Z), CENTER_Z)).toBe(-1)
  })

  it('only the iso views flip', () => {
    expect(isFlippable('iso-balcony')).toBe(true)
    expect(isFlippable('iso-entry')).toBe(true)
    expect(isFlippable('top')).toBe(false)
    expect(isFlippable('from-balcony')).toBe(false)
    expect(isFlippable('from-entry')).toBe(false)
  })

  it('names the sides of another plan from its rooms', () => {
    expect(sideNames(loft.shell as never)).toEqual(['bathroom', 'kitchen'])
  })
})

describe('flip state in the view store', () => {
  async function freshStore(search = '') {
    window.history.replaceState(null, '', `/${search}`)
    vi.resetModules()
    await openTestPlan()
    return (await import('../../src/store')).useView
  }
  beforeEach(() => sessionStorage.clear())

  it('flips only the current iso view, keeps it for the session and ignores top', async () => {
    let useView = await freshStore('?view=iso-entry')
    const n = useView.getState().presetNonce
    useView.getState().flipView()
    expect(useView.getState().isoFlip).toEqual({ 'iso-balcony': false, 'iso-entry': true })
    expect(useView.getState().presetNonce).toBe(n + 1)
    useView.getState().goTo('top')
    const before = useView.getState().isoFlip
    useView.getState().flipView()
    expect(useView.getState().isoFlip).toBe(before)
    useView = await freshStore('?view=iso-balcony')
    expect(useView.getState().isoFlip['iso-entry']).toBe(true)
  })

  it('?flip=1 opens the view from its other side', async () => {
    const useView = await freshStore('?view=iso-balcony&flip=1')
    expect(useView.getState().isoFlip['iso-balcony']).toBe(true)
  })
})
