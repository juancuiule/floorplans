import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ArtworkItem, DecorFile, DecorItem, PlantItem } from '../../src/model/decor'
import { cloneSet } from '../../src/decor/clone'
import { serialize } from '../../src/decor/layoutFile'
import { openTestPlan } from './plans'

// Multi-selection, groups and their persistence. Like store.test.ts, each test
// gets a fresh store module with fetch stubbed.

type Store = typeof import('../../src/decor/store')

let puts: string[]
let fileOnDisk: DecorFile

function stubFetch() {
  puts = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (String(input).includes('/decor') && method === 'GET') return new Response(JSON.stringify(fileOnDisk))
      if (String(input).includes('/decor') && method === 'PUT') {
        puts.push(init!.body as string)
        return new Response('{"ok":true}')
      }
      return new Response('{}', { status: 404 })
    }),
  )
}

async function freshStore(): Promise<Store> {
  window.history.replaceState(null, '', '/?decor=unit')
  vi.resetModules()
  await openTestPlan()
  return import('../../src/decor/store')
}

const art = (id: string, x: number, groupId?: string): ArtworkItem => ({
  kind: 'artwork',
  id,
  image: '/artwork/a.png',
  at: [x, 1.5, 0.1],
  facing: 'z+',
  host: 'w',
  size: { preset: 'A4', w: 0.21, h: 0.297 },
  fit: 'cover',
  frame: { style: 'thin', color: '#000', mat: 0 },
  ...(groupId ? { groupId } : {}),
})
const plant = (id: string, x = 4): PlantItem => ({
  kind: 'plant',
  id,
  species: 'monstera',
  pot: 'ceramic',
  at: [x, 0, 1],
  rotation: 0,
  scale: 1,
})

const saved = () => (puts.length ? (JSON.parse(puts[puts.length - 1]) as DecorFile) : undefined)

let useDecor: Store['useDecor']
let mod: Store

beforeEach(async () => {
  vi.useFakeTimers()
  fileOnDisk = { version: 1, items: [art('a', 1), art('b', 1.5), art('c', 2), plant('p')] }
  stubFetch()
  mod = await freshStore()
  useDecor = mod.useDecor
  await useDecor.getState().load()
})
afterEach(() => {
  vi.useRealTimers()
})

const ids = () => useDecor.getState().selectedIds

describe('selection', () => {
  it('select sets one item; toggleSelect adds and removes; the primary follows the last added', () => {
    const s = useDecor.getState()
    s.select('a')
    expect(ids()).toEqual(['a'])
    s.toggleSelect('b')
    expect(ids()).toEqual(['a', 'b'])
    expect(useDecor.getState().selectedId).toBe('b')
    s.toggleSelect('b')
    expect(ids()).toEqual(['a'])
    expect(useDecor.getState().selectedId).toBe('a')
    s.select(null)
    expect(ids()).toEqual([])
  })

  it('selectAllLike takes everything on the selected piece’s wall', () => {
    const s = useDecor.getState()
    s.select('b')
    s.selectAllLike()
    expect(ids().sort()).toEqual(['a', 'b', 'c'])
    expect(useDecor.getState().selectedId).toBe('b')
  })

  it('removeMany deletes the selection in one undo step', async () => {
    const s = useDecor.getState()
    s.selectMany(['a', 'c'])
    s.removeMany(ids())
    expect(useDecor.getState().items.map((i) => i.id)).toEqual(['b', 'p'])
    expect(ids()).toEqual([])
    useDecor.getState().undo()
    expect(useDecor.getState().items.map((i) => i.id)).toEqual(['a', 'b', 'c', 'p'])
    expect(ids().sort()).toEqual(['a', 'c'])
  })

  it('a drag of one selected piece moves the others, and one undo puts all back', () => {
    const s = useDecor.getState()
    s.selectMany(['a', 'b'], 'a')
    s.startDragging('a')
    expect(useDecor.getState().followers.map((f) => f.id)).toEqual(['b'])
    useDecor.getState().applyPatches({ a: { at: [1.2, 1.6, 0.1] }, b: { at: [1.7, 1.6, 0.1] } })
    useDecor.getState().applyPatches({ a: { at: [1.3, 1.6, 0.1] }, b: { at: [1.8, 1.6, 0.1] } })
    useDecor.getState().stopMoving()
    useDecor.getState().undo()
    const at = (id: string) => useDecor.getState().items.find((i) => i.id === id)!.at
    expect(at('a')).toEqual([1, 1.5, 0.1])
    expect(at('b')).toEqual([1.5, 1.5, 0.1])
    expect(useDecor.getState().canUndo).toBe(false)
  })

  it('Esc during a group drag restores every piece', () => {
    const s = useDecor.getState()
    s.selectMany(['a', 'b'], 'a')
    s.startDragging('a')
    useDecor.getState().applyPatches({ a: { at: [3, 1, 0.1] }, b: { at: [3.5, 1, 0.1] } })
    useDecor.getState().cancelPlacing()
    expect(
      useDecor
        .getState()
        .items.slice(0, 2)
        .map((i) => i.at),
    ).toEqual([
      [1, 1.5, 0.1],
      [1.5, 1.5, 0.1],
    ])
    expect(useDecor.getState().canUndo).toBe(false)
  })

  it('nudgeMany moves each piece by its own offset, a burst being one step', () => {
    const s = useDecor.getState()
    s.nudgeMany({ a: [0.01, 0, 0], b: [0.01, 0, 0] })
    s.nudgeMany({ a: [0.01, 0, 0], b: [0.01, 0, 0] })
    expect(useDecor.getState().items[0].at[0]).toBeCloseTo(1.02, 6)
    useDecor.getState().undo()
    expect(useDecor.getState().items[0].at[0]).toBe(1)
    expect(useDecor.getState().items[1].at[0]).toBe(1.5)
  })
})

