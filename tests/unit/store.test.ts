import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { newId } from '../../src/decor/clone'
import type { DecorItem, LampItem, PlantItem } from '../../src/model/decor'
import { openTestPlan, planUrl, TEST_SPACE } from './plans'

// The store reads ?decor= at import time and persists through fetch, so each test
// sets the URL, stubs fetch and imports a fresh copy of the module.

type Store = typeof import('../../src/decor/store')

interface Call {
  url: string
  method: string
  body?: string
}

let calls: Call[]
let fileOnDisk: { version: 1; items: DecorItem[] }

function stubFetch() {
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      calls.push({ url: String(input), method, body: init?.body as string | undefined })
      if (String(input).includes('/decor') && method === 'GET') return new Response(JSON.stringify(fileOnDisk))
      if (String(input).includes('/decor') && method === 'PUT') return new Response('{"ok":true}')
      if (String(input).endsWith('/artwork'))
        return new Response(JSON.stringify([{ name: 'a.png', url: '/artwork/a.png' }]))
      return new Response('{}', { status: 404 })
    }),
  )
}

async function freshStore(search = '?decor=unit'): Promise<Store> {
  window.history.replaceState(null, '', `/${search}`)
  vi.resetModules()
  await openTestPlan()
  return import('../../src/decor/store')
}

const plant = (id: string, x = 4): PlantItem => ({
  kind: 'plant',
  id,
  species: 'monstera',
  pot: 'ceramic',
  at: [x, 0, 1],
  rotation: 0,
  scale: 1,
})
const lamp = (id: string): LampItem => ({
  kind: 'lamp',
  id,
  type: 'arc',
  at: [3, 0, 2],
  rotation: 0,
  on: true,
  brightness: 1,
  warmth: 2700,
  color: '#ffffff',
})

const puts = () => calls.filter((c) => c.method === 'PUT')
const lastSavedItems = () => {
  const p = puts().at(-1)
  return p ? (JSON.parse(p.body!).items as DecorItem[]) : undefined
}

beforeEach(() => {
  vi.useFakeTimers()
  fileOnDisk = { version: 1, items: [plant('p1'), lamp('l1')] }
  stubFetch()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('load', () => {
  it('reads the ?decor= file and marks the store loaded', async () => {
    const { useDecor } = await freshStore('?decor=unit')
    await useDecor.getState().load()
    expect(calls[0]).toMatchObject({ url: planUrl('decor?file=unit'), method: 'GET' })
    expect(useDecor.getState().loaded).toBe(true)
    expect(useDecor.getState().items.map((i) => i.id)).toEqual(['p1', 'l1'])
  })

  it('uses the default decor file without ?decor=', async () => {
    const { useDecor } = await freshStore('')
    await useDecor.getState().load()
    expect(calls[0].url).toBe(planUrl('decor'))
  })

  it('does not write back what it just loaded', async () => {
    const { useDecor } = await freshStore()
    await useDecor.getState().load()
    useDecor.getState().select('p1')
    await vi.advanceTimersByTimeAsync(1000)
    expect(puts()).toHaveLength(0)
  })

  it('keeps a draft under the pointer when the file is reloaded', async () => {
    const { useDecor } = await freshStore()
    const s = useDecor.getState()
    await s.load()
    s.startPlacing(plant('draft'))
    await useDecor.getState().load()
    expect(useDecor.getState().items.map((i) => i.id)).toEqual(['p1', 'l1', 'draft'])
  })

  it('reports that saving is unavailable without the dev API and never writes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('offline'))),
    )
    const { useDecor } = await freshStore()
    await useDecor.getState().load()
    expect(useDecor.getState().saveStatus).toBe('no-api')
    useDecor.getState().startPlacing(plant('x'))
    useDecor.getState().stopMoving()
    await vi.advanceTimersByTimeAsync(1000)
    expect(vi.mocked(fetch).mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'PUT')).toHaveLength(
      0,
    )
  })
})

