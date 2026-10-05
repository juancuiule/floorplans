// "What if without this wall": take the hall–main partition out through the
// Room tab, check the saved layout, walk through where it stood, put it back.
// Needs a running dev server: BASE_URL=http://localhost:5194 node tests/e2e/walls.mjs
import { appUrl, planApi } from './space.mjs'
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { api, BASE_URL, eventually, shot, waitForScene, watchErrors } from './lib.mjs'

test('walls (what if)', async ({ page }) => {
  const DECOR = 'e2e-walls'
  const url = (params = '') => `${appUrl(BASE_URL)}&decor=${DECOR}&dims=0${params ? `&${params}` : ''}`

  // A print on the main-room face of the partition, clear of the stretch that stays behind the shower.
  const seed = {
    version: 1,
    items: [
      {
        kind: 'artwork',
        id: 'artwork-on-partition',
        image: '/api/spaces/e2e/artwork/image%2010.png',
        at: [2.2, 1.5, 2.8],
        facing: 'x+',
        host: 'entry-main',
        size: { preset: 'A4', w: 0.21, h: 0.297 },
        fit: 'cover',
        frame: { style: 'thin', color: '#1d1d1d', mat: 0 },
      },
    ],
  }
  const put = await fetch(`${planApi(BASE_URL)}/decor?file=${DECOR}`, {
    method: 'PUT',
    body: JSON.stringify(seed),
    headers: { 'Content-Type': 'application/json' },
  })
  assert.equal(put.status, 200, 'seed decor')

  const errors = watchErrors(page)
  const panel = page.getByRole('complementary', { name: /decor/i })
  const diagram = panel.locator('svg.plan-diagram')
  const pose = () => page.evaluate(() => window.__walk?.() ?? null)
  const calls = () => page.evaluate(() => window.__stats?.calls ?? 0)

  async function hold(key, ms) {
    await page.keyboard.down(key)
    await page.waitForTimeout(ms)
    await page.keyboard.up(key)
    await page.waitForTimeout(500)
  }

  /** Walk from the niche (beside the passage, z 1.1) straight down the flat for 1.8 s; returns where it ended. */
  async function walkThroughNiche() {
    await page.keyboard.press('w')
    await eventually(pose, { message: 'walk pose' })
    await page.waitForTimeout(900)
    await page.evaluate(() => window.__walkTo(1.6, 1.1, 0, 0))
    await page.waitForTimeout(200)
    await hold('w', 1800)
    const p = await pose()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(900)
    return p
  }

  await page.goto(url('view=iso-entry'))
  await waitForScene(page)

  let baseline = 0
  await test.step('with every wall up, walking from the niche stops at the partition', async () => {
    const p = await walkThroughNiche()
    assert.ok(p.x < 2.05, `stopped by the wall (x ${p.x.toFixed(2)})`)
    assert.ok(Math.abs(p.z - 1.1) < 0.05, `went straight (z ${p.z.toFixed(2)})`)
    await page.waitForTimeout(400)
    baseline = await calls()
  })

  await test.step('the Room tab shows the plan with inner walls clickable and outer walls locked', async () => {
    await panel.getByRole('tab', { name: /^room/i }).click()
    await diagram.waitFor()
    assert.equal(await diagram.locator('[role="switch"]').count(), 4, 'four removable partitions')
    const outer = diagram.locator('.pd-fixed[data-wall="facade"] title')
    assert.match(await outer.textContent(), /structural \/ exterior/i)
    const fixedRow = panel.locator('.wall-row.fixed').first()
    assert.match(await fixedRow.getAttribute('title'), /structural \/ exterior/i)
    assert.ok(await fixedRow.getByRole('switch').isDisabled(), 'structural walls cannot be switched')
    await diagram.scrollIntoViewIfNeeded()
    await shot(page, 'walls-01-plan-diagram')
  })

  await test.step('clicking the hall–main partition on the plan removes it and saves the layout', async () => {
    const wall = diagram.locator('[data-wall="entry-main"]')
    await wall.hover()
    await page.waitForTimeout(150)
    await shot(page, 'walls-02-plan-hover')
    await wall.click()
    assert.equal(await wall.getAttribute('aria-checked'), 'false')
    const row = panel.locator('.wall-row[data-wall="entry-main"]')
    assert.equal(await row.getByRole('switch').getAttribute('aria-checked'), 'false')
    assert.match(await row.locator('.wall-state').textContent(), /removed/i)
    const saved = await eventually(
      async () => {
        const d = await api.readDecor(DECOR)
        return d.finishes?.structure ? d : null
      },
      { message: 'structure saved' },
    )
    assert.deepEqual(saved.finishes.structure, { removedWalls: ['entry-main'], raiseEntryCeiling: false })
    assert.equal(saved.items.length, 1, 'items untouched')
    await page.waitForTimeout(500)
    await shot(page, 'walls-03-entry-main-removed')
  })

  await test.step('the print on the removed wall is marked in the room list', async () => {
    const toggle = panel.locator('#room-toggle')
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
    await eventually(async () => (await panel.locator('.wall-lost-badge[data-lost-wall="entry-main"]').count()) === 1, {
      message: 'wall removed badge',
    })
  })

  await test.step('walking straight from the niche now crosses into the main room', async () => {
    const p = await walkThroughNiche()
    assert.ok(p.x > 2.8, `walked through where the wall stood (x ${p.x.toFixed(2)})`)
    assert.ok(Math.abs(p.z - 1.1) < 0.05, `went straight (z ${p.z.toFixed(2)})`)
  })

  await test.step('putting it back from the list restores the wall, the file and the draw calls', async () => {
    await panel.getByRole('tab', { name: /^room/i }).click()
    await panel.locator('.wall-row[data-wall="entry-main"]').getByRole('switch').click()
    await eventually(async () => !(await api.readDecor(DECOR)).finishes, { message: 'structure dropped from the file' })
    const p = await walkThroughNiche()
    assert.ok(p.x < 2.05, `stopped by the wall again (x ${p.x.toFixed(2)})`)
    await page.waitForTimeout(400)
    assert.equal(await calls(), baseline, 'same draw calls as before')
    assert.equal(await panel.locator('.wall-lost-badge').count(), 0)
  })

  await test.step('undo takes the wall out again and redo puts it back, in the file too', async () => {
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
    const sw = panel.locator('.wall-row[data-wall="entry-main"]').getByRole('switch')
    await page.mouse.move(700, 880)
    await page.keyboard.press(`${mod}+z`)
    await eventually(async () => (await sw.getAttribute('aria-checked')) === 'false', {
      message: 'undo removes the wall again',
    })
    await eventually(async () => (await api.readDecor(DECOR)).finishes?.structure?.removedWalls?.[0] === 'entry-main', {
      message: 'undo saved',
    })
    await page.keyboard.press(`${mod}+Shift+z`)
    await eventually(async () => (await sw.getAttribute('aria-checked')) === 'true', { message: 'redo puts it back' })
    await eventually(async () => !(await api.readDecor(DECOR)).finishes, { message: 'redo saved' })
    await page.waitForTimeout(400)
    assert.equal(await calls(), baseline, 'same draw calls as before')
  })

  assert.deepEqual(errors, [], 'no page errors')
})
