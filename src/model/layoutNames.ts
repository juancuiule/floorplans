// How layouts are named and where they live, shared by the app and the dev
// server (server/layouts.ts). A layout's slug is its identity and its file
// name; see docs/adr/0003-layout-file-format.md.

/** A layout as the layouts menu lists it (GET /api/layouts). */
export interface LayoutInfo {
  /** null for the default plan's main layout (decor.json). */
  slug: string | null
  name: string
  items: number
  /** ISO time of the last write. */
  updated: string
  /** The plan it furnishes; files that don't say furnish the default plan. */
  plan: string
}

/** A layout slug: lowercase letters, digits and dashes. */
export const LAYOUT_SLUG = /^[a-z0-9-]{1,40}$/

/** The display name of a plan's main layout when its file has none. */
export const MAIN_NAME = 'Current'

/** The main layout of a plan other than the default one keeps its own file, `decor.plan-<id>.json`. */
export const planMainSlug = (planId: string) => `plan-${planId}`

export const isPlanMainSlug = (slug: string | null) => slug !== null && slug.startsWith('plan-')

/** Is this layout some plan's main one ("Current")? null is the default plan's. */
export const isMainSlug = (slug: string | null) => slug === null || isPlanMainSlug(slug)

/** Scratch layouts written by test runs, left out of the layouts menu. */
export const isHiddenSlug = (slug: string) => /^(e2e|test)/.test(slug)

/** The file a layout is stored in: `decor.json` for the default plan's main layout, else `decor.<slug>.json`. */
export const layoutFileName = (slug: string | null) => (slug ? `decor.${slug}.json` : 'decor.json')

/** The slug of a layout file name (null for `decor.json`), or undefined when it is not a layout file. */
export function slugOfFileName(name: string): string | null | undefined {
  const m = name.match(/^decor(?:\.([a-z0-9-]{1,40}))?\.json$/)
  return m ? (m[1] ?? null) : undefined
}

/** "Sofá by the window!" → "sofa-by-the-window". */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return slug || 'layout'
}
