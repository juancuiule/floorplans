import { createElement } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseNumber } from '../../src/ui/controlUtils'
import type { FurnitureItem } from '../../src/model/decor'
import { openTestPlan } from './plans'

// Panel pieces rendered in jsdom: the number field parser, the inspector and
// the Room tab's plan diagram.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('parseNumber', () => {
  it('reads plain numbers, with a comma or a point', () => {
    expect(parseNumber('12')).toBe(12)
    expect(parseNumber(' 12.5 ')).toBe(12.5)
    expect(parseNumber('12,5')).toBe(12.5)
    expect(parseNumber('-3')).toBe(-3)
    expect(parseNumber('.5')).toBe(0.5)
    expect(parseNumber('7.')).toBe(7)
  })
  it('rejects anything else instead of reading a prefix', () => {
    for (const junk of ['', ' ', 'abc', '12abc', '0x10', '1e9', 'Infinity', '-', '.', '1.2.3', '1,2,3'])
      expect(parseNumber(junk), junk).toBeNull()
  })
})

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

async function load(search: string) {
  window.history.replaceState(null, '', `/${search}`)
  vi.resetModules()
  await openTestPlan()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{"version":1,"items":[]}')),
  )
}

describe('Inspector options', () => {
  it('shows an option missing from an older file at its default, not as on', async () => {
    await load('?decor=unit')
    const { useDecor } = await import('../../src/decor/store')
    const { Inspector } = await import('../../src/ui/Inspector')
    await useDecor.getState().load()
    // Saved before the floating shelf could be styled: no `items` option.
    const shelf: FurnitureItem = {
      kind: 'furniture',
      id: 'f1',
      type: 'floatingShelf',
      at: [4, 1.4, 0.1],
      rotation: 0,
      size: [0.8, 0.04, 0.2],
      finish: { body: '#c9a57a', metal: '#222222', fabric: '#dddddd' },
      options: { brackets: true },
    }
    act(() => useDecor.setState({ items: [shelf] }))
    act(() => root.render(createElement(Inspector, { id: 'f1' })))
    const styled = [...host.querySelectorAll('.switch-row')].find((r) => /styled/i.test(r.textContent ?? ''))!
    const sw = styled.querySelector('[role="switch"]')!
    expect(sw.getAttribute('aria-checked')).toBe('false')
    // One click turns it on (before, the first click wrote `false` and nothing changed).
    act(() => (sw as HTMLButtonElement).click())
    expect((useDecor.getState().items[0] as FurnitureItem).options).toEqual({ brackets: true, items: true })
  })
})

describe('Room tab plan diagram', () => {
  const viewBox = () => host.querySelector('svg.plan-diagram')!.getAttribute('viewBox')!.split(' ').map(Number)

  it.each([
    ['monoambiente', '', [8.4, 3.2]],
    ['loft', '?plan=loft', [6.2, 4.4]],
  ])('frames the whole %s plan', async (_id, search, [maxX, maxZ]) => {
    await load(search)
    const { WallsSection } = await import('../../src/ui/WallsSection')
    act(() => root.render(createElement(WallsSection)))
    const [x, z, w, h] = viewBox()
    expect(x).toBeLessThan(-0.1)
    expect(z).toBeLessThan(-0.2)
    expect(x + w).toBeGreaterThanOrEqual(maxX)
    expect(z + h).toBeGreaterThanOrEqual(maxZ)
    // Not much empty space either.
    expect(x + w).toBeLessThan(maxX + 0.5)
    expect(z + h).toBeLessThan(maxZ + 0.5)
  })
})
