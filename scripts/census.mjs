// Dev aid: counts visible meshes/lines per owner (decor item, wall, or scene) for a view.
// Usage: node scripts/census.mjs baseUrl "view=iso-balcony&decor=furn"
import { appUrl } from '../tests/e2e/space.mjs'
import { chromium } from 'playwright'
const [base = 'http://localhost:5173', query = ''] = process.argv.slice(2)
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(`${appUrl(base)}&dims=0&${query}`)
await page.waitForFunction(() => (window.__frames ?? 0) > 40, null, { timeout: 60000 })
await page.waitForTimeout(2000)
const rows = await page.evaluate(() => {
  const out = {}
  const walk = (o, owner) => {
    if (!o.visible) return
    const label = o.userData.decorId
      ? `decor:${o.userData.decorId}`
      : o.userData.host
        ? `wall:${o.userData.host}`
        : owner
    if (o.isMesh || o.isLine || o.isPoints) out[label] = (out[label] ?? 0) + 1
    for (const c of o.children) walk(c, label)
  }
  walk(window.__scene, 'scene')
  return Object.entries(out).sort((a, b) => b[1] - a[1])
})
for (const [k, v] of rows) console.log(String(v).padStart(4), k)
await browser.close()
