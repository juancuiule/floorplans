// Walk mode, the measure tool and the clearance overlay, driven through the UI.
// Needs a running dev server: BASE_URL=http://localhost:5194 node tests/e2e/walk-measure.mjs
import { appUrl, planApi } from './space.mjs'
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { BASE_URL, eventually, shot, waitForScene, watchErrors } from './lib.mjs'

test('walk + measure', async ({ page }) => {
  const DECOR = 'e2e-walk'
  const url = (params = '') => `${appUrl(BASE_URL)}&decor=${DECOR}&dims=0${params ? `&${params}` : ''}`

  // A desk and a wardrobe in the main room (or your own layout with SEED=<path to a layout file>, for screenshots).
  const seed = JSON.parse(
    readFileSync(
      process.env.SEED && existsSync(process.env.SEED) ? process.env.SEED : 'tests/e2e/fixtures/desk-and-wardrobe.json',
      'utf8',
    ),
  )
  const put = await fetch(`${planApi(BASE_URL)}/decor?file=${DECOR}`, {
    method: 'PUT',
    body: JSON.stringify(seed),
    headers: { 'Content-Type': 'application/json' },
  })
  assert.equal(put.status, 200, 'seed decor')

  const errors = watchErrors(page)

  const pose = () => page.evaluate(() => window.__walk?.() ?? null)
  const frames = () => page.evaluate(() => window.__frames ?? 0)
  /** Whether a plan point is free floor inside the flat (the app's own collision code, loaded through Vite). */
  const freeSpot = (x, z) =>
    page.evaluate(
      async ([x, z]) => {
        const w = await import('/src/plan/walk.ts')
        const { useDecor } = await import('/src/decor/store.ts')
        const r = w.resolve([x, z], w.walkObstacles(useDecor.getState().items))
        return w.insideFlat(x, z) && Math.hypot(r[0] - x, r[1] - z) < 0.002
      },
      [x, z],
    )
  async function hold(key, ms) {
    await page.keyboard.down(key)
    await page.waitForTimeout(ms)
    await page.keyboard.up(key)
    await page.waitForTimeout(500) // decelerate and settle
  }

  await page.goto(url('view=iso-balcony'))
  await waitForScene(page)

  await test.step('the toolbar fits on one row at 1440 px with the panel open, day and evening', async () => {
    const height = () => page.evaluate(() => document.querySelector('.toolbar .tb-main').getBoundingClientRect().height)
    assert.ok((await height()) < 48, `day: ${await height()} px`)
    await page.keyboard.press('l')
    await page.waitForTimeout(200)
    assert.ok((await height()) < 48, `evening: ${await height()} px`)
    await page.keyboard.press('l')
  })

  await test.step('W enters walk mode at the entry, at eye height', async () => {
    const before = await page.evaluate(() => window.__edit.camera())
    await page.keyboard.press('w')
    await eventually(pose, { message: 'walk pose' })
    await page.waitForTimeout(900) // the camera glides down to eye level
    const p = await pose()
    assert.ok(Math.abs(p.x - 0.55) < 0.05 && Math.abs(p.z - 1.9) < 0.05, `starts at the entry, got ${p.x}, ${p.z}`)
    assert.equal(p.eye, 1.6)
    const cam = await page.evaluate(() => window.__edit.camera())
    assert.ok(Math.abs(cam[1] - 1.6) < 0.02, `camera at eye height, got ${cam[1]}`)
    assert.notDeepEqual(cam, before)
    assert.ok(await page.locator('.walk-hud').isVisible(), 'HUD shows')
    await shot(page, 'walk-01-entry')
  })

  await test.step('holding W for a second walks forward and stays in free space', async () => {
    const a = await pose()
    await hold('w', 1000)
    const b = await pose()
    const moved = Math.hypot(b.x - a.x, b.z - a.z)
    assert.ok(moved > 0.6 && moved < 2.2, `walked ${moved.toFixed(2)} m`)
    assert.ok(b.x > a.x, 'forward is down the flat (+x)')
    assert.ok(await freeSpot(b.x, b.z), `inside the flat and clear of walls at ${b.x.toFixed(2)}, ${b.z.toFixed(2)}`)
  })

  await test.step('idle renders no frames', async () => {
    await page.waitForTimeout(400)
    const f0 = await frames()
    await page.waitForTimeout(700)
    assert.equal(await frames(), f0, 'no frames while standing still')
  })

  await test.step('arrows walk instead of nudging the selection', async () => {
    const deskAt = () => page.evaluate(() => window.__edit.decor.getState().items.find((i) => i.id === 'f-desk')?.at)
    await page.evaluate(() => window.__edit.decor.getState().select('f-desk'))
    const before = await deskAt()
    const a = await pose()
    await hold('ArrowUp', 500)
    const b = await pose()
    assert.deepEqual(await deskAt(), before, 'the desk stayed put')
    assert.ok(Math.hypot(b.x - a.x, b.z - a.z) > 0.2, 'the arrow walked')
    await page.evaluate(() => window.__edit.decor.getState().select(null))
  })

  await test.step('walls stop the walker', async () => {
    // Strafe left (toward the bathroom side, −z) for longer than it takes to hit something.
    await hold('a', 2500)
    const p = await pose()
    assert.ok(p.z > 0.19, `did not pass through the bathroom-side walls (z ${p.z.toFixed(2)})`)
    assert.ok(await freeSpot(p.x, p.z), `stopped in free space at ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`)
  })

  await test.step('walks out to the balcony through the sliding door, not past the railing', async () => {
    await page.evaluate(() => window.__walkTo(3.2, 1.5, 0))
    await shot(page, 'walk-02-main-room')
    await page.keyboard.down('Shift')
    await hold('w', 3500)
    await page.keyboard.up('Shift')
    const p = await pose()
    assert.ok(p.x > 7.2, `reached the balcony (x ${p.x.toFixed(2)})`)
    assert.ok(p.x < 8.2, `stopped at the railing (x ${p.x.toFixed(2)})`)
    assert.ok(await freeSpot(p.x, p.z))
    // Turn around and look back into the flat: the facade must still be standing.
    await page.evaluate(() => window.__walkTo(8.0, 1.2, Math.PI))
    await page.waitForTimeout(300)
    await shot(page, 'walk-03-balcony')
  })

  await test.step('seated eye height glides down', async () => {
    await page.getByRole('button', { name: 'Seated', exact: true }).click()
    await page.waitForTimeout(1000)
    assert.ok(Math.abs((await pose()).eye - 1.15) < 0.01)
    await page.getByRole('button', { name: 'Standing', exact: true }).click()
  })

  await test.step('Esc returns to the orbit view', async () => {
    await page.keyboard.press('Escape')
    await eventually(async () => (await pose()) === null, { message: 'walk ended' })
    await page.waitForTimeout(1500)
    const cam = await page.evaluate(() => window.__edit.camera())
    assert.ok(cam[1] > 5, `back up in the iso view (y ${cam[1].toFixed(2)})`)
  })

  await test.step('double-clicking the floor walks from there', async () => {
    const [x, y] = await page.evaluate(() => window.__edit.toScreen([6.0, 0, 1.8]))
    await page.mouse.dblclick(x, y)
    await eventually(pose, { message: 'walk pose' })
    const p = await pose()
    assert.ok(Math.hypot(p.x - 6.0, p.z - 1.8) < 0.15, `starts where clicked, got ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`)
    await page.keyboard.press('Escape')
    await eventually(async () => (await pose()) === null)
    await page.waitForTimeout(1200)
  })

  await test.step('measure: two clicks give a dimension in cm', async () => {
    await page.goto(url('view=top'))
    await waitForScene(page)
    await page.keyboard.press('t')
    await page.locator('.measure-hud').waitFor()
    const a = await page.evaluate(() => window.__edit.toScreen([3.0, 0, 1.5]))
    const b = await page.evaluate(() => window.__edit.toScreen([4.5, 0, 1.5]))
    await page.mouse.move(a[0], a[1])
    await page.mouse.click(a[0], a[1])
    await page.mouse.move(b[0], b[1], { steps: 4 })
    await page.mouse.click(b[0], b[1])
    const label = page.locator('.measure-label:not(.preview) span').first()
    await label.waitFor()
    const cm = Number((await label.textContent()).match(/(\d+)\s*cm/)[1])
    assert.ok(cm > 140 && cm < 160, `measured ${cm} cm`)
    await shot(page, 'measure-01-top')
  })

  await test.step('measure: Delete removes the last one, Esc leaves the tool', async () => {
    await page.keyboard.press('Delete')
    assert.equal(await page.locator('.measure-label:not(.preview)').count(), 0)
    await page.keyboard.press('Escape')
    assert.equal(await page.locator('.measure-hud').count(), 0)
  })

  await test.step('clearances around the selected desk', async () => {
    await page.goto(url('view=iso-entry'))
    await waitForScene(page)
    await page.evaluate(() => window.__edit.decor.getState().select('f-desk'))
    await page.keyboard.press('c')
    const labels = page.locator('.clearance-label span')
    await eventually(async () => (await labels.count()) > 0, { message: 'clearance labels' })
    const values = (await labels.allTextContents()).map((s) => Number(s.match(/\d+/)[0]))
    assert.ok(
      values.every((v) => v > 0 && v < 500),
      `plausible clearances: ${values.join(', ')}`,
    )
    await page.waitForTimeout(300)
    await shot(page, 'clearances-01-desk')
  })

  assert.deepEqual(errors, [], 'no page errors')
})
