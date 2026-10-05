// Gallery-wall workflow end to end: hang three artworks, Shift-select them, align
// tops, distribute, group, drag the group, undo, smart guides during a drag,
// rubber-band select and "hang as a gallery". Checks what gets saved each step.
// Uses the scratch layout test-align (git-ignored), never your real layout.
// Usage: node tests/e2e/align.mjs <outDir> [baseUrl]
import { expect, test } from '@playwright/test'
import { BASE_URL, SHOTS, watchErrors } from './lib.mjs'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { appUrl, layoutFile } from './space.mjs'

test('gallery wall: align, distribute, group, guides, hang as a gallery', async ({ page }) => {
  const base = BASE_URL
  const outDir = join(SHOTS, 'align')
  mkdirSync(outDir, { recursive: true })
  const FILE = layoutFile('test-align')
  writeFileSync(FILE, JSON.stringify({ version: 1, items: [] }, null, 2) + '\n')

  const errors = watchErrors(page)

  /** One check: reported on its own, and the test goes on (like the PASS/FAIL lines this replaced). */
  const check = (name, ok, detail = '') => expect.soft(ok, detail ? `${name}: ${detail}` : name).toBe(true)

  const saved = () => JSON.parse(readFileSync(FILE, 'utf8'))
  const arts = () => saved().items.filter((i) => i.kind === 'artwork')
  const settle = () => page.waitForTimeout(800) // save debounce is 400 ms
  const screen = (p) => page.evaluate((p) => window.__edit.toScreen(p), p)
  const sel = () => page.evaluate(() => window.__edit.decor.getState().selectedIds)
  const cm = (v) => (v * 100).toFixed(1)
  /** Boxes on the wall (along, height) as the app computes them. */
  const boxes = (items) =>
    page.evaluate(async (items) => {
      const m = await import('/src/decor/extent.ts')
      return items.map((i) => m.boxIn(i, m.wallFrameOf(i)))
    }, items)

  async function glide(from, to, steps = 14) {
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps)
      await page.waitForTimeout(16)
    }
  }

  // Straight at the kitchen-side wall (z = 3), from the bath side.
  await page.goto(`${appUrl(base)}&cam=5.3,1.45,0.15,4.75,1.45,3,62&decor=test-align&dims=0`)
  await page.waitForFunction(() => (window.__frames ?? 0) > 30 && window.__edit, null, { timeout: 60000 })
  await page.waitForTimeout(1200)
  const panel = page.locator('#decor-panel')

  // 1. Hang three artworks at uneven heights.
  const spots = [
    [3.9, 1.22],
    [4.55, 1.78],
    [5.15, 1.35],
  ]
  await page.getByRole('tab', { name: /Artwork/ }).click()
  for (const [i, [x, y]] of spots.entries()) {
    await page.keyboard.press('Escape')
    await panel
      .locator('.thumb, button:has(img)')
      .nth(i + 3)
      .click()
    const p = await screen([x, y, 2.98])
    await glide([p[0] - 30, p[1] + 20], p, 6)
    await page.mouse.click(p[0], p[1])
    await settle()
  }
  let items = arts()
  check(
    'hang: three artworks on the kitchen-side wall',
    items.length === 3 && items.every((a) => a.facing === 'z-' && a.host === 'side-kitchen'),
    items.map((a) => `[${a.at.join(', ')}]`).join(' '),
  )

  // 2. Click the first, Shift+click the others.
  await page.keyboard.press('Escape')
  const center = async (a) => screen([a.at[0], a.at[1], a.at[2]])
  const byX = [...items].sort((p, q) => q.at[0] - p.at[0]) // x runs right to left on this wall as seen from the room
  const c0 = await center(byX[0])
  await page.mouse.click(c0[0], c0[1])
  await page.keyboard.down('Shift')
  for (const a of byX.slice(1)) {
    const c = await center(a)
    await page.mouse.click(c[0], c[1])
  }
  await page.keyboard.up('Shift')
  await page.waitForTimeout(300)
  check('shift+click: three selected', (await sel()).length === 3, JSON.stringify(await sel()))
  check('edit bar shows the align tools', await page.getByRole('button', { name: /^Align tops/ }).isVisible())
  check('panel shows the selection summary', await panel.getByRole('heading', { name: '3 artworks' }).isVisible())
  await page.screenshot({ path: join(outDir, 'align-1-multiselect.png') })

  // 3. Align tops.
  await page.getByRole('button', { name: /^Align tops/ }).click()
  await settle()
  items = arts()
  let b = await boxes(items)
  const tops = b.map((x) => x.v1)
  check('align tops: equal tops in the file', Math.max(...tops) - Math.min(...tops) < 0.002, tops.map(cm).join(' / '))

  // 4. Distribute along the wall.
  await page.getByRole('button', { name: /^Distribute along the wall/ }).click()
  await settle()
  items = arts()
  b = (await boxes(items)).sort((p, q) => p.u0 - q.u0)
  const gaps = [b[1].u0 - b[0].u1, b[2].u0 - b[1].u1]
  check('distribute: equal gaps', Math.abs(gaps[0] - gaps[1]) < 0.003, gaps.map(cm).join(' / ') + ' cm')

  // 5. Group (Cmd/Ctrl+G).
  await page.keyboard.press('ControlOrMeta+g')
  await settle()
  items = arts()
  const gid = items[0].groupId
  check('group: one groupId saved on all three', !!gid && items.every((a) => a.groupId === gid), gid)
  const roomToggle = page.locator('#room-toggle')
  if ((await roomToggle.getAttribute('aria-expanded')) === 'false') await roomToggle.click()
  check(
    'room list shows the group',
    await panel.getByRole('button', { name: 'Gallery wall · 3', exact: true }).isVisible(),
  )
  await page.screenshot({ path: join(outDir, 'align-2-grouped.png') })

  // 6. Deselect, click one piece: the whole group comes along. Drag it.
  await page.keyboard.press('Escape')
  const before = arts()
  const p0 = await center(before[1])
  await page.mouse.move(p0[0], p0[1])
  await page.mouse.down()
  await page.waitForTimeout(100)
  check('click: picks the whole group', (await sel()).length === 3)
  await glide(p0, [p0[0] - 140, p0[1] + 30], 16)
  await page.screenshot({ path: join(outDir, 'align-3-group-drag.png') })
  await page.mouse.up()
  await settle()
  const after = arts()
  const d = after.map((a, i) => a.at.map((v, k) => v - before[i].at[k]))
  const same = d.every((x) => x.every((v, k) => Math.abs(v - d[0][k]) < 0.002))
  check(
    'drag: all three moved by the same offset',
    same && Math.abs(d[0][0]) > 0.05,
    d.map((x) => x.map(cm).join(',')).join(' | '),
  )
  check(
    'drag: still on the wall',
    after.every((a) => Math.abs(a.at[2] - before[0].at[2]) < 0.002),
  )

  // 7. Undo puts them all back in one step.
  await page.keyboard.press('ControlOrMeta+z')
  await settle()
  const undone = arts()
  check(
    'undo: whole group back',
    undone.every((a, i) => a.at.every((v, k) => Math.abs(v - before[i].at[k]) < 0.001)),
  )

  // 8. Smart guides: Alt+press one piece (just it), drag it level with its neighbor.
  await page.keyboard.press('Escape')
  const [, mid] = [...undone].sort((p, q) => q.at[0] - p.at[0])
  const pm = await center(mid)
  await page.mouse.move(pm[0], pm[1])
  await page.keyboard.down('Alt')
  await page.mouse.down()
  await page.keyboard.up('Alt')
  await page.waitForTimeout(100)
  check('alt+press: one piece of the group', (await sel()).length === 1)
  // Toward 2 cm below the left piece's top alignment: the guide pulls it level.
  const target = await screen([mid.at[0] - 0.02, mid.at[1] - 0.25, mid.at[2]])
  await glide(pm, target, 14)
  await page.waitForTimeout(200)
  const guides = await page.evaluate(() => window.__edit.edit.getState().guides)
  check(
    'guides: showing while dragging',
    !!guides && guides.align.length + guides.spacing.length + guides.gallery.length > 0,
    guides
      ? `align ${guides.align.length / 2}, spacing ${guides.spacing.length / 2}, gallery ${guides.gallery.length / 2}`
      : 'none',
  )
  await page.screenshot({ path: join(outDir, 'align-4-guides.png') })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await settle()
  check(
    'esc: drag cancelled, guides gone',
    (await page.evaluate(() => window.__edit.edit.getState().guides)) === null &&
      arts().every((a, i) => a.at.every((v, k) => Math.abs(v - undone[i].at[k]) < 0.001)),
  )

  // 9. Rubber band: Shift+drag over the room selects what it covers.
  await page.keyboard.press('Escape')
  const corners = await Promise.all([screen([5.6, 2.2, 2.98]), screen([3.4, 0.9, 2.98])])
  await page.keyboard.down('Shift')
  await page.mouse.move(corners[0][0], corners[0][1])
  await page.mouse.down()
  await glide(corners[0], corners[1], 10)
  await page.mouse.up()
  await page.keyboard.up('Shift')
  await page.waitForTimeout(200)
  check('marquee: selects the three', (await sel()).length === 3)

  // 10. Hang as a gallery: one row, 8 cm apart, centered at 150 cm.
  await panel
    .getByRole('radio', { name: 'One row' })
    .click()
    .catch(() => {})
  await panel
    .getByRole('radio', { name: '8 cm' })
    .click()
    .catch(() => {})
  await panel.getByRole('button', { name: /^Hang 3 pieces/ }).click()
  await settle()
  items = arts()
  b = (await boxes(items)).sort((p, q) => p.u0 - q.u0)
  const rowGaps = [b[1].u0 - b[0].u1, b[2].u0 - b[1].u1]
  check(
    'gallery: 8 cm gaps',
    rowGaps.every((g) => Math.abs(g - 0.08) < 0.002),
    rowGaps.map(cm).join(' / '),
  )
  check(
    'gallery: centered on 150 cm',
    b.every((x) => Math.abs((x.v0 + x.v1) / 2 - 1.5) < 0.002),
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(outDir, 'align-5-gallery.png') })

  // 10b. Equal spacing: pull the rightmost piece out, bring it back near an 8 cm gap.
  const hung = arts()
  const last = [...hung].sort((p, q) => p.at[0] - q.at[0])[0] // smallest x is rightmost on screen
  const pl = await center(last)
  await page.mouse.move(pl[0], pl[1])
  await page.keyboard.down('Alt')
  await page.mouse.down()
  await page.keyboard.up('Alt')
  const away = await screen([last.at[0] - 0.3, last.at[1] + 0.012, last.at[2]])
  await glide(pl, away, 8)
  const back = await screen([last.at[0] - 0.015, last.at[1] + 0.012, last.at[2]])
  await glide(away, back, 10)
  await page.waitForTimeout(200)
  const g2 = await page.evaluate(() => window.__edit.edit.getState().guides)
  const moved = await page.evaluate((id) => window.__edit.decor.getState().items.find((i) => i.id === id).at, last.id)
  check(
    'guides: snaps back to the equal gap and the center line',
    !!g2 && g2.spacing.length > 0 && Math.abs(moved[0] - last.at[0]) < 0.002 && Math.abs(moved[1] - last.at[1]) < 0.002,
    g2 ? `spacing marks ${g2.spacing.length / 6}, labels ${g2.labels.map((l) => l.text).join(', ')}` : 'none',
  )
  await page.screenshot({ path: join(outDir, 'align-6-spacing-guides.png') })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await settle()

  // 11. One undo reverts the whole arrangement.
  await page.keyboard.press('ControlOrMeta+z')
  await settle()
  check(
    'undo: gallery arrangement reverted in one step',
    arts().every((a, i) => a.at.every((v, k) => Math.abs(v - undone[i].at[k]) < 0.001)),
  )

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
})
