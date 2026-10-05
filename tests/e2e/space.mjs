// The space and plan browser tests and scripts work in, and where its files are.
// playwright.config.ts seeds space e2e from examples/monoambiente in
// test-results/e2e-data; scripts run against your own dev server can point
// elsewhere with SPACE, PLAN and FLOORPLAN_DATA.
import { join } from 'node:path'

export const SPACE = process.env.SPACE ?? 'e2e'
export const PLAN = process.env.PLAN ?? 'monoambiente'
export const DATA = process.env.FLOORPLAN_DATA ?? 'storage'

/** The plan in 3D on the server at `base`; add more parameters with `&`. */
export const appUrl = (base) => `${base.replace(/\/$/, '')}/?space=${SPACE}&plan=${PLAN}`
/** The plan's API routes (decor, layouts) on the server at `base`. */
export const planApi = (base) => `${base.replace(/\/$/, '')}/api/spaces/${SPACE}/plans/${PLAN}`
/** The file of layout `slug` (null: the main one). Tests seed and read scratch layouts here, never real ones. */
export const layoutFile = (slug) =>
  join(DATA, 'spaces', SPACE, 'layouts', PLAN, slug ? `decor.${slug}.json` : 'decor.json')
