import { describe, expect, it } from 'vitest'
import { createHistory, type Snapshot } from '../../src/decor/history'
import type { DecorItem } from '../../src/model/decor'
import { DEFAULT_FINISHES } from '../../src/model/finishes'

const item = (id: string, x: number) => ({ kind: 'plant', id, at: [x, 0, 0] }) as unknown as DecorItem
const snap = (...items: DecorItem[]): Snapshot => ({ items, finishes: DEFAULT_FINISHES })

function clock() {
  let t = 0
  return { now: () => t, advance: (ms: number) => (t += ms) }
}

describe('history', () => {
  it('undoes and redoes a step', () => {
    const a = snap(item('p', 0))
    const b = snap(item('p', 1))
    const h = createHistory(a)
    h.record(b, null)
    expect(h.canUndo).toBe(true)
    expect(h.undo()).toEqual({ to: a, from: b })
    expect(h.canRedo).toBe(true)
    expect(h.redo()).toEqual({ to: b, from: a })
  })

  it('records nothing when the snapshot did not change', () => {
    const p = item('p', 0)
    const h = createHistory(snap(p))
    h.record(snap(p), null)
    expect(h.canUndo).toBe(false)
  })

  it('merges same-key changes while they keep coming', () => {
    const c = clock()
    const h = createHistory(snap(item('p', 0)), { now: c.now })
    h.record(snap(item('p', 1)), { key: 'scale' })
    c.advance(500)
    h.record(snap(item('p', 2)), { key: 'scale' })
    c.advance(1500)
    h.record(snap(item('p', 3)), { key: 'scale' })
    expect(h.undo()?.to.items[0].at[0]).toBe(2)
    expect(h.undo()?.to.items[0].at[0]).toBe(0)
    expect(h.canUndo).toBe(false)
  })

  it('merges a whole gesture however long it takes', () => {
    const c = clock()
    const h = createHistory(snap(item('p', 0)), { now: c.now })
    for (let x = 1; x <= 5; x++) {
      c.advance(5000)
      h.record(snap(item('p', x)), { gesture: 1 })
    }
    expect(h.undo()?.to.items[0].at[0]).toBe(0)
    expect(h.canUndo).toBe(false)
  })

  it('drops a gesture that ends where it started', () => {
    const p = item('p', 0)
    const h = createHistory(snap(p))
    h.record(snap(item('p', 1)), { gesture: 7 })
    h.record(snap(p), { gesture: 7 })
    expect(h.canUndo).toBe(false)
  })

  it('a new change clears redo', () => {
    const h = createHistory(snap(item('p', 0)))
    h.record(snap(item('p', 1)), null)
    h.undo()
    h.record(snap(item('p', 2)), null)
    expect(h.canRedo).toBe(false)
  })

  it('keeps at most `limit` steps', () => {
    const h = createHistory(snap(item('p', 0)), { limit: 3 })
    for (let x = 1; x <= 5; x++) h.record(snap(item('p', x)), null)
    let steps = 0
    while (h.undo()) steps++
    expect(steps).toBe(3)
  })

  it('reset forgets everything', () => {
    const h = createHistory(snap(item('p', 0)))
    h.record(snap(item('p', 1)), null)
    h.undo()
    h.reset(snap(item('q', 0)))
    expect(h.canUndo).toBe(false)
    expect(h.canRedo).toBe(false)
  })
})
