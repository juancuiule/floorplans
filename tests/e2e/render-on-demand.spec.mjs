// On-demand rendering (docs/adr/0006): nothing renders while idle, and every
// animation still gets its frames: the x-ray fade, preset camera moves, a desk
// changing height when its file is edited, an orbit drag. Also that a click
// reaches merged meshes.
import { expect, test } from '@playwright/test'
import { SHOTS, BASE_URL } from './lib.mjs'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { appUrl, layoutFile } from './space.mjs'

test('renders on demand, and animations still get their frames', async ({ page }) => {
  const base = BASE_URL
  const outDir = join(SHOTS, 'render-on-demand')
  mkdirSync(outDir, { recursive: true })
  // A desk and a wardrobe in the main room of the monoambiente example, in a scratch layout.
  const DECOR = 'test-render'
  const file = layoutFile(DECOR)
  const original = readFileSync('tests/e2e/fixtures/desk-and-wardrobe.json', 'utf8')
  writeFileSync(file, original)

  const frames = () => page.evaluate(() => window.__frames)
  const shot = (n) => page.screenshot({ path: join(outDir, `${n}.png`) })

  await page.goto(`${appUrl(base)}&view=iso-balcony&decor=${DECOR}&dims=0`)
  await page.waitForFunction(() => (window.__frames ?? 0) > 40, null, { timeout: 60000 })
  await page.waitForTimeout(1500)
  let f = await frames()
  await page.waitForTimeout(1000)
  expect((await frames()) - f, 'idle frames in 1 s').toBe(0)

  f = await frames()
  await page.getByRole('radio', { name: 'X-ray' }).click()
  await page.waitForTimeout(150)
  await shot('xray-mid')
  await page.waitForTimeout(1200)
  expect((await frames()) - f, 'frames during the x-ray fade').toBeGreaterThan(10)
  await shot('xray-end')
  await page.getByRole('radio', { name: 'Dollhouse' }).click()
  await page.waitForTimeout(1200)

  f = await frames()
  // Camera presets by their documented keys (1 iso · balcony … 5 from the entry).
  await page.locator('canvas').press('2')
  await page.waitForTimeout(250)
  await shot('preset-mid')
  await page.waitForTimeout(2000)
  expect((await frames()) - f, 'frames during a preset move').toBeGreaterThan(10)
  await shot('preset-iso-entry')

  f = await frames()
  await page.locator('canvas').press('5')
  await page.waitForTimeout(2500)
  expect((await frames()) - f, 'frames moving to the entry view').toBeGreaterThan(10)
  await shot('preset-from-entry')
  await page.locator('canvas').press('1')
  await page.waitForTimeout(2500)

  // Raise the desk by editing the layout on disk (the dev server pushes the change).
  const data = JSON.parse(original)
  data.items.find((i) => i.type === 'standingDesk').size[1] = 1.15
  f = await frames()
  writeFileSync(file, JSON.stringify(data, null, 2))
  await page.waitForTimeout(700)
  await shot('desk-mid')
  await page.waitForTimeout(2500)
  expect((await frames()) - f, 'frames while the desk changes height').toBeGreaterThan(10)
  await shot('desk-up')
  writeFileSync(file, original)
  await page.waitForTimeout(2500)
  await shot('desk-down')

  // Click the wardrobe: pointer events must reach the merged meshes and select it.
  f = await frames()
  await page.mouse.click(740, 520)
  await page.waitForTimeout(500)
  const selected = await page.evaluate(() => {
    let found = false
    window.__scene?.traverse((o) => (found ||= o.type === 'Box3Helper' && o.visible))
    return found
  })
  expect(selected, 'a click on the wardrobe selects it').toBe(true)
  await shot('selected')
  await page.keyboard.press('Escape')
  await page.mouse.click(1000, 850)
  await page.waitForTimeout(300)

  // Orbit drag with the mouse.
  f = await frames()
  await page.mouse.move(120, 700) // empty background, not a piece of furniture
  await page.mouse.down()
  await page.mouse.move(40, 690, { steps: 20 })
  await page.mouse.up()
  await page.waitForTimeout(1500)
  expect((await frames()) - f, 'frames during an orbit drag').toBeGreaterThan(10)
  await shot('orbit')
})
