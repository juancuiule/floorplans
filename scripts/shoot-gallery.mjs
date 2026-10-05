// Screenshots of the gallery-wall tools: a selection with the align tools in the
// edit bar, a finished gallery wall over a sofa, and smart guides on the floor.
// Uses the scratch layout test-gallery (git-ignored), never your real layout.
// Usage: node scripts/shoot-gallery.mjs <outDir> [baseUrl]
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { appUrl, layoutFile } from '../tests/e2e/space.mjs'

const [outDir = 'test-results/gallery', base = 'http://localhost:5173'] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })
writeFileSync(layoutFile('test-gallery'), JSON.stringify({ version: 1, items: [] }, null, 2) + '\n')

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))

await page.goto(`${appUrl(base)}&cam=5.9,1.75,0.25,4.45,1.2,3&decor=test-gallery&dims=0`)
await page.waitForFunction(() => (window.__frames ?? 0) > 30 && window.__edit, null, { timeout: 60000 })
await page.waitForTimeout(800)

// A sofa against the kitchen-side wall, six prints hung anyhow above it, a chair in the room.
await page.evaluate(async () => {
  const { FURNITURE } = await import('/src/decor/furnitureCatalog.ts')
  const furniture = (id, type, at, rotation, size) => ({
    kind: 'furniture',
    id,
    type,
    at,
    rotation,
    size: size ?? [...FURNITURE[type].size],
    finish: { ...FURNITURE[type].finish },
    options: { ...FURNITURE[type].options },
  })
  const art = (id, image, x, y, w, h, style = 'thin', color = '#1f1e1c', mat = 0) => ({
    kind: 'artwork',
    id,
    image: `/artwork/${encodeURIComponent(image)}`,
    at: [x, y, 3],
    facing: 'z-',
    host: 'side-kitchen',
    size: { preset: 'custom', w, h },
    fit: 'cover',
    frame: { style, color, mat },
  })
  const items = [
    furniture('sofa', 'sofa', [4.45, 0, 2.556], 180, [2.1, 0.7, 0.88]),
    furniture('chair', 'chair', [4.9, 0, 1.75], 0),
    art('a1', 'image 54.png', 5.2, 1.3, 0.297, 0.42, 'classic', '#f3f1ec', 0.05),
    art('a2', 'image 57.png', 4.8, 1.75, 0.3, 0.3),
    art('a3', 'image 60.png', 4.3, 1.45, 0.3, 0.4, 'thin', '#c69f6d'),
    art('a4', 'image 63.png', 3.7, 1.9, 0.42, 0.297, 'thin'),
    art('a5', 'image 65.png', 3.95, 1.2, 0.297, 0.42, 'classic', '#f3f1ec', 0.05),
    art('a6', 'image 69.png', 4.55, 2.05, 0.3, 0.3, 'thin', '#c69f6d'),
  ]
  window.__edit.decor.setState({ items })
})
await page.waitForTimeout(1500)

// 1. Everything on the wall selected: the edit bar's align tools.
await page.evaluate(async () => {
  const s = window.__edit.decor.getState()
  s.select('a3')
  s.selectAllLike()
})
await page.waitForTimeout(700)
await page.screenshot({ path: join(outDir, 'gallery-1-selected.png') })
const bar = page.locator('.editbar')
await bar.screenshot({ path: join(outDir, 'gallery-1-editbar.png') })

// 2. Hang as a grid, 5 cm apart, centered at 145 cm over the sofa; group it.
await page.evaluate(async () => {
  const sel = await import('/src/decor/selection.ts')
  sel.hangSelection({ layout: 'grid', gap: 0.05, centerV: 1.45 })
  window.__edit.decor.getState().group()
})
await page.waitForTimeout(500)
await page.screenshot({ path: join(outDir, 'gallery-2-grouped.png') })
await page.evaluate(() => window.__edit.decor.getState().select(null))
await page.waitForTimeout(900)
await page.screenshot({ path: join(outDir, 'gallery-3-finished.png') })

// 3. Floor guides, from above: drag the chair toward the sofa's end until their sides line up.
await page.waitForTimeout(600) // let the layout save
await page.goto(`${appUrl(base)}&cam=4.9,4.2,0.9,4.9,0,2.1&decor=test-gallery&dims=0`)
await page.waitForFunction(() => (window.__frames ?? 0) > 30 && window.__edit, null, { timeout: 60000 })
await page.waitForTimeout(1200)
const screen = (p) => page.evaluate((p) => window.__edit.toScreen(p), p)
const from = await screen([4.9, 0.45, 1.75])
const to = await screen([5.6, 0.45, 1.75])
await page.mouse.move(from[0], from[1])
await page.mouse.down()
// Creep toward (and past) the aim until the guide catches the chair.
const steps = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 2)
for (let i = 1; i <= steps; i++) {
  await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps)
  await page.waitForTimeout(12)
  if (i > 10 && (await page.evaluate(() => window.__edit.edit.getState().guides))) break
}
await page.waitForTimeout(300)
const g = await page.evaluate(() => window.__edit.edit.getState().guides)
console.log('floor guides:', g ? `${g.align.length / 2} align lines` : 'none')
await page.screenshot({ path: join(outDir, 'gallery-4-floor-guides.png') })
await page.keyboard.press('Escape')
await page.mouse.up()

await browser.close()
console.log('saved to', outDir)
