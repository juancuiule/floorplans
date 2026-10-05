// Measures frames per second for a view: node scripts/fps.mjs "view=iso-balcony&light=evening"
import { appUrl } from '../tests/e2e/space.mjs'
import { chromium } from 'playwright'
const query = process.argv[2] ?? ''
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(`${appUrl('http://localhost:5173')}&${query}`)
await page.waitForFunction(() => (window.__frames ?? 0) > 60, null, { timeout: 60000 })
const f0 = await page.evaluate(() => window.__frames)
await page.waitForTimeout(3000)
const f1 = await page.evaluate(() => window.__frames)
console.log(query || 'default', ((f1 - f0) / 3).toFixed(1), 'fps')
await browser.close()