describe('placing and relocating', () => {
  let useDecor: Store['useDecor']
  beforeEach(async () => {
    ;({ useDecor } = await freshStore())
    await useDecor.getState().load()
  })

  it('startPlacing adds a selected draft that follows the pointer', () => {
    useDecor.getState().startPlacing(plant('new'))
    const s = useDecor.getState()
    expect(s.items.map((i) => i.id)).toContain('new')
    expect(s).toMatchObject({ movingId: 'new', isDraft: true, backup: null, selectedId: 'new' })
  })

  it('cancelPlacing removes a new draft and clears the selection', () => {
    useDecor.getState().startPlacing(plant('new'))
    useDecor.getState().cancelPlacing()
    const s = useDecor.getState()
    expect(s.items.map((i) => i.id)).toEqual(['p1', 'l1'])
    expect(s).toMatchObject({ movingId: null, isDraft: false, backup: null, selectedId: null })
  })

  it('cancelPlacing restores a relocated item to where it was', () => {
    const before = structuredClone(useDecor.getState().items.find((i) => i.id === 'p1')!)
    useDecor.getState().startRelocating('p1')
    expect(useDecor.getState()).toMatchObject({ movingId: 'p1', isDraft: true, selectedId: 'p1' })
    useDecor.getState().update<PlantItem>('p1', { at: [6, 0, 2.5], rotation: 90 })
    useDecor.getState().cancelPlacing()
    const s = useDecor.getState()
    expect(s.items.find((i) => i.id === 'p1')).toEqual(before)
    expect(s.items).toHaveLength(2)
    // A relocated item stays selected after cancel.
    expect(s.selectedId).toBe('p1')
  })

  it('the backup is a copy, not the live item', () => {
    useDecor.getState().startRelocating('p1')
    const live = useDecor.getState().items.find((i) => i.id === 'p1') as PlantItem
    live.at[0] = 99 // mutate in place, as a careless caller might
    useDecor.getState().cancelPlacing()
    expect((useDecor.getState().items.find((i) => i.id === 'p1') as PlantItem).at[0]).toBe(4)
    expect(useDecor.getState().backup).toBeNull()
  })

  it('starting a new placement cancels the previous draft', () => {
    useDecor.getState().startPlacing(plant('a'))
    useDecor.getState().startPlacing(plant('b'))
    expect(useDecor.getState().items.map((i) => i.id)).toEqual(['p1', 'l1', 'b'])
  })

  it('starting a placement while relocating puts the relocated item back', () => {
    useDecor.getState().startRelocating('l1')
    useDecor.getState().update<LampItem>('l1', { at: [5, 0, 0.5] })
    useDecor.getState().startPlacing(plant('b'))
    expect(useDecor.getState().items.find((i) => i.id === 'l1')!.at).toEqual([3, 0, 2])
    expect(useDecor.getState().movingId).toBe('b')
  })

  it('stopMoving keeps the dropped item', () => {
    useDecor.getState().startPlacing(plant('new', 5))
    useDecor.getState().stopMoving()
    const s = useDecor.getState()
    expect(s.items.map((i) => i.id)).toEqual(['p1', 'l1', 'new'])
    expect(s).toMatchObject({ movingId: null, isDraft: false, selectedId: 'new' })
    // Esc after dropping does nothing to it.
    s.cancelPlacing()
    expect(useDecor.getState().items).toHaveLength(3)
  })

  it('startDragging moves an existing item without a draft', () => {
    useDecor.getState().startDragging('p1')
    expect(useDecor.getState()).toMatchObject({ movingId: 'p1', isDraft: false, selectedId: 'p1' })
    useDecor.getState().cancelPlacing()
    expect(useDecor.getState().items).toHaveLength(2)
  })

  it('startRelocating an unknown id does nothing', () => {
    useDecor.getState().startRelocating('nope')
    expect(useDecor.getState()).toMatchObject({ movingId: null, isDraft: false })
  })
})

