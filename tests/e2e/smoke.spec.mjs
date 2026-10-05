// E2E smoke test: loads the app against an isolated decor file, drives the toolbar
// and the decor panel like a person would, and checks what gets saved.
//
//   BASE_URL=http://localhost:5184 CHROME_PATH=... node tests/e2e/smoke.mjs
//
// Writes only the scratch layout e2e-smoke (git-ignored) through the dev API, and
// screenshots to test-results/e2e/ (git-ignored).
import { appUrl, planApi } from './space.mjs'
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { api, BASE_URL, eventually, hover, idle, shot, waitForScene, watchErrors } from './lib.mjs'

test('e2e smoke', async ({ page }) => {
  const DECOR = 'e2e-smoke'
  const url = (params = '') => `${appUrl(BASE_URL)}&decor=${DECOR}&dims=0${params ? `&${params}` : ''}`

  console.log(`e2e smoke against ${BASE_URL}`)

  await api.resetDecor(DECOR)
  // Layouts a previous run saved from this file.
  const LAYOUT_B = 'e2e-layout-b'
  const dropLayout = (slug) => fetch(`${planApi(BASE_URL)}/layouts?file=${slug}`, { method: 'DELETE' })
  await dropLayout(LAYOUT_B)

  const errors = watchErrors(page)
  const panel = page.getByRole('complementary', { name: /decor/i })

  /** Items saved to the isolated file that have actually been dropped in the room. */
  const placed = async () => (await api.readDecor(DECOR)).items.filter((i) => i.at[1] > -50)

  /**
   * Hovers and clicks candidate points until an item of `kind` shows up in the saved file.
   * Pixel positions depend on the camera, so a few nearby candidates keep this resilient.
   */
  async function placeAtFirst(kind, candidates, before) {
    for (const [x, y] of candidates) {
      await hover(page, x, y)
      await page.mouse.click(x + 2, y)
      const found = await eventually(
        async () => {
          const items = await placed()
          return items.find((i) => i.kind === kind && !before.some((b) => b.id === i.id))
        },
        { timeout: 2500, message: `${kind} saved` },
      ).catch(() => null)
      if (found) return found
    }
    throw new Error(`Could not place a ${kind} at any of ${JSON.stringify(candidates)}`)
  }

  async function openTab(name) {
    const tab = panel.getByRole('tab', { name })
    await tab.click()
    await assert.doesNotReject(
      eventually(async () => (await tab.getAttribute('aria-selected')) === 'true', { message: `${name} tab selected` }),
    )
  }

  /** Leaves the inspector (Esc deselects when nothing is being placed). */
  async function deselect() {
    await page.mouse.move(700, 850)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)
  }

  await test.step('loads with a canvas, toolbar and panel, and no page errors', async () => {
    await page.goto(url('view=iso-balcony'))
    await waitForScene(page)
    assert.ok(await page.locator('canvas').first().isVisible(), 'canvas visible')
    assert.equal(await page.getByRole('tab').count(), 5, 'four decor tabs and Room')
    assert.deepEqual((await api.readDecor(DECOR)).items, [], 'isolated decor file starts empty')
    await shot(page, '01-loaded')
    assert.deepEqual(errors, [])
  })

  await test.step('switches dollhouse / x-ray', async () => {
    const xray = page.getByRole('radio', { name: /x-?ray/i })
    const doll = page.getByRole('radio', { name: /dollhouse/i })
    await xray.click()
    assert.equal(await xray.getAttribute('aria-checked'), 'true')
    assert.equal(await doll.getAttribute('aria-checked'), 'false')
    await page.waitForTimeout(600)
    await shot(page, '02-xray')
    await doll.click()
    assert.equal(await doll.getAttribute('aria-checked'), 'true')
  })

  await test.step('visits every camera preset', async () => {
    // Camera presets are a radio group in the toolbar; when the toolbar is narrow
    // (e.g. with the panel open) a select replaces it. Drive whichever is showing.
    const buttons = await page
      .getByRole('radiogroup', { name: /^camera$/i })
      .getByRole('radio')
      .all()
    if (buttons.length) {
      for (const [i, b] of buttons.entries()) {
        await b.click()
        await page.waitForTimeout(700)
        await shot(page, `03-preset-${i}`)
      }
    } else {
      const select = page.getByRole('combobox', { name: /camera/i })
      const values = await select.locator('option').evaluateAll((os) => os.map((o) => o.value))
      assert.ok(values.length >= 3, `expected camera presets, found ${values.length}`)
      for (const [i, v] of values.entries()) {
        await select.selectOption(v)
        await page.waitForTimeout(700)
        await shot(page, `03-preset-${i}`)
      }
    }
    assert.deepEqual(errors, [])
  })

  await test.step('F flips the iso view to the other long side, and it sticks for the session', async () => {
    await page.goto(url('view=iso-balcony'))
    await waitForScene(page)
    const z = async () => (await page.evaluate(() => window.__edit.camera()))[2]
    assert.ok((await z()) < 0, 'starts on the bathroom side')
    await page.keyboard.press('f')
    await page.waitForTimeout(1500) // animated orbit to the other side
    assert.ok((await z()) > 3, `flipped to the kitchen side, z = ${await z()}`)
    await shot(page, '03b-iso-flipped')
    await page.reload()
    await waitForScene(page)
    await page.waitForTimeout(300)
    assert.ok((await z()) > 3, 'still flipped after a reload')
    await page.getByRole('button', { name: /view from the bathroom side/i }).click()
    await page.waitForTimeout(1500)
    assert.ok((await z()) < 0, 'the flip button brings it back')
    assert.deepEqual(errors, [])
  })

  await test.step('switches day / evening and the scene changes', async () => {
    await page.goto(url('view=iso-balcony'))
    await waitForScene(page)
    const day = await page.locator('canvas').first().screenshot()
    // Day / Evening are presets in the time popover, opened from the toolbar clock.
    const clock = page.getByRole('button', { name: /^time and sun/i })
    await clock.click()
    const evening = page.getByRole('radio', { name: /evening/i })
    await evening.click()
    assert.equal(await evening.getAttribute('aria-checked'), 'true')
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('dialog', { name: /time and sun/i }).count(), 0, 'Esc closes the time popover')
    await page.waitForTimeout(900)
    const eve = await page.locator('canvas').first().screenshot()
    assert.ok(!day.equals(eve), 'evening render differs from day')
    await shot(page, '04-evening')
    await clock.click()
    await page.getByRole('radio', { name: /day/i }).click()
    assert.equal(await page.getByRole('radio', { name: /day/i }).getAttribute('aria-checked'), 'true')
    await page.keyboard.press('Escape')
    assert.deepEqual(errors, [])
  })

  await test.step('opens every panel tab', async () => {
    const tabs = await panel.getByRole('tab').all()
    for (const tab of tabs) {
      await tab.click()
      assert.equal(await tab.getAttribute('aria-selected'), 'true')
      // Each library shows a heading and at least one choice.
      assert.ok(await panel.getByRole('heading').first().isVisible())
      assert.ok(
        (await panel.locator('.lib-row, .thumb, .samples [role="radio"]').count()) > 0 ||
          /art/i.test(await tab.innerText()),
        'library has choices',
      )
    }
    await shot(page, '05-tabs')
  })

  await test.step('hangs artwork on the kitchen-side wall', async () => {
    await page.goto(url('view=iso-balcony'))
    await waitForScene(page)
    await openTab(/art/i)
    const thumbs = panel.locator('.thumb, button:has(img)')
    await eventually(async () => (await thumbs.count()) > 0, { timeout: 10000, message: 'artwork library' })
    const before = await placed()
    await thumbs.first().click()
    // Straight onto the floor: the draft has no valid spot yet, so a click there must not hang it.
    await hover(page, 640, 600)
    await page.mouse.click(642, 600)
    await page.waitForTimeout(700)
    assert.equal((await placed()).filter((i) => i.kind === 'artwork').length, 0, 'artwork rejected on the floor')
    const art = await placeAtFirst(
      'artwork',
      [
        [520, 330],
        [560, 300],
        [480, 380],
        [600, 280],
      ],
      before,
    )
    assert.equal(art.facing, 'z-', 'faces into the room from the kitchen-side wall')
    assert.ok(art.at[2] > 2.7 && art.at[2] <= 3.01, `on the wall surface, z=${art.at[2]}`)
    assert.ok(art.at[1] > 0.2 && art.at[1] < 2.6, `at a sensible height, y=${art.at[1]}`)
    assert.equal(art.host, 'side-kitchen')
    // From this space's own library, not shared with other spaces.
    assert.match(art.image, /^\/api\/spaces\/e2e\/artwork\//)
    await shot(page, '06-artwork')
    await deselect()
  })

  await test.step('sets a plant on the main-room floor', async () => {
    await page.goto(url('view=top'))
    await waitForScene(page)
    await openTab(/plant/i)
    const before = await placed()
    await panel.getByRole('button', { name: /monstera/i }).click()
    const p = await placeAtFirst(
      'plant',
      [
        [750, 440],
        [700, 470],
        [820, 420],
      ],
      before,
    )
    assert.equal(p.species, 'monstera')
    assert.ok(Math.abs(p.at[1]) < 0.02, `on the floor, y=${p.at[1]}`)
    assert.ok(p.at[0] > 2.2 && p.at[0] < 6.9 && p.at[2] > 0 && p.at[2] < 3, `in the main room: ${p.at}`)
    await shot(page, '07-plant')
    await deselect()
  })

  await test.step('sets a floor lamp down and hangs a pendant at the ceiling', async () => {
    await openTab(/light/i)
    let before = await placed()
    await panel.getByRole('button', { name: /arc/i }).first().click()
    const arc = await placeAtFirst(
      'lamp',
      [
        [620, 500],
        [600, 520],
        [660, 480],
      ],
      before,
    )
    assert.equal(arc.type, 'arc')
    assert.ok(Math.abs(arc.at[1]) < 0.02, `arc on the floor, y=${arc.at[1]}`)
    assert.equal(arc.on, true)
    await deselect()

    await openTab(/light/i)
    before = await placed()
    await panel
      .getByRole('button', { name: /pendant/i })
      .first()
      .click()
    const pendant = await placeAtFirst(
      'lamp',
      [
        [880, 380],
        [860, 400],
      ],
      before,
    )
    assert.ok(['pendant', 'globe'].includes(pendant.type))
    assert.equal(pendant.at[1], 2.6, 'hangs from the 2.60 main-room ceiling')
    await shot(page, '08-lamps')
    await deselect()
  })

  await test.step('snaps a standing desk flush to the bath-side wall', async () => {
    await openTab(/furniture/i)
    const before = await placed()
    await panel.getByRole('button', { name: /standing desk/i }).click()
    // Near the bath-side (top) edge of the main room in the top view, z ≈ 0.3–0.5 m.
    const desk = await placeAtFirst(
      'furniture',
      [
        [760, 325],
        [740, 335],
        [800, 320],
      ],
      before,
    )
    assert.equal(desk.type, 'standingDesk')
    assert.equal(desk.rotation, 0, 'faces into the room')
    assert.equal(
      desk.at[2],
      Number((desk.size[2] / 2).toFixed(2)),
      `backed onto the wall at z = depth / 2, got ${desk.at[2]}`,
    )
    await shot(page, '09-desk')
    await deselect()
  })

  await test.step('Esc cancels a placement without saving it', async () => {
    const n = (await placed()).length
    await openTab(/plant/i)
    await panel.getByRole('button', { name: /fern/i }).click()
    await hover(page, 700, 450)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(700)
    const after = await placed()
    assert.equal(after.length, n)
    assert.ok(!after.some((i) => i.kind === 'plant' && i.species === 'fern'))
  })

  await test.step('the saved file has one of each kind and survives a reload', async () => {
    const items = await placed()
    const kinds = new Set(items.map((i) => i.kind))
    assert.deepEqual([...kinds].sort(), ['artwork', 'furniture', 'lamp', 'plant'])
    await page.goto(url('view=iso-balcony'))
    await waitForScene(page)
    // The "In the room" list (all kinds, grouped) shows the saved lamps after reload.
    const toggle = panel.locator('#room-toggle')
    if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click()
    const listed = await panel.getByRole('group', { name: /light/i }).locator('li').count()
    assert.equal(listed, items.filter((i) => i.kind === 'lamp').length)
    await page.getByRole('button', { name: /^time and sun/i }).click()
    await page.getByRole('radio', { name: /evening/i }).click()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(900)
    await shot(page, '10-final-evening')
    assert.deepEqual(errors, [])
  })

  await test.step('changes the main-room floor in the Room tab and saves it with the layout', async () => {
    await page.goto(url('view=iso-balcony'))
    await waitForScene(page)
    await idle(page)
    const calls = await page.evaluate(() => window.__stats?.calls)
    await openTab(/^room/i)
    const floors = panel.getByRole('radiogroup', { name: /main room floor/i })
    await floors.getByRole('radio', { name: /walnut/i }).click()
    assert.equal(await floors.getByRole('radio', { name: /walnut/i }).getAttribute('aria-checked'), 'true')
    const saved = await eventually(
      async () => {
        const f = (await api.readDecor(DECOR)).finishes
        return f?.floors?.main === 'walnut' && f
      },
      { message: 'walnut floor saved' },
    )
    assert.equal(saved.floors.hall, 'oakLight', 'the hall keeps its floor')
    await idle(page)
    // Swapped in place: same meshes, same draw calls.
    assert.equal(await page.evaluate(() => window.__stats?.calls), calls, 'draw calls unchanged')
    await shot(page, '11-walnut')
    assert.deepEqual(errors, [])
  })

  await test.step('saves a second layout, flips A/B and keeps finishes per layout', async () => {
    await page.getByRole('button', { name: /^layout/i }).click()
    const menu = page.getByRole('dialog', { name: /layouts/i })
    await menu.getByLabel(/save a copy as/i).fill('E2E layout B')
    await menu.getByRole('button', { name: /save as new/i }).click()
    await eventually(async () => new URL(page.url()).searchParams.get('decor') === LAYOUT_B, {
      message: 'URL follows the new layout',
    })
    assert.equal(await page.getByTestId('layout-current').innerText(), 'E2E layout B')
    const b = await eventually(() => api.readDecor(LAYOUT_B), { message: 'layout B written' })
    assert.equal(b.name, 'E2E layout B')
    assert.equal(b.finishes.floors.main, 'walnut', 'the copy starts with the same finishes')
    assert.equal(b.items.length, (await placed()).length, 'and the same items')

    // Change B only.
    await openTab(/^room/i)
    await panel
      .getByRole('radiogroup', { name: /main room floor/i })
      .getByRole('radio', { name: /concrete/i })
      .click()
    await eventually(async () => (await api.readDecor(LAYOUT_B)).finishes?.floors?.main === 'concrete', {
      message: 'concrete saved to B',
    })
    await shot(page, '12-layout-b-concrete')

    // A/B flips back to the first layout without a reload.
    await page.evaluate(() => (window.__noReload = true))
    await page.getByRole('button', { name: /compare/i }).click()
    await eventually(async () => new URL(page.url()).searchParams.get('decor') === DECOR, { message: 'back on A' })
    assert.equal(await page.evaluate(() => window.__noReload), true, 'no page reload')
    await eventually(
      async () =>
        (await panel
          .getByRole('radiogroup', { name: /main room floor/i })
          .getByRole('radio', { name: /walnut/i })
          .getAttribute('aria-checked')) === 'true',
      { message: 'A shows walnut' },
    )
    assert.equal((await api.readDecor(DECOR)).finishes.floors.main, 'walnut', 'A untouched')
    // And the B key flips again.
    await page.mouse.move(700, 850)
    await page.keyboard.press('b')
    await eventually(async () => new URL(page.url()).searchParams.get('decor') === LAYOUT_B, {
      message: 'B key flips to B',
    })
    await page.keyboard.press('b')
    await eventually(async () => new URL(page.url()).searchParams.get('decor') === DECOR, {
      message: 'B key flips back',
    })
    assert.deepEqual(errors, [])
  })

  await test.step('renames and deletes a layout from the menu', async () => {
    await page.getByRole('button', { name: /^layout/i }).click()
    const menu = page.getByRole('dialog', { name: /layouts/i })
    // Test layouts are hidden from the list; the open one always shows.
    await menu.getByRole('button', { name: `Rename ${DECOR}` }).click()
    const input = menu.getByRole('textbox', { name: /new name/i })
    await input.fill('E2E smoke renamed')
    await input.press('Enter')
    await eventually(async () => new URL(page.url()).searchParams.get('decor') === 'e2e-smoke-renamed', {
      message: 'renamed slug in URL',
    })
    const renamed = await api.readDecor('e2e-smoke-renamed')
    assert.equal(renamed.name, 'E2E smoke renamed')
    assert.equal(renamed.finishes.floors.main, 'walnut')
    // Put it back under its test name, then delete layout B through the API the menu uses.
    const back = await fetch(`${planApi(BASE_URL)}/layouts?file=e2e-smoke-renamed`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'e2e smoke' }),
    })
    assert.equal((await back.json()).slug, DECOR)
    assert.equal((await dropLayout(LAYOUT_B)).status, 200)
    const all = await (await fetch(`${planApi(BASE_URL)}/layouts?all=1`)).json()
    assert.ok(!all.some((l) => l.slug === LAYOUT_B), 'B deleted')
    assert.ok(
      !(await (await fetch(`${planApi(BASE_URL)}/layouts`)).json()).some((l) => /^e2e/.test(l.slug ?? '')),
      'test layouts hidden from the list',
    )
    await page.keyboard.press('Escape')
    assert.deepEqual(errors, [])
  })
})
