// E2E: the panel against a layout file edited by hand, and on a phone.
//
//   BASE_URL=http://localhost:5184 CHROME_PATH=... node tests/e2e/panel.mjs
//
// Writes only the scratch layout e2e-panel (git-ignored), directly and through the dev API.
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { api, BASE_URL, eventually, shot, waitForScene, watchErrors } from './lib.mjs'
import { appUrl, layoutFile } from './space.mjs'

test('panel', async ({ page, browser }) => {
  const DECOR = 'e2e-panel'
  const FILE = layoutFile(DECOR)
  const url = `${appUrl(BASE_URL)}&decor=${DECOR}&dims=0&view=iso-balcony`
  const desk = {
    kind: 'furniture',
    id: 'desk-1',
    type: 'standingDesk',
    at: [4, 0, 0.35],
    rotation: 0,
    size: [1.4, 0.72, 0.7],
    finish: { body: '#c9a57a', metal: '#222222', fabric: '#dddddd' },
    options: {},
  }
  const art = (id, x) => ({
    kind: 'artwork',
    id,
    image: '/api/spaces/e2e/artwork/image%2010.png',
    at: [x, 1.5, 2.99],
    facing: 'z-',
    host: 'side-kitchen',
    size: { preset: 'A4', w: 0.21, h: 0.297 },
    fit: 'cover',
    frame: { style: 'thin', color: '#1f1f1f', mat: 0 },
  })
  const seed = { version: 1, items: [desk, art('a1', 3.5), art('a2', 4), art('a3', 4.5)] }
  const good = JSON.stringify(seed, null, 2) + '\n'

  writeFileSync(FILE, good)
  const errors = watchErrors(page)
  const panel = page.getByRole('complementary', { name: /decor/i })
  // The app's own store (window.__decor, dev only): a script importing store.ts may get another instance after HMR.
  const store = (fn, arg) =>
    page.evaluate(
      ([src, a]) => new Function('m', 'a', `return (${src})(m, a)`)({ useDecor: window.__decor }, a),
      [fn.toString(), arg],
    )

  await page.goto(url)
  await waitForScene(page)

  await test.step('a hand edit that breaks the file pauses saving and is left alone', async () => {
    writeFileSync(FILE, '{ "version": 1, "items": [ ')
    const banner = panel.locator('.banner')
    await eventually(async () => /paused/i.test((await banner.textContent().catch(() => '')) ?? ''), {
      message: 'paused notice',
    })
    await shot(page, 'panel-01-broken-file')
    // Nothing is written over the file while it is broken.
    await store(({ useDecor }) => useDecor.getState().nudge('desk-1', [0.1, 0, 0]))
    await page.waitForTimeout(800)
    assert.throws(() => JSON.parse(readFileSync(FILE, 'utf8')), 'the broken file is left alone')
  })

  await test.step('fixing the file (back to what the tab last read) clears the notice and saves again', async () => {
    writeFileSync(FILE, good)
    await eventually(async () => (await panel.locator('.banner').count()) === 0, { message: 'notice cleared' })
    await store(({ useDecor }) => useDecor.getState().nudge('desk-1', [0.1, 0, 0]))
    await eventually(async () => (await api.readDecor(DECOR)).items[0].at[0] === 4.1, { message: 'edit saved' })
  })

  await test.step('on a phone the edit bar sits above the panel, not over the layout menu', async () => {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
    p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    await p.goto(url)
    await waitForScene(p)
    const check = async (label) => {
      const bar = await p.locator('.editbar').boundingBox()
      const pnl = await p.locator('#decor-panel').boundingBox()
      assert.ok(bar && pnl, `${label}: edit bar and panel shown`)
      assert.ok(
        bar.y + bar.height <= pnl.y,
        `${label}: edit bar ends at ${Math.round(bar.y + bar.height)}, panel starts at ${Math.round(pnl.y)}`,
      )
      assert.ok(
        bar.x >= 0 && bar.x + bar.width <= 390,
        `${label}: edit bar within the screen (${Math.round(bar.x)}–${Math.round(bar.x + bar.width)})`,
      )
      // Every tool is inside the bar, none cut off at its edge.
      const cut = await p.locator('.editbar button').evaluateAll((els) => {
        const box = els[0].closest('.editbar').getBoundingClientRect()
        return els.filter((b) => {
          const r = b.getBoundingClientRect()
          return r.left < box.left - 0.5 || r.right > box.right + 0.5
        }).length
      })
      assert.equal(cut, 0, `${label}: ${cut} tool(s) cut off`)
    }
    await p.evaluate(() => window.__decor.getState().select('desk-1'))
    await p.waitForTimeout(300)
    await check('one piece')
    await p.evaluate(() => window.__decor.getState().selectMany(['a1', 'a2', 'a3']))
    await p.waitForTimeout(300)
    await check('three pieces')
    await p.screenshot({ path: 'test-results/e2e/panel-02-phone-selection.png' })
    await p.close()
  })

  writeFileSync(FILE, good)
  assert.deepEqual(errors, [], 'no page errors')
})
