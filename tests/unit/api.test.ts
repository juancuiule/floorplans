// @vitest-environment node
import { mkdtempSync, promises as fs, rmSync } from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApi } from '../../server/api'
import { devApi } from '../../server/devServer'
import { SpaceStore } from '../../server/storage'
import { slugify } from '../../src/model/layoutNames'

// The API (server/api.ts) on a real http server over a temporary data folder,
// with the example workspaces as templates. Each test starts with space s1
// holding one plan, loft, made from the loft template and without layouts.

let root: string
let base: string
let server: http.Server
let store: SpaceStore

beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'floorplan-api-'))
  store = new SpaceStore(path.join(root, 'data'), path.resolve('examples'))
  const api = createApi(store)
  server = http.createServer((req, res) =>
    api(req, res, () => {
      res.statusCode = 418
      res.end('next')
    }),
  )
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise((r) => server.close(r))
  rmSync(root, { recursive: true, force: true })
})

beforeEach(async () => {
  await fs.rm(store.root, { recursive: true, force: true })
  await store.createSpace('Test', 's1')
  expect(await store.createPlan('s1', { template: 'loft', name: 'Loft' })).toBe('loft')
  await fs.rm(store.layoutsDir('s1', 'loft'), { recursive: true, force: true })
})

const P = () => `${base}/api/spaces/s1/plans/loft`
const data = () => store.layoutsDir('s1', 'loft')
const file = (slug: string | null) => path.join(data(), slug ? `decor.${slug}.json` : 'decor.json')
const read = async (slug: string | null) => JSON.parse(await fs.readFile(file(slug), 'utf8'))
const writeLayout = async (slug: string | null, body: unknown) => {
  await fs.mkdir(data(), { recursive: true })
  await fs.writeFile(file(slug), JSON.stringify(body))
}
const json = (body: unknown, method = 'POST'): RequestInit => ({ method, body: JSON.stringify(body) })
const plant = { kind: 'plant', id: 'p1', species: 'monstera', pot: 'ceramic', at: [4, 0, 1], rotation: 0, scale: 1 }

describe('routing', () => {
  it('passes non-API requests on, and 404s unknown routes', async () => {
    expect((await fetch(`${base}/index.html`)).status).toBe(418)
    expect((await fetch(`${base}/api/nope`)).status).toBe(404)
    expect((await fetch(`${base}/api/spaces/s1/artwork`, { method: 'DELETE' })).status).toBe(404)
  })

  it('404s unknown spaces and plans, and rejects ids that are not ids', async () => {
    expect((await fetch(`${base}/api/spaces/nobody`)).status).toBe(404)
    expect((await fetch(`${base}/api/spaces/s1/plans/nothing`)).status).toBe(404)
    expect((await fetch(`${base}/api/spaces/s1/plans/nothing/decor`)).status).toBe(404)
    expect((await fetch(`${base}/api/spaces/${encodeURIComponent('../s1')}`)).status).toBe(400)
    expect((await fetch(`${base}/api/spaces/s1/plans/${encodeURIComponent('../../x')}`)).status).toBe(400)
  })
})

