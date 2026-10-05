import { describe, expect, it } from 'vitest'
import { readLaunch } from '../../src/project/launch'

describe('launch options', () => {
  it('opens the defaults without parameters', () => {
    const l = readLaunch('')
    expect(l).toMatchObject({ plan: null, layout: undefined, view: null, xray: false, flip: null, dims: true })
    expect(l.sunFromUrl).toBe(false)
    expect(l.camera).toBeNull()
  })

  it('reads every documented parameter', () => {
    const l = readLaunch(
      '?plan=loft&decor=wall-bed&view=top&mode=xray&flip=1&dims=0&downlights=0&clearances=1&sun=09:30&date=2026-06-21&facing=NE&cam=1,2,3,4,5,6,50',
    )
    expect(l).toMatchObject({
      plan: 'loft',
      layout: 'wall-bed',
      view: 'top',
      xray: true,
      flip: true,
      dims: false,
      downlights: false,
      clearances: true,
      sun: { minutes: 570, evening: false, date: '2026-06-21', facing: 45 },
      sunFromUrl: true,
      camera: { position: [1, 2, 3], target: [4, 5, 6], fov: 50 },
    })
  })

  it('ignores bad values as if they were missing', () => {
    const l = readLaunch('?view=sideways&decor=../etc&sun=25:99&date=yesterday&cam=1,2,x,4,5,6')
    expect(l.view).toBeNull()
    expect(l.layout).toBeUndefined()
    expect(l.sun.minutes).toBeNull()
    expect(l.sun.date).toBeNull()
    expect(l.camera).toBeNull()
  })

  it('counts ?light=evening as setting the sun', () => {
    const l = readLaunch('?light=evening')
    expect(l.sun.evening).toBe(true)
    expect(l.sunFromUrl).toBe(true)
  })
})