describe('groups', () => {
  it('group gives the selection one groupId, saved with the items; ungroup takes it off', async () => {
    const s = useDecor.getState()
    s.selectMany(['a', 'b', 'c'])
    s.group()
    const g = useDecor.getState().items[0].groupId
    expect(g).toMatch(/^g-/)
    expect(
      useDecor
        .getState()
        .items.slice(0, 3)
        .every((i) => i.groupId === g),
    ).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(
      saved()!
        .items.filter((i) => i.groupId === g)
        .map((i) => i.id),
    ).toEqual(['a', 'b', 'c'])
    expect(saved()!.groups).toBeUndefined()

    useDecor.getState().ungroup()
    await vi.advanceTimersByTimeAsync(1000)
    expect(saved()!.items.some((i) => 'groupId' in i)).toBe(false)
  })

  it('clicking a member picks the whole group; single picks just it', () => {
    const s = useDecor.getState()
    s.selectMany(['a', 'b'])
    s.group()
    s.select(null)
    useDecor.getState().pick('b')
    expect(ids().sort()).toEqual(['a', 'b'])
    expect(useDecor.getState().selectedId).toBe('b')
    useDecor.getState().pick('b', { single: true })
    expect(ids()).toEqual(['b'])
    // Shift+click on a grouped piece adds its whole group.
    useDecor.getState().select('c')
    useDecor.getState().toggleSelect('a')
    expect(ids().sort()).toEqual(['a', 'b', 'c'])
  })

  it('names are saved under groups only while the group exists', async () => {
    const s = useDecor.getState()
    s.selectMany(['a', 'b'])
    s.group()
    const g = useDecor.getState().items[0].groupId!
    useDecor.getState().renameGroup(g, '  Over the desk ')
    await vi.advanceTimersByTimeAsync(1000)
    expect(saved()!.groups).toEqual({ [g]: { name: 'Over the desk' } })
    useDecor.getState().ungroup()
    await vi.advanceTimersByTimeAsync(1000)
    expect(saved()!.groups).toBeUndefined()
  })

  it('loads group names from the file and keeps old files (no groups) unchanged', async () => {
    fileOnDisk = { version: 1, groups: { G: { name: 'Gallery' } }, items: [art('x', 1, 'G'), art('y', 2, 'G')] }
    await useDecor.getState().load()
    expect(useDecor.getState().groupNames).toEqual({ G: 'Gallery' })
    expect(serialize(useDecor.getState().items, undefined, '', useDecor.getState().groupNames)).toBe(
      JSON.stringify(fileOnDisk, null, 2) + '\n',
    )
    // A layout without groups serializes without the key.
    expect(serialize([art('x', 1)])).not.toContain('groups')
  })

  it('duplicating a whole group makes a new group; a lone member is copied ungrouped', () => {
    const s = useDecor.getState()
    s.selectMany(['a', 'b'])
    s.group()
    const g = useDecor.getState().items[0].groupId
    useDecor.getState().duplicateSelection()
    const st = useDecor.getState()
    const copies = st.items.filter((i) => st.selectedIds.includes(i.id))
    expect(copies).toHaveLength(2)
    expect(copies[0].groupId).toBeTruthy()
    expect(copies[0].groupId).not.toBe(g)
    expect(copies[0].groupId).toBe(copies[1].groupId)
    // Next to the originals, 10 cm along the wall.
    expect(copies[0].at[0]).toBeCloseTo(1.1, 6)

    const items = useDecor.getState().items
    const lone = cloneSet([items[0]], items)
    expect(lone[0].groupId).toBeUndefined()
  })

  it('copy and paste of a group keeps it a group, as one undo step', () => {
    const s = useDecor.getState()
    s.selectMany(['a', 'b'])
    s.group()
    useDecor.getState().copy('a')
    const n = useDecor.getState().items.length
    useDecor.getState().paste()
    const st = useDecor.getState()
    expect(st.items.length).toBe(n + 2)
    const pasted = st.items.slice(-2) as DecorItem[]
    expect(pasted[0].groupId).toBe(pasted[1].groupId)
    expect(st.selectedIds).toEqual(pasted.map((i) => i.id))
    st.undo()
    expect(useDecor.getState().items.length).toBe(n)
  })

  it('undo of grouping restores the loose pieces', () => {
    const s = useDecor.getState()
    s.selectMany(['a', 'b'])
    s.group()
    useDecor.getState().undo()
    expect(useDecor.getState().items.some((i) => i.groupId)).toBe(false)
  })

  it('deleting all but one piece of a group leaves that piece loose; undo brings the group back', () => {
    const s = useDecor.getState()
    s.selectMany(['a', 'b', 'c'])
    s.group()
    const gid = useDecor.getState().items.find((i) => i.id === 'a')!.groupId
    s.remove('a')
    // Two left: still a group.
    expect(
      useDecor
        .getState()
        .items.filter((i) => i.groupId === gid)
        .map((i) => i.id),
    ).toEqual(['b', 'c'])
    s.remove('b')
    expect(useDecor.getState().items.find((i) => i.id === 'c')!.groupId).toBeUndefined()
    s.undo()
    expect(
      useDecor
        .getState()
        .items.filter((i) => i.groupId === gid)
        .map((i) => i.id),
    ).toEqual(['b', 'c'])
  })
})
