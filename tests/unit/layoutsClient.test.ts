import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DecorItem } from '../../src/model/decor'
import { openTestPlan, planUrl } from './plans'

// The client side of the layouts menu (src/decor/layouts.ts) against a stubbed dev API.

interface Call {
  url: string
  method: string
  body?: string
}

let calls: Call[]
let files: Record<string, unknown>

const plant = (id: string, groupId?: string): DecorItem => ({
  kind: 'plant',
  id,
  species: 'monstera',
  pot: 'ceramic',
  at: [4, 0, 1],
  rotation: 0,
  scale: 1,
  ...(groupId ? { groupId } : {}),
})

function stubFetch() {
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      calls.push({ url, method, body: init?.body as string | undefined })
      const slug = new URL(url, 'http://x').searchParams.get('file') ?? 'main'
      if (url.includes('/decor') && method === 'GET')
        return new Response(JSON.stringify(files[slug] ?? { version: 1, items: [] }))
      if (url.includes('/decor') && method === 'PUT') return new Response('{"ok":true}')
      if (url.endsWith('/layouts') && method === 'POST')
        return new Response(JSON.stringify({ slug: 'copy', name: 'Copy' }), { status: 201 })
      if (url.includes('/layouts') && method === 'GET') return new Response('[]')
      if (url.includes('/layouts') && method === 'DELETE') return new Response('{"ok":true}')
      return new Response('{}', { status: 404 })
    }),
  )
}

async function fresh(search: string) {
  window.history.replaceState(null, '', `/${search}`)
  vi.resetModules()
  await openTestPlan()
  const store = await import('../../src/decor/store')
  const layouts = await import('../../src/decor/layouts')
  return { ...store, ...layouts }
}

beforeEach(() => {
  files = {}
  stubFetch()
})

describe('saveAs', () => {
  it('keeps group names in the copy', async () => {
    files['unit'] = {
      version: 1,
      groups: { g1: { name: 'Gallery wall' } },
      items: [plant('a', 'g1'), plant('b', 'g1')],
    }
    const { useDecor, useLayouts } = await fresh('?decor=unit')
    await useDecor.getState().load()
    await useLayouts.getState().saveAs('Copy')
    const post = calls.find((c) => c.method === 'POST')!
    expect(JSON.parse(post.body!).data.groups).toEqual({ g1: { name: 'Gallery wall' } })
  })

  it('keeps a piece being moved at its old spot, and leaves a new one out', async () => {
    files['unit'] = { version: 1, items: [plant('a')] }
    const { useDecor, useLayouts } = await fresh('?decor=unit')
    await useDecor.getState().load()
    useDecor.getState().startRelocating('a')
    useDecor.getState().update('a', { at: [5, 0, 2] })
    await useLayouts.getState().saveAs('Copy')
    const items = JSON.parse(calls.find((c) => c.method === 'POST')!.body!).data.items
    expect(items).toHaveLength(1)
    expect(items[0].at).toEqual([4, 0, 1])
  })
})

describe('remove', () => {
  it('deleting the open layout goes back to the plan’s main layout, on that plan’s routes', async () => {
    files['mine'] = { version: 1, items: [plant('a')] }
    const { useDecor, useLayouts } = await fresh('?plan=loft&decor=mine')
    await useDecor.getState().load()
    await useLayouts.getState().remove('mine')
    expect(useDecor.getState().layout).toBeNull()
    expect(calls.some((c) => c.method === 'DELETE' && c.url === planUrl('layouts?file=mine', 'loft'))).toBe(true)
    expect(calls.filter((c) => c.method === 'GET' && c.url.includes('/decor')).map((c) => c.url)).toContain(
      planUrl('decor', 'loft'),
    )
  })

  it('refuses to delete the main layout', async () => {
    const { useDecor, useLayouts } = await fresh('')
    await useDecor.getState().load()
    await useLayouts.getState().remove(null)
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    expect(useLayouts.getState().error).toMatch(/cannot be deleted/)
  })
})