describe('update, remove, duplicate', () => {
  let store: Store
  beforeEach(async () => {
    store = await freshStore()
    await store.useDecor.getState().load()
  })

  it('update merges a patch into one item', () => {
    store.useDecor.getState().update<PlantItem>('p1', { scale: 1.5 })
    const items = store.useDecor.getState().items
    expect((items[0] as PlantItem).scale).toBe(1.5)
    expect((items[0] as PlantItem).species).toBe('monstera')
    expect(items[1]).toEqual(lamp('l1'))
  })

  it('remove drops the item and its selection', () => {
    store.useDecor.getState().select('p1')
    store.useDecor.getState().remove('p1')
    expect(store.useDecor.getState().items.map((i) => i.id)).toEqual(['l1'])
    expect(store.useDecor.getState().selectedId).toBeNull()
  })

  it('remove keeps the selection of other items', () => {
    store.useDecor.getState().select('l1')
    store.useDecor.getState().remove('p1')
    expect(store.useDecor.getState().selectedId).toBe('l1')
  })

  it('duplicate starts placing a deep copy with a fresh id of the same kind', () => {
    store.useDecor.getState().duplicate('p1')
    const s = store.useDecor.getState()
    expect(s.items).toHaveLength(3)
    const copy = s.items[2] as PlantItem
    expect(copy.id).not.toBe('p1')
    expect(copy.id).toMatch(/^plant-/)
    expect(s).toMatchObject({ movingId: copy.id, isDraft: true })
    // Same item, fresh id; the copy pins its leaf layout to the original's seed.
    expect({ ...copy, id: 'p1', seed: undefined }).toEqual({ ...s.items[0], seed: undefined })
    expect(copy.seed).toBe('p1')
    expect(copy.at).not.toBe((s.items[0] as PlantItem).at)
    // Cancelling the duplicate leaves the original alone.
    s.cancelPlacing()
    expect(store.useDecor.getState().items.map((i) => i.id)).toEqual(['p1', 'l1'])
  })

  it('duplicate of an unknown id is a no-op', () => {
    store.useDecor.getState().duplicate('nope')
    expect(store.useDecor.getState().items).toHaveLength(2)
  })

  it('newId prefixes the kind and is unique', () => {
    const ids = new Set(Array.from({ length: 5000 }, () => newId('artwork')))
    expect(ids.size).toBe(5000)
    for (const id of ids) expect(id).toMatch(/^artwork-[a-z0-9]+$/)
  })
})

describe('persistence', () => {
  let useDecor: Store['useDecor']
  beforeEach(async () => {
    ;({ useDecor } = await freshStore('?decor=unit'))
    await useDecor.getState().load()
  })

  it('does not save a new draft still following the pointer', async () => {
    useDecor.getState().startPlacing(plant('new'))
    useDecor.getState().update<PlantItem>('new', { at: [5, 0, 1] })
    await vi.advanceTimersByTimeAsync(1000)
    expect(puts()).toHaveLength(0)
  })

  it('saves once the draft is dropped, debounced, to the ?decor= file', async () => {
    useDecor.getState().startPlacing(plant('new'))
    useDecor.getState().update<PlantItem>('new', { at: [5, 0, 1] })
    useDecor.getState().stopMoving()
    await vi.advanceTimersByTimeAsync(100)
    expect(puts()).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(400)
    expect(puts()).toHaveLength(1)
    expect(puts()[0].url).toBe(planUrl('decor?file=unit'))
    expect(JSON.parse(puts()[0].body!)).toMatchObject({ version: 1 })
    expect(lastSavedItems()!.map((i) => i.id)).toEqual(['p1', 'l1', 'new'])
  })

  it('coalesces a burst of edits into one write with the final state', async () => {
    for (let i = 1; i <= 5; i++) useDecor.getState().update<PlantItem>('p1', { scale: 1 + i / 10 })
    await vi.advanceTimersByTimeAsync(500)
    expect(puts()).toHaveLength(1)
    expect((lastSavedItems()![0] as PlantItem).scale).toBeCloseTo(1.5)
  })

  it('saves the old spot of an item being relocated, then the new spot once dropped', async () => {
    useDecor.getState().startRelocating('p1')
    useDecor.getState().update<PlantItem>('p1', { at: [6, 0, 2] })
    await vi.advanceTimersByTimeAsync(500)
    // Nothing changed on disk yet: the backup is what gets serialized.
    expect(puts()).toHaveLength(0)
    useDecor.getState().stopMoving()
    await vi.advanceTimersByTimeAsync(500)
    expect(lastSavedItems()!.find((i) => i.id === 'p1')!.at).toEqual([6, 0, 2])
  })

  it('writes removals', async () => {
    useDecor.getState().remove('l1')
    await vi.advanceTimersByTimeAsync(500)
    expect(lastSavedItems()!.map((i) => i.id)).toEqual(['p1'])
  })
})

