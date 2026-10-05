// Every documented keyboard shortcut does what the shortcuts popover says.
// BASE_URL=http://localhost:5173 CHROME_PATH=... node tests/e2e/shortcuts.mjs
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { copyFileSync } from 'node:fs'
import { BASE_URL, watchErrors } from './lib.mjs'
import { appUrl, layoutFile } from './space.mjs'

test('shortcuts', async ({ page }) => {
  const FILE = 'test-shortcuts'
  copyFileSync('tests/e2e/fixtures/shortcuts.json', layoutFile(FILE))

  const errors = watchErrors(page)
  await page.goto(`${appUrl(BASE_URL)}&decor=${FILE}&view=top&dims=0`)
  await page.waitForFunction(() => window.__decor?.getState().loaded)
  await page.waitForTimeout(1200)

  const decor = (fn, arg) => page.evaluate(fn, arg)
  const state = () =>
    decor(() => {
      const s = window.__decor.getState()
      return { n: s.items.length, sel: s.selectedIds, canUndo: s.canUndo }
    })
  const item = (id) => decor((id) => window.__decor.getState().items.find((i) => i.id === id), id)
  const view = () => decor(() => window.__view?.getState() ?? null)
  const select = (ids) => decor((ids) => window.__decor.getState().selectMany(ids, ids[ids.length - 1]), ids)
  const key = async (k) => {
    await page.keyboard.press(k)
    await page.waitForTimeout(250)
  }
  // Focus the scene, as after a click in the room.
  const focusScene = () =>
    page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined))

  await test.step('undo and redo after a nudge, from the scene', async () => {
    await select(['desk'])
    await focusScene()
    const x0 = (await item('desk')).at[0]
    await key('ArrowRight')
    assert.notEqual((await item('desk')).at[0], x0)
    await key('ControlOrMeta+z')
    assert.equal((await item('desk')).at[0], x0, 'Cmd+Z undoes')
    await key('ControlOrMeta+Shift+z')
    assert.notEqual((await item('desk')).at[0], x0, 'Shift+Cmd+Z redoes')
    await key('ControlOrMeta+z')
  })

  await test.step('undo right after typing in a number field of the inspector', async () => {
    await select(['desk'])
    const w0 = (await item('desk')).size[0]
    const width = page.getByRole('textbox', { name: /width/i }).first()
    await width.fill('160')
    await width.press('Enter')
    await page.waitForTimeout(300)
    assert.equal((await item('desk')).size[0], 1.6)
    await width.focus()
    await key('ControlOrMeta+z')
    assert.equal((await item('desk')).size[0], w0, 'undone while the field had focus')
  })

  await test.step('R and Shift+R rotate, arrows nudge, Delete deletes (and undo brings it back)', async () => {
    await select(['plant'])
    await focusScene()
    const r0 = (await item('plant')).rotation
    await key('r')
    assert.notEqual((await item('plant')).rotation, r0)
    await key('Shift+R')
    assert.equal((await item('plant')).rotation, r0)
    const n0 = (await state()).n
    await key('Delete')
    assert.equal((await state()).n, n0 - 1)
    await key('ControlOrMeta+z')
    assert.equal((await state()).n, n0)
  })

  await test.step('Cmd+D duplicates, Cmd+C / Cmd+V copy and paste', async () => {
    const n0 = (await state()).n
    await select(['plant'])
    await focusScene()
    await key('ControlOrMeta+d')
    await page.mouse.click(700, 460)
    await page.waitForTimeout(300)
    assert.equal((await state()).n, n0 + 1)
    await key('ControlOrMeta+z')
    await select(['plant'])
    await key('ControlOrMeta+c')
    await key('ControlOrMeta+v')
    await page.mouse.click(720, 480)
    await page.waitForTimeout(300)
    assert.equal((await state()).n, n0 + 1)
    await key('ControlOrMeta+z')
    assert.equal((await state()).n, n0)
  })

  await test.step('Cmd+A selects the kind, Cmd+G groups, Shift+Cmd+G ungroups, Esc deselects', async () => {
    await select(['plant'])
    await focusScene()
    await key('ControlOrMeta+a')
    assert.ok((await state()).sel.length >= 2, 'selects all plants')
    await key('ControlOrMeta+g')
    assert.ok((await item('plant')).groupId, 'grouped')
    await key('ControlOrMeta+Shift+g')
    assert.equal((await item('plant')).groupId, undefined, 'ungrouped')
    await key('Escape')
    assert.equal((await state()).sel.length, 0)
  })

  await test.step('Alt+A aligns a selection', async () => {
    await select(['plant', 'plant-2'])
    await focusScene()
    await key('Alt+a')
    const [a, b] = [await item('plant'), await item('plant-2')]
    assert.ok(Math.abs(a.at[0] - b.at[0]) < 0.005 || Math.abs(a.at[2] - b.at[2]) < 0.005, 'lined up on one axis')
    await key('ControlOrMeta+z')
  })

  await test.step('view keys: 1–5, X, M, L, F, comma and period, backslash, question mark, slash', async () => {
    await key('Escape')
    await focusScene()
    await key('2')
    assert.equal((await view()).preset, 'iso-entry')
    await key('1')
    await key('x')
    assert.equal((await view()).mode, 'xray')
    await key('x')
    const dims = (await view()).showDims
    await key('m')
    assert.equal((await view()).showDims, !dims)
    const light = (await view()).lighting
    await key('l')
    assert.notEqual((await view()).lighting, light)
    await key('l')
    const m0 = (await view()).sun.minutes
    await key('.')
    assert.equal((await view()).sun.minutes, Math.floor(m0 / 15) * 15 + 15)
    await key(',')
    await key('f')
    assert.equal((await view()).isoFlip['iso-balcony'], true)
    await key('f')
    await key('\\')
    assert.equal(await page.locator('#decor-panel').isVisible(), false)
    await key('\\')
    await key('?')
    assert.ok(await page.getByRole('dialog', { name: /shortcuts/i }).isVisible())
    await key('Escape')
    await key('/')
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'decor-search')
    await page.locator('#decor-search').press('Escape')
  })

  await test.step('W walks, T measures, Esc leaves', async () => {
    await focusScene()
    await key('w')
    assert.equal((await view()).walking, true)
    await key('Escape')
    await page.waitForTimeout(800)
    assert.equal((await view()).walking, false)
    await key('t')
    assert.equal((await view()).tool, 'measure')
    await key('Escape')
    assert.equal((await view()).tool, null)
  })

  assert.deepEqual(errors, [])
})
