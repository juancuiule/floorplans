import { beforeEach, describe, expect, it, vi } from 'vitest'
import { daylight, duskLevel } from '../../src/sun/daylight'
import { openTestPlan } from './plans'

// The view store reads the URL and localStorage at import time: import a fresh copy per test.
async function freshStore(search = '') {
  window.history.replaceState(null, '', `/${search}`)
  vi.resetModules()
  await openTestPlan()
  return (await import('../../src/store')).useView
}

describe('sun time model', () => {
  beforeEach(() => localStorage.clear())

  it('reads ?sun, ?date and ?facing', async () => {
    const v = (await freshStore('?sun=09:30&date=2026-06-21&facing=W')).getState()
    expect(v.sun).toEqual({ date: '2026-06-21', minutes: 570, facing: 270 })
    expect(v.lighting).toBe('day')
  })

  it('derives night from the sun, and Day / Evening jump to 15:00 and 21:00', async () => {
    const useView = await freshStore('?sun=23:00&date=2025-12-21')
    expect(useView.getState().lighting).toBe('evening')
    expect(useView.getState().dusk).toBe(1)
    useView.getState().setLighting('day')
    expect(useView.getState().sun.minutes).toBe(900)
    expect(useView.getState().lighting).toBe('day')
    useView.getState().setLighting('evening')
    expect(useView.getState().sun.minutes).toBe(1260)
    expect(useView.getState().lighting).toBe('evening')
  })

  it('keeps ?light=evening working', async () => {
    expect((await freshStore('?light=evening')).getState().lighting).toBe('evening')
  })

  it('wraps the time around midnight', async () => {
    const useView = await freshStore('?sun=23:50')
    useView.getState().setSun({ minutes: 1440 + 15 })
    expect(useView.getState().sun.minutes).toBe(15)
  })
})

describe('daylight curve', () => {
  it('warms and dims the sun toward the horizon', () => {
    const noon = daylight(60)
    const low = daylight(4)
    expect(low.sunIntensity).toBeLessThan(noon.sunIntensity)
    expect(low.sunColor.b / low.sunColor.r).toBeLessThan(noon.sunColor.b / noon.sunColor.r)
    expect(daylight(-2).sunIntensity).toBe(0)
    expect(daylight(-20).hemiIntensity).toBeCloseTo(0.12)
  })

  it('fades the lamps in through civil twilight', () => {
    expect(duskLevel(10)).toBe(0)
    expect(duskLevel(-2)).toBe(0.5)
    expect(duskLevel(-8)).toBe(1)
  })
})