describe('library', () => {
  it('refreshLibrary loads the artwork list', async () => {
    const { useDecor } = await freshStore()
    await useDecor.getState().refreshLibrary()
    expect(useDecor.getState().library).toEqual([{ name: 'a.png', url: '/artwork/a.png' }])
  })

  it('upload posts the file under its name and adds it to the library once', async () => {
    const { useDecor } = await freshStore()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ name: 'my pic.png', url: '/artwork/my%20pic.png' }))),
    )
    const file = new File([new Uint8Array([1, 2, 3])], 'my pic.png', { type: 'image/png' })
    const img = await useDecor.getState().upload(file)
    await useDecor.getState().upload(file)
    expect(img).toEqual({ name: 'my pic.png', url: '/artwork/my%20pic.png' })
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(`/api/spaces/${TEST_SPACE}/artwork?name=my%20pic.png`)
    expect(useDecor.getState().library.filter((x) => x.name === 'my pic.png')).toHaveLength(1)
  })

  it('upload surfaces the server error', async () => {
    const { useDecor } = await freshStore()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Only png' }), { status: 400 })),
    )
    const img = await useDecor.getState().upload(new File([], 'x.txt'))
    expect(img).toBeNull()
    expect(useDecor.getState().uploadError).toBe('Only png')
  })
})

describe('finishes are part of undo', () => {
  let useDecor: Store['useDecor']
  beforeEach(async () => {
    ;({ useDecor } = await freshStore())
    await useDecor.getState().load()
  })
  const mainFloor = () => useDecor.getState().finishes.floors.main
  const floor = (main: 'walnut' | 'concrete') => ({ floors: { ...useDecor.getState().finishes.floors, main } })

  it('undoes and redoes a floor change without touching the items', () => {
    useDecor.getState().update<PlantItem>('p1', { scale: 1.2 })
    const items = useDecor.getState().items
    useDecor.getState().setFinishes(floor('walnut'))
    useDecor.getState().undo()
    expect(mainFloor()).toBe('oakLight')
    // The earlier item edit is still there: undo took back only the floor.
    expect(useDecor.getState().items).toBe(items)
    useDecor.getState().redo()
    expect(mainFloor()).toBe('walnut')
  })

  it('undoes taking a wall out', () => {
    useDecor.getState().setFinishes({ structure: { removedWalls: ['entry-main'], raiseEntryCeiling: false } })
    expect(useDecor.getState().canUndo).toBe(true)
    useDecor.getState().undo()
    expect(useDecor.getState().finishes.structure).toBeUndefined()
    useDecor.getState().redo()
    expect(useDecor.getState().finishes.structure?.removedWalls).toEqual(['entry-main'])
  })

  it('a color picker drag is one step; two floor picks are two', () => {
    const s = useDecor.getState()
    s.setFinishes({ wallPaint: '#eeeeee' })
    s.setFinishes({ wallPaint: '#dddddd' })
    s.setFinishes({ wallPaint: '#cccccc' })
    s.undo()
    expect(useDecor.getState().finishes.wallPaint).toBe('#f3f1ec')
    expect(useDecor.getState().canUndo).toBe(false)
    s.setFinishes(floor('walnut'))
    s.setFinishes(floor('concrete'))
    s.undo()
    expect(mainFloor()).toBe('walnut')
  })

  it('saves an undone finish', async () => {
    useDecor.getState().setFinishes({ wallPaint: '#eeeeee' })
    await vi.advanceTimersByTimeAsync(500)
    useDecor.getState().undo()
    await vi.advanceTimersByTimeAsync(500)
    expect(JSON.parse(puts().at(-1)!.body!).finishes).toBeUndefined()
  })
})

