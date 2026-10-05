// Exercises the editing interactions (place, drag, undo/redo, nudge, rotate, copy/paste,
// delete) and checks what gets saved. Uses the scratch layout test-edit, seeded from
// the scratch layout test-furn when that exists (both git-ignored), never your real layout.
// Usage: node tests/e2e/edit.mjs <outDir> [baseUrl]
import { expect, test } from '@playwright/test'
import { BASE_URL, SHOTS, watchErrors } from './lib.mjs'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { appUrl, layoutFile } from './space.mjs'

test('place, drag, undo and redo, nudge, rotate, copy and paste, delete', async ({ page }) => {
  const base = BASE_URL
  const outDir = join(SHOTS, 'edit')
  mkdirSync(outDir, { recursive: true })
  const FILE = layoutFile('test-edit')
  const SEED = layoutFile('test-furn')
  if (existsSync(SEED)) copyFileSync(SEED, FILE)
  else writeFileSync(FILE, JSON.stringify({ version: 1, items: [] }, null, 2) + '\n')

  const errors = watchErrors(page)

  /** One check: reported on its own, and the test goes on (like the PASS/FAIL lines this replaced). */
  const check = (name, ok, detail = '') => expect.soft(ok, detail ? `${name}: ${detail}` : name).toBe(true)

  const saved = () => JSON.parse(readFileSync(FILE, 'utf8')).items
  const settle = () => page.waitForTimeout(800) // save debounce is 400 ms
  const screen = (p) => page.evaluate((p) => window.__edit.toScreen(p), p)
  const state = () =>
    page.evaluate(() => {
      const s = window.__edit.decor.getState()
      return { selectedId: s.selectedId, movingId: s.movingId, canUndo: s.canUndo, canRedo: s.canRedo }
    })
  const itemIn = (id) => saved().find((i) => i.id === id)
  const near = (a, b, tol = 0.02) => a.every((v, i) => Math.abs(v - b[i]) <= tol)
  const fmt = (a) => `[${a.map((v) => v.toFixed(2)).join(', ')}]`

  async function glide(from, to, steps = 12) {
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps)
      await page.waitForTimeout(16)
    }
  }

  await page.goto(`${appUrl(base)}&view=iso-balcony&decor=test-edit&dims=0`)
  await page.waitForFunction(() => (window.__frames ?? 0) > 30 && window.__edit, null, { timeout: 60000 })
  await page.waitForTimeout(1200)
  const before = saved().length

  // 0. Wall snapping regression: a desk dropped by the bath-side wall, just inside the main
  // room, backs onto that wall and tucks against the partition, not through it into the shower.
  const desk = await page.evaluate(async () => {
    const m = await import('/src/decor/placement.ts')
    return m.snapToWalls(2.3, 0.1, {
      kind: 'furniture',
      id: 't',
      type: 'standingDesk',
      at: [2.3, 0, 0.1],
      rotation: 0,
      size: [1.4, 0.75, 0.7],
      finish: {},
      options: {},
    })
  })
  check(
    'snap: desk by the partition stays in the main room',
    !!desk && Math.abs(desk.x - 2.9) < 0.02 && Math.abs(desk.z - 0.35) < 0.02,
    desk ? `x ${desk.x} z ${desk.z}` : 'no snap',
  )

  // 1. Place a sideboard in the middle of the main room.
  await page.getByRole('tab', { name: /Furniture/ }).click()
  await page.getByRole('button', { name: /Low sideboard/ }).click()
  const drop = await screen([6.1, 0, 1.5])
  await glide([drop[0] - 40, drop[1]], drop)
  await page.mouse.click(drop[0], drop[1])
  await settle()
  let items = saved()
  const placed = items.find((i) => i.type === 'sideboard')
  check('place: sideboard saved', items.length === before + 1 && !!placed, placed ? fmt(placed.at) : '')
  const id = placed.id
  const at0 = placed.at

  // 2. Hover it, then drag it (the camera must not orbit).
  const p0 = await screen([at0[0], 0.3, at0[2]])
  await page.mouse.move(p0[0] - 60, p0[1] - 60)
  await glide([p0[0] - 60, p0[1] - 60], p0, 6)
  await page.waitForTimeout(200)
  check(
    'hover: item under pointer is hovered',
    (await page.evaluate(() => window.__edit.edit.getState().hoverId)) === id,
  )
  await page.screenshot({ path: join(outDir, 'edit-1-hover.png') })

  const cam0 = await page.evaluate(() => window.__edit.camera())
  const target = await screen([5.8, 0.3, 2.0])
  await page.mouse.down()
  await glide(p0, target, 16)
  await page.screenshot({ path: join(outDir, 'edit-2-drag.png') })
  await page.mouse.up()
  await settle()
  const at1 = itemIn(id).at
  const cam1 = await page.evaluate(() => window.__edit.camera())
  check('drag: item moved', !near(at1, at0, 0.1), `${fmt(at0)} -> ${fmt(at1)}`)
  check('drag: camera did not orbit', near(cam0, cam1, 1e-3))

  // 3. Undo returns it, redo moves it again.
  await page.keyboard.press('ControlOrMeta+z')
  await settle()
  check('undo: drag reverted', near(itemIn(id).at, at0), fmt(itemIn(id).at))
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await settle()
  check('redo: drag re-applied', near(itemIn(id).at, at1), fmt(itemIn(id).at))

  // 4. Esc during a drag restores the item and records nothing.
  const p1 = await screen([at1[0], 0.3, at1[2]])
  await page.mouse.move(p1[0], p1[1])
  await page.mouse.down()
  await glide(p1, [p1[0] + 150, p1[1] + 40], 10)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await settle()
  check('esc: drag cancelled', near(itemIn(id).at, at1), fmt(itemIn(id).at))

  // 5. Nudge with arrows: three 1 cm steps and one 10 cm step, undone as one burst.
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Shift+ArrowUp')
  await settle()
  const at2 = itemIn(id).at
  const moved = Math.abs(at2[0] - at1[0]) + Math.abs(at2[2] - at1[2])
  check('nudge: moved 13 cm in plan', Math.abs(moved - 0.13) < 0.005, `${fmt(at1)} -> ${fmt(at2)}`)
  await page.keyboard.press('ControlOrMeta+z')
  await settle()
  check('nudge: one undo reverts the burst', near(itemIn(id).at, at1, 0.001), fmt(itemIn(id).at))
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await settle()

  // 6. Rotate with R, then with the ring handle.
  const rot0 = itemIn(id).rotation
  await page.keyboard.press('r')
  await settle()
  const rot1 = itemIn(id).rotation
  check('rotate: R turns 90°', (rot1 - rot0 + 360) % 360 === 90, `${rot0} -> ${rot1}`)

  const it = itemIn(id)
  const radius = Math.hypot(it.size[0], it.size[2]) / 2 + 0.12
  const rad = (it.rotation * Math.PI) / 180
  const knob = await screen([it.at[0] + Math.sin(rad) * radius, it.at[1] + 0.02, it.at[2] + Math.cos(rad) * radius])
  const rad2 = rad + Math.PI / 2
  const knob2 = await screen([it.at[0] + Math.sin(rad2) * radius, it.at[1] + 0.02, it.at[2] + Math.cos(rad2) * radius])
  await page.mouse.move(knob[0], knob[1])
  await page.waitForTimeout(150)
  await page.mouse.down()
  await glide(knob, knob2, 14)
  await page.screenshot({ path: join(outDir, 'edit-3-rotate-ring.png') })
  await page.mouse.up()
  await settle()
  const rot2 = itemIn(id).rotation
  check('ring: turned a quarter', (rot2 - rot1 + 360) % 360 === 90, `${rot1} -> ${rot2}`)
  check('ring: item did not move', near(itemIn(id).at, it.at, 0.001))

  // 7. Copy / paste places a copy that follows the pointer.
  await page.keyboard.press('ControlOrMeta+c')
  const pasteAt = await screen([6.2, 0, 0.9])
  await page.mouse.move(pasteAt[0] - 30, pasteAt[1])
  await page.keyboard.press('ControlOrMeta+v')
  await glide([pasteAt[0] - 30, pasteAt[1]], pasteAt, 6)
  await page.mouse.click(pasteAt[0], pasteAt[1])
  await settle()
  items = saved()
  const copies = items.filter((i) => i.type === 'sideboard')
  const copy = copies.find((i) => i.id !== id)
  check('paste: copy placed', copies.length === 2 && !!copy, copy ? fmt(copy.at) : '')
  check('paste: copy is at the pointer', !!copy && Math.hypot(copy.at[0] - 6.2, copy.at[2] - 0.9) < 0.5)

  // 8. Cmd+D duplicates too; Esc drops the duplicate before it is placed.
  await page.keyboard.press('ControlOrMeta+d')
  await page.waitForTimeout(100)
  const dupMoving = (await state()).movingId
  await page.keyboard.press('Escape')
  await settle()
  check('duplicate: Cmd+D starts placing a copy, Esc drops it', !!dupMoving && saved().length === items.length)

  // 9. Delete, then undo brings it back.
  await page.evaluate((id) => window.__edit.decor.getState().select(id), copy.id)
  await page.keyboard.press('Delete')
  await settle()
  check('delete: copy removed', !itemIn(copy.id))
  await page.keyboard.press('ControlOrMeta+z')
  await settle()
  check('undo delete: copy restored', !!itemIn(copy.id))

  // 10. Indicators: snap against a wall, overlap with the wardrobe, a click on the room deselects.
  await page.evaluate((id) => window.__edit.decor.getState().select(id), id)
  const cur = itemIn(id)
  const c0 = await screen([cur.at[0], 0.3, cur.at[2]])
  const nearWall = await screen([6.0, 0, 2.7])
  await page.mouse.move(c0[0], c0[1])
  await page.mouse.down()
  await glide(c0, nearWall, 14)
  await page.waitForTimeout(150)
  const snap = await page.evaluate(() => window.__edit.edit.getState().snap.length)
  await page.screenshot({ path: join(outDir, 'edit-4-snap.png') })
  check('snap: indicator shows against the wall', snap > 0)
  const overWardrobe = await screen([5.3, 0, 0.9])
  await glide(nearWall, overWardrobe, 14)
  await page.waitForTimeout(200)
  await page.screenshot({ path: join(outDir, 'edit-5-overlap.png') })
  await page.mouse.up()
  await settle()
  const overlapText = await page
    .locator('.editbar-warn')
    .textContent()
    .catch(() => null)
  check('overlap: edit bar warns', !!overlapText && /Overlaps|wall/.test(overlapText), overlapText ?? '')
  await page.screenshot({ path: join(outDir, 'edit-6-editbar.png') })

  // Invalid target: an artwork over the floor.
  await page.getByRole('tab', { name: /^Art/ }).click()
  await page.locator('.thumb').first().click()
  const floor = await screen([6.0, 0, 1.6])
  await glide([floor[0] - 30, floor[1]], floor, 6)
  await page.waitForTimeout(200)
  check(
    'invalid: marker over the floor for an artwork',
    await page.evaluate(() => window.__edit.edit.getState().invalid !== null),
  )
  await page.screenshot({ path: join(outDir, 'edit-7-invalid.png') })
  await page.keyboard.press('Escape')

  const room = await screen([6.5, 0, 0.4])
  await page.evaluate((id) => window.__edit.decor.getState().select(id), id)
  await page.mouse.click(room[0], room[1])
  await page.waitForTimeout(200)
  check('click on the floor deselects', (await state()).selectedId === null)

  await settle()
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
})