describe('spaces and plans', () => {
  it('creates a space with an unguessable id, names it and renames it', async () => {
    const res = await fetch(`${base}/api/spaces`, json({ name: '  Our flat ' }))
    expect(res.status).toBe(201)
    const { id } = (await res.json()) as { id: string }
    expect(id).toMatch(/^[a-z0-9]{12}$/)
    expect(await (await fetch(`${base}/api/spaces/${id}`)).json()).toEqual({ id, name: 'Our flat', plans: [] })
    await fetch(`${base}/api/spaces/${id}`, json({ name: 'Home' }, 'PATCH'))
    expect(((await (await fetch(`${base}/api/spaces/${id}`)).json()) as { name: string }).name).toBe('Home')
  })

  it('deletes a space with everything in it, and 404s it afterwards', async () => {
    await writeLayout(null, { version: 1, items: [plant] })
    await fetch(`${base}/api/spaces/s1/artwork?name=mine.png`, { method: 'POST', body: 'x' })
    expect((await fetch(`${base}/api/spaces/s1`, { method: 'DELETE' })).status).toBe(200)
    await expect(fs.access(store.spaceDir('s1'))).rejects.toThrow()
    expect((await fetch(`${base}/api/spaces/s1`)).status).toBe(404)
    expect((await fetch(`${base}/api/spaces/s1`, { method: 'DELETE' })).status).toBe(404)
    expect((await fetch(`${base}/api/spaces/${encodeURIComponent('../data')}`, { method: 'DELETE' })).status).toBe(400)
  })

  it('lists the templates from examples/', async () => {
    const t = (await (await fetch(`${base}/api/templates`)).json()) as { id: string }[]
    expect(t.map((x) => x.id)).toEqual(['loft', 'monoambiente'])
  })

  it('makes a plan from a template with its main layout, but none of its artwork', async () => {
    const res = await fetch(`${base}/api/spaces/s1/plans`, json({ template: 'monoambiente', name: 'The studio' }))
    expect(await res.json()).toEqual({ id: 'the-studio' })
    const plan = (await (await fetch(`${base}/api/spaces/s1/plans/the-studio`)).json()) as { id: string; name: string }
    expect([plan.id, plan.name]).toEqual(['the-studio', 'The studio'])
    const layout = (await (await fetch(`${base}/api/spaces/s1/plans/the-studio/decor`)).json()) as {
      items: { kind: string }[]
      plan?: string
    }
    expect(layout.items.length).toBeGreaterThan(0)
    expect(layout.items.some((i) => i.kind === 'artwork')).toBe(false)
    expect(layout.plan).toBeUndefined()
    await expect(fs.readdir(store.artworkDir('s1'))).rejects.toThrow()
  })

  it('makes a plan from a posted plan, checks it, and gives repeated names their own id', async () => {
    const loft = JSON.parse(await fs.readFile('examples/loft/plans/loft.plan.json', 'utf8'))
    const a = await (await fetch(`${base}/api/spaces/s1/plans`, json({ plan: loft, name: 'Loft' }))).json()
    expect(a).toEqual({ id: 'loft-2' })
    const broken = { ...loft, shell: { ...loft.shell, walls: 'no' } }
    const bad = await fetch(`${base}/api/spaces/s1/plans`, json({ plan: broken, name: 'Broken' }))
    expect(bad.status).toBe(400)
    expect(((await bad.json()) as { error: string }).error).toMatch(/^Not a valid plan: shell\.walls/)
    const plans = (await (await fetch(`${base}/api/spaces/s1`)).json()) as { plans: { id: string }[] }
    expect(plans.plans.map((p) => p.id).sort()).toEqual(['loft', 'loft-2'])
  })

  it('replaces a plan only with a valid one that keeps its id', async () => {
    const loft = JSON.parse(await (await fetch(P())).text())
    expect((await fetch(P(), json({ ...loft, name: 'Renamed' }, 'PUT'))).status).toBe(200)
    expect(JSON.parse(await (await fetch(P())).text()).name).toBe('Renamed')
    expect((await fetch(P(), json({ ...loft, id: 'other' }, 'PUT'))).status).toBe(400)
    expect((await fetch(P(), json({ ...loft, version: 2 }, 'PUT'))).status).toBe(400)
  })

  it('deletes a plan with its layouts', async () => {
    await writeLayout(null, { version: 1, items: [plant] })
    expect((await fetch(P(), { method: 'DELETE' })).status).toBe(200)
    expect((await fetch(P())).status).toBe(404)
    await expect(fs.access(data())).rejects.toThrow()
  })

  it('keeps spaces apart: one space cannot read another one’s plans, layouts or artwork', async () => {
    await store.createSpace('Other', 's2')
    await writeLayout(null, { version: 1, items: [plant] })
    expect((await fetch(`${base}/api/spaces/s2/plans/loft`)).status).toBe(404)
    expect((await fetch(`${base}/api/spaces/s2/plans/loft/decor`)).status).toBe(404)
    await fetch(`${base}/api/spaces/s1/artwork?name=mine.png`, { method: 'POST', body: 'x' })
    expect(await (await fetch(`${base}/api/spaces/s2/artwork`)).json()).toEqual([])
    expect((await fetch(`${base}/api/spaces/s2/artwork/mine.png`)).status).toBe(404)
  })
})