describe('a broken layout file', () => {
  it('pauses saving while the file is not valid JSON, and resumes once it is fixed', async () => {
    const { useDecor } = await freshStore()
    await useDecor.getState().load()
    let text = '{ "version": 1, "items": [ '
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body as string | undefined })
        return init?.method === 'PUT'
          ? new Response('{"ok":true}')
          : new Response(text, { headers: { 'Content-Type': 'application/json' } })
      }),
    )
    await useDecor.getState().load()
    expect(useDecor.getState().saveStatus).toBe('broken-file')
    // What was on screen stays, and is not written over the file being fixed.
    expect(useDecor.getState().items.map((i) => i.id)).toEqual(['p1', 'l1'])
    useDecor.getState().update<PlantItem>('p1', { scale: 1.3 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(puts()).toHaveLength(0)

    text = JSON.stringify({ version: 1, items: [plant('p1')] })
    await useDecor.getState().load()
    expect(useDecor.getState().saveStatus).toBe('ok')
    useDecor.getState().update<PlantItem>('p1', { scale: 1.4 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(lastSavedItems()?.[0]).toMatchObject({ id: 'p1', scale: 1.4 })
  })

  it('treats a layout with an unknown catalog entry as broken, and says why', async () => {
    const { useDecor } = await freshStore()
    fileOnDisk = { version: 1, items: [{ ...plant('p1'), species: 'triffid' } as unknown as DecorItem] }
    await useDecor.getState().load()
    expect(useDecor.getState().saveStatus).toBe('broken-file')
    expect(useDecor.getState().fileProblem).toMatch(/^items\[0\]\.species: .*"triffid"$/)
  })

  it('stays paused after an upload succeeds', async () => {
    const { useDecor } = await freshStore()
    await useDecor.getState().load()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body as string | undefined })
        if (String(url).includes('/artwork')) return new Response('{"name":"a.png","url":"/artwork/a.png"}')
        return init?.method === 'PUT' ? new Response('{"ok":true}') : new Response('{ "items": [')
      }),
    )
    await useDecor.getState().load()
    expect(await useDecor.getState().upload(new File([], 'a.png'))).not.toBeNull()
    useDecor.getState().update<PlantItem>('p1', { scale: 1.3 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(useDecor.getState().saveStatus).toBe('broken-file')
    expect(puts()).toHaveLength(0)
  })

  it('treats a file without an items array as broken', async () => {
    const { useDecor } = await freshStore()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"version":1,"items":{}}')),
    )
    await useDecor.getState().load()
    expect(useDecor.getState().saveStatus).toBe('broken-file')
  })
})

describe('switchLayout', () => {
  it('starts the other layout with nothing selected, even when it has the same ids', async () => {
    const { useDecor } = await freshStore('?decor=unit')
    await useDecor.getState().load()
    useDecor.getState().selectMany(['p1', 'l1'])
    await useDecor.getState().switchLayout('unit-b')
    expect(useDecor.getState().items.map((i) => i.id)).toEqual(['p1', 'l1'])
    expect(useDecor.getState().selectedIds).toEqual([])
    expect(useDecor.getState().selectedId).toBeNull()
  })
})
