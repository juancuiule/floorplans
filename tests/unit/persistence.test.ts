import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSaver } from '../../src/decor/persistence'

describe('saver', () => {
  let writes: string[]
  const write = async (body: string, target: string) => void writes.push(target === 'main' ? body : `${target}:${body}`)

  beforeEach(() => {
    writes = []
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('writes the last change once changes pause', async () => {
    const s = createSaver(write, 400)
    s.change('a', 'main')
    await vi.advanceTimersByTimeAsync(200)
    s.change('b', 'main')
    await vi.advanceTimersByTimeAsync(399)
    expect(writes).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(writes).toEqual(['b'])
  })

  it('does not write what is already on disk, and drops a pending write that goes back to it', async () => {
    const s = createSaver(write)
    s.synced('disk')
    s.change('edited', 'main')
    s.change('disk', 'main')
    await vi.runAllTimersAsync()
    expect(writes).toEqual([])
  })

  it('flush writes a pending change right away', async () => {
    const s = createSaver(write)
    s.change('a', 'main')
    await s.flush()
    expect(writes).toEqual(['a'])
    await vi.runAllTimersAsync()
    expect(writes).toEqual(['a'])
  })

  it('recognizes its own writes and the loaded file, not other text', async () => {
    const s = createSaver(write)
    s.synced('loaded')
    s.change('one', 'main')
    await s.flush()
    s.change('two', 'main')
    await s.flush()
    expect(s.isOwn('loaded')).toBe(false)
    expect(s.isOwn('one')).toBe(true)
    expect(s.isOwn('two')).toBe(true)
    expect(s.isOwn('someone else')).toBe(false)
  })

  it('writes to the layout the change was made in', async () => {
    const s = createSaver(write)
    s.change('a', 'other')
    await s.flush()
    expect(writes).toEqual(['other:a'])
  })

  it('synced cancels a pending write', async () => {
    const s = createSaver(write)
    s.change('a', 'main')
    s.synced('from disk')
    await vi.runAllTimersAsync()
    expect(writes).toEqual([])
  })
})