describe('artwork', () => {
  const art = () => store.artworkDir('s1')
  const upload = (name: string, body: string | Uint8Array<ArrayBuffer> = 'img') =>
    fetch(`${base}/api/spaces/s1/artwork?name=${encodeURIComponent(name)}`, { method: 'POST', body })

  it('lists only images, in natural order, with their URLs', async () => {
    expect(await (await fetch(`${base}/api/spaces/s1/artwork`)).json()).toEqual([])
    await fs.mkdir(art(), { recursive: true })
    for (const f of ['img 10.png', 'img 2.jpg', 'notes.txt', 'b.WEBP', '.DS_Store'])
      await fs.writeFile(path.join(art(), f), 'x')
    const list = (await (await fetch(`${base}/api/spaces/s1/artwork`)).json()) as { name: string; url: string }[]
    expect(list.map((x) => x.name)).toEqual(['b.WEBP', 'img 2.jpg', 'img 10.png'])
    expect(list[2].url).toBe('/api/spaces/s1/artwork/img%2010.png')
  })

  it('stores an upload byte for byte and serves it back', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 0, 255])
    const res = await upload('photo.png', bytes)
    expect(await res.json()).toEqual({ name: 'photo.png', url: '/api/spaces/s1/artwork/photo.png' })
    const got = await fetch(`${base}/api/spaces/s1/artwork/photo.png`)
    expect(got.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(bytes)
  })

  it('never overwrites: repeated names get -2, -3…', async () => {
    const names = []
    for (let i = 0; i < 3; i++)
      names.push(((await (await upload('same.png', `v${i}`)).json()) as { name: string }).name)
    expect(names).toEqual(['same.png', 'same-2.png', 'same-3.png'])
  })

  it('rejects non-image names, and keeps uploads inside the folder', async () => {
    for (const name of ['evil.svg', 'notes.txt', 'x.png.exe', 'noext'])
      expect((await upload(name)).status, name).toBe(400)
    const a = (await (await upload('../../../escape.png')).json()) as { name: string }
    expect(a.name).toBe('escape.png')
    const b = (await (await upload('we?ird<>:name.JPG')).json()) as { name: string }
    expect(b.name).toBe('we-ird-name.jpg')
    expect((await fs.readdir(art())).sort()).toEqual(['escape.png', 'we-ird-name.jpg'])
    expect((await fetch(`${base}/api/spaces/s1/artwork/${encodeURIComponent('../space.json')}`)).status).toBe(404)
  })
})

describe('reference images', () => {
  it('keeps floor plan images apart from the artwork library', async () => {
    const res = await fetch(`${base}/api/spaces/s1/references?name=plan.png`, { method: 'POST', body: 'img' })
    expect(await res.json()).toEqual({ name: 'plan.png', url: '/api/spaces/s1/references/plan.png' })
    expect((await fetch(`${base}/api/spaces/s1/references/plan.png`)).status).toBe(200)
    expect(await (await fetch(`${base}/api/spaces/s1/artwork`)).json()).toEqual([])
  })
})

describe('layout files (decor)', () => {
  const doc = { version: 1, items: [plant] }

  it('returns an empty layout when the file is missing', async () => {
    expect(await (await fetch(`${P()}/decor?file=unit`)).json()).toEqual({ version: 1, items: [] })
  })

  it('writes and reads back verbatim, ?file= apart from the main layout', async () => {
    const put = await fetch(`${P()}/decor?file=unit-1`, json(doc, 'PUT'))
    expect(await put.json()).toEqual({ ok: true })
    const text = await fs.readFile(file('unit-1'), 'utf8')
    expect(text).toBe(JSON.stringify(doc, null, 2) + '\n')
    expect(await (await fetch(`${P()}/decor?file=unit-1`)).text()).toBe(text)
    await expect(fs.access(file(null))).rejects.toThrow()
    await fetch(`${P()}/decor`, json(doc, 'PUT'))
    expect(await read(null)).toEqual(doc)
  })

  it('rejects bad file names, bodies without items and malformed JSON, without writing', async () => {
    for (const name of ['../x', 'a/b', 'Upper', 'a.b', 'x'.repeat(41)]) {
      const q = `file=${encodeURIComponent(name)}`
      expect((await fetch(`${P()}/decor?${q}`)).status, name).toBe(400)
      expect((await fetch(`${P()}/decor?${q}`, json(doc, 'PUT'))).status, name).toBe(400)
    }
    expect((await fetch(`${P()}/decor?file=unit`, json({ version: 1 }, 'PUT'))).status).toBe(400)
    expect((await fetch(`${P()}/decor?file=unit`, { method: 'PUT', body: '{nope' })).status).toBe(400)
    expect(await fs.readdir(data()).catch(() => [])).toEqual([])
  })
})

