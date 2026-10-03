// Spaces and the floor plan editor (docs/adr/0010): from the home page, make a
// space, draw a plan from nothing, open it in 3D, copy an example, and check that
// another space sees none of it.
import { expect, test } from '@playwright/test'
import { BASE_URL, watchErrors } from './lib.mjs'

/** Drags on the drawing from one plan point to another, in meters. */
async function drawRoom(page, [x0, z0], [x1, z1]) {
  const toScreen = (x, z) =>
    page.evaluate(
      ([x, z]) => {
        const p = new DOMPoint(x, z).matrixTransform(document.querySelector('.fp-canvas svg').getScreenCTM())
        return [p.x, p.y]
      },
      [x, z],
    )
  const [ax, ay] = await toScreen(x0, z0)
  const [bx, by] = await toScreen(x1, z1)
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  await page.mouse.move(bx, by, { steps: 8 })
  await page.mouse.up()
}

async function clickAt(page, x, z) {
  const [sx, sy] = await page.evaluate(
    ([x, z]) => {
      const p = new DOMPoint(x, z).matrixTransform(document.querySelector('.fp-canvas svg').getScreenCTM())
      return [p.x, p.y]
    },
    [x, z],
  )
  await page.mouse.click(sx, sy)
}

/** A tool in the editor's toolbar, by its label. */
const tool = (page, name) =>
  page.getByRole('radiogroup', { name: 'Tool' }).getByRole('radio', { name, exact: true }).click()

test('a new space, a plan drawn from scratch, opened in 3D', async ({ page }) => {
  const errors = watchErrors(page)

  await test.step('the home page makes a space', async () => {
    await page.goto(BASE_URL)
    await page.getByLabel('Name').fill('E2E home')
    await page.getByRole('button', { name: 'Create a space' }).click()
    await page.waitForURL(/\?space=[a-z0-9]+$/)
    await expect(page.locator('#space-title')).toHaveValue('E2E home')
  })
  const space = new URL(page.url()).searchParams.get('space')

  await test.step('scale a reference image from a known length', async () => {
    await page.getByRole('link', { name: /Draw a floor plan/ }).click()
    await page.waitForURL(/edit=floorplan/)
    await page.locator('.fp-panel .text-input').first().fill('Two rooms')
    // A plan drawn at 100 px a meter; its dimension line runs 6 m from pixel 100 to 700, at y 55.
    await page
      .locator('input[aria-label="Reference image file"]')
      .setInputFiles('tests/e2e/fixtures/reference-plan.png')
    await page.locator('.fp-reference').waitFor()
    const s0 = 10 / 900 // shown 10 m wide until scaled
    await clickAt(page, 100 * s0, 55 * s0)
    await clickAt(page, 700 * s0, 55 * s0)
    await page.locator('.fp-calibrate input').fill('6')
    await page.locator('.fp-calibrate input').blur()
    await page.getByRole('button', { name: 'Set scale' }).first().click()
    await expect(page.locator('.fp-panel')).toContainText('1 m on the drawing is 100 px of the image')
  })

  await test.step('draw an L-shaped room corner by corner, a rectangle by dragging, a door and a window', async () => {
    await tool(page, 'Room')
    for (const [x, z] of [
      [0, 0],
      [6, 0],
      [6, 3],
      [3.5, 3],
      [3.5, 5],
      [0, 5],
      [0, 0],
    ])
      await clickAt(page, x, z)
    await expect(page.locator('.fp-panel')).toContainText('25.0 m² · 6 corners')
    await drawRoom(page, [3.55, 3], [6, 5.05]) // snaps onto the L's edges
    await page.locator('.fp-panel').getByRole('radio', { name: 'Bedroom', exact: true }).click()
    await expect(page.locator('.fp-problems')).toContainText('There is no door yet')
    await tool(page, 'Door')
    await clickAt(page, 0, 2.5)
    await tool(page, 'Window')
    await clickAt(page, 3, 0)
    await expect(page.locator('.fp-problems')).toHaveCount(0)
  })

  await test.step('saving opens the plan in 3D', async () => {
    await page.getByRole('button', { name: 'Create and open in 3D' }).click()
    await page.waitForURL(/plan=two-rooms/)
    await page.waitForFunction(() => window.__decor?.getState().loaded && (window.__frames ?? 0) > 3, null, {
      timeout: 60000,
    })
    await expect(page.locator('.toolbar .title h1')).toContainText('Two rooms')
    const plan = await page.evaluate(async () => (await import('/src/project/plan.ts')).plan)
    // Two partitions where the bedroom meets the L; with the notch filled, the outline is a rectangle.
    expect(plan.shell.walls.filter((w) => w.kind === 'interior')).toHaveLength(2)
    expect(plan.shell.walls.filter((w) => w.kind === 'exterior')).toHaveLength(4)
    expect(plan.shell.walls.flatMap((w) => (w.openings ?? []).map((o) => o.kind)).sort()).toEqual(['door', 'window'])
    // The L is two floor pieces in 3D; the reference image stays with the drawing.
    expect(plan.shell.rooms).toHaveLength(3)
    expect(plan.sketch.reference.scale).toBeCloseTo(0.01)
  })

  await test.step('the plan title leads back to the space, where an example can be copied', async () => {
    await page.locator('.toolbar .title').click()
    await page.waitForURL(new RegExp(`\\?space=${space}$`))
    await expect(page.getByRole('link', { name: 'Two rooms' })).toBeVisible()
    await page.getByRole('button', { name: /^Loft/ }).click()
    await page.waitForURL(/plan=loft/)
    await page.waitForFunction(() => window.__decor?.getState().loaded, null, { timeout: 60000 })
    expect(await page.evaluate(() => window.__decor.getState().items.length)).toBeGreaterThan(0)
  })

  await test.step('another space sees none of it', async () => {
    const res = await fetch(`${BASE_URL}/api/spaces`, { method: 'POST', body: JSON.stringify({ name: 'Other' }) })
    const { id } = await res.json()
    const other = await (await fetch(`${BASE_URL}/api/spaces/${id}`)).json()
    expect(other.plans).toEqual([])
    expect((await fetch(`${BASE_URL}/api/spaces/${id}/plans/two-rooms`)).status).toBe(404)
  })

  await test.step('a drawn plan opens in the editor again', async () => {
    await page.goto(`${BASE_URL}/?space=${space}&plan=two-rooms&edit=floorplan`)
    await expect(page.locator('.toolbar .title')).toContainText('Editing the floor plan')
    await expect(page.locator('.fp-room')).toHaveCount(2)
    await expect(page.locator('.fp-reference')).toBeVisible()
  })

  expect(errors).toEqual([])
})
