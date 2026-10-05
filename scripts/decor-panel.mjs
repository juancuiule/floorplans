// Drives the decor panel like a person would and saves screenshots.
// Usage: node scripts/decor-panel.mjs <outDir> [baseUrl]   (uses the scratch layout e2e, never your real layout)
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { appUrl, layoutFile } from '../tests/e2e/space.mjs'

const [outDir = 'test-results/decor-panel', base = 'http://localhost:5173'] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
page.on('console', (m) => m.type() === 'error' && !m.text().includes('unmount') && console.log('[console]', m.text()))

await page.goto(`${appUrl(base)}&view=iso-balcony&decor=e2e`)
await page.waitForFunction(() => (window.__frames ?? 0) > 30)

async function hover(x, y) {
  for (let i = 0; i < 4; i++) await page.mouse.move(x + i, y, { steps: 2 })
  await page.waitForTimeout(150)
}

// 1. Artwork on the kitchen-side wall
await page.getByRole('tab', { name: /^Art/ }).click()
await page.locator('.thumb').nth(2).click()
await hover(520, 330)
await page.screenshot({ path: join(outDir, '1-art-hover.png') })
await page.mouse.click(523, 330)
await page.waitForTimeout(300)
await page.getByRole('radio', { name: 'A3' }).click()
await page.getByRole('radio', { name: 'Classic' }).click()
await page.screenshot({ path: join(outDir, '2-art-placed.png') })

// 2. Plant on the main room floor
await page.getByRole('button', { name: 'Done' }).click()
await page.getByRole('tab', { name: /Plants/ }).click()
await page.getByRole('button', { name: /Monstera/ }).click()
await hover(640, 600)
await page.mouse.click(643, 600)
await page.waitForTimeout(300)

// 3. Arc lamp
await page.getByRole('button', { name: 'Done' }).click()
await page.getByRole('tab', { name: /Lights/ }).click()
await page.getByRole('button', { name: /Arc floor lamp/ }).click()
await hover(760, 470)
await page.mouse.click(763, 470)
await page.waitForTimeout(800)
await page.screenshot({ path: join(outDir, '3-all-placed.png') })

const saved = JSON.parse(readFileSync(layoutFile('e2e'), 'utf8'))
console.log(
  'saved items:',
  saved.items.map((i) => `${i.kind}@${i.at.map((v) => v.toFixed(2)).join(',')}${i.facing ? ' ' + i.facing : ''}`),
)
await browser.close()