describe('layouts menu', () => {
  const list = async (q = '') =>
    (await (await fetch(`${P()}/layouts${q}`)).json()) as {
      slug: string | null
      name: string
      items: number
      plan: string
    }[]
  const post = (body: unknown) => fetch(`${P()}/layouts`, json(body))
  const patch = (slug: string | null, body: unknown) =>
    fetch(`${P()}/layouts${slug ? `?file=${slug}` : ''}`, json(body, 'PATCH'))
  const del = (slug: string | null) => fetch(`${P()}/layouts${slug ? `?file=${slug}` : ''}`, { method: 'DELETE' })

  it('always lists the main layout, as Current, for this plan', async () => {
    expect(await list()).toEqual([
      { slug: null, name: 'Current', items: 0, updated: new Date(0).toISOString(), plan: 'loft' },
    ])
  })

  it('lists names and item counts; main first, then by name; hides test files', async () => {
    await writeLayout(null, { version: 1, items: [plant, plant] })
    await writeLayout('b-side', { version: 1, name: 'Bed by the window', items: [plant] })
    await writeLayout('a-side', { version: 1, items: [] })
    await writeLayout('e2e-smoke', { version: 1, items: [] })
    await writeLayout('test-x', { version: 1, items: [] })
    await fs.writeFile(path.join(data(), 'notes.json'), '{}')
    expect((await list()).map((x) => [x.slug, x.name, x.items])).toEqual([
      [null, 'Current', 2],
      ['a-side', 'a-side', 0],
      ['b-side', 'Bed by the window', 1],
    ])
    expect((await list('?all=1')).map((x) => x.slug)).toContain('e2e-smoke')
  })

  it('saves the posted state under a slug made from the name, or copies another layout', async () => {
    const res = await post({
      name: 'Desk by the window',
      data: { version: 1, finishes: { wallPaint: '#dfe3d6' }, items: [plant] },
    })
    expect(await res.json()).toEqual({ slug: 'desk-by-the-window', name: 'Desk by the window' })
    expect(await read('desk-by-the-window')).toEqual({
      version: 1,
      name: 'Desk by the window',
      finishes: { wallPaint: '#dfe3d6' },
      items: [plant],
    })
    await writeLayout(null, { version: 1, name: 'Main', items: [plant] })
    const a = await (await post({ name: 'Copy', from: null })).json()
    const b = await (await post({ name: 'Copy', from: null })).json()
    expect([a.slug, b.slug]).toEqual(['copy', 'copy-2'])
    expect((await post({ name: '  ', data: { items: [] } })).status).toBe(400)
    expect((await post({ name: 'x', from: '../etc' })).status).toBe(400)
  })

  it('renames: a named layout moves to its new slug, the main one keeps its file', async () => {
    await writeLayout('old', { version: 1, name: 'Old', items: [plant] })
    expect(await (await patch('old', { name: 'New plan' })).json()).toEqual({ slug: 'new-plan', name: 'New plan' })
    await expect(fs.access(file('old'))).rejects.toThrow()
    await writeLayout(null, { version: 1, items: [plant] })
    expect(await (await patch(null, { name: 'As built' })).json()).toEqual({ slug: null, name: 'As built' })
    expect(await read(null)).toEqual({ version: 1, name: 'As built', items: [plant] })
    expect((await patch('missing', { name: 'x' })).status).toBe(404)
  })

  it('deletes named layouts, never the main one', async () => {
    await writeLayout('gone', { version: 1, items: [] })
    expect((await del('gone')).status).toBe(200)
    await writeLayout(null, { version: 1, items: [plant] })
    expect((await del(null)).status).toBe(400)
    expect((await del('nope')).status).toBe(404)
  })
})

describe('importing a workspace', () => {
  it('copies plans, sorts layouts into their plans, and points artwork links at the new space', async () => {
    const id = await store.importWorkspace(path.resolve('examples/monoambiente'), { id: 'mine' })
    const space = await store.space(id)
    expect(space.plans.map((p) => p.id)).toEqual(['monoambiente'])
    const main = await fs.readFile(path.join(store.layoutsDir('mine', 'monoambiente'), 'decor.json'), 'utf8')
    expect(main).toContain('"/api/spaces/mine/artwork/')
    expect(main).not.toContain('"/artwork/')
    expect((await fs.readdir(store.artworkDir('mine'))).length).toBeGreaterThan(0)
  })
})

describe('the dev server', () => {
  it('tells open tabs which layout of which plan changed on disk', () => {
    const sent: unknown[] = []
    let onChange: ((file: string) => void) | undefined
    const fake = {
      watcher: { add: () => {}, on: (ev: string, fn: (file: string) => void) => ev === 'change' && (onChange = fn) },
      ws: { send: (m: unknown) => sent.push(m) },
      middlewares: { use: () => {} },
    }
    ;(devApi(store).configureServer as (s: unknown) => void)(fake)
    onChange!(path.join(data(), 'decor.json'))
    onChange!(path.join(data(), 'decor.e2e.json'))
    onChange!(path.join(data(), 'notes.json'))
    onChange!(path.join(store.spaceDir('s1'), 'space.json'))
    expect(sent).toEqual([
      { type: 'custom', event: 'decor:changed', data: { space: 's1', plan: 'loft', file: null } },
      { type: 'custom', event: 'layouts:changed', data: { space: 's1', plan: 'loft' } },
      { type: 'custom', event: 'decor:changed', data: { space: 's1', plan: 'loft', file: 'e2e' } },
      { type: 'custom', event: 'layouts:changed', data: { space: 's1', plan: 'loft' } },
    ])
  })
})

describe('slugify', () => {
  it('lowercases, strips accents, joins words with dashes, never empty', () => {
    expect(slugify('Sofá by the Window!')).toBe('sofa-by-the-window')
    expect(slugify('!!!')).toBe('layout')
  })
})
