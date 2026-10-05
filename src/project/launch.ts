import { LAYOUT_SLUG } from '../model/layoutNames'
import type { CameraId } from '../model/plan'
import type { Vec3 } from '../model/types'
import { isIsoDate, parseClock, parseFacing } from '../sun/solar'

// Launch options: the URL parameters a page opens with (see docs/features.md#views).
// They are read once, here, and every value is checked: a bad one is ignored as
// if it were missing. The screenshot scripts and browser tests rely on them to
// reproduce a view exactly.

export const VIEW_PRESETS = [
  'iso-balcony',
  'iso-entry',
  'top',
  'from-balcony',
  'from-entry',
] as const satisfies readonly CameraId[]

/** Space and plan ids (server/storage.ts). */
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/

export interface Launch {
  /** ?space=<id>: the space (docs/adr/0010); without one the page is the home page. */
  space: string | null
  /** ?plan=<id>: the plan to open; without one the page lists the space's plans. */
  plan: string | null
  /** ?edit=floorplan: the floor plan editor, for the plan or (without ?plan=) a new one. */
  floorplanEditor: boolean
  /** ?decor=<slug>: the layout to open (undefined: the plan's main layout). */
  layout: string | undefined
  /** ?view=<preset> */
  view: CameraId | null
  /** ?mode=xray */
  xray: boolean
  /** ?flip=1 or ?flip=0: the ?view iso view seen from its other side, or not (null: as last time). */
  flip: boolean | null
  /** ?dims=0 hides dimensions. */
  dims: boolean
  /** ?downlights=0 switches the ceiling downlights off. */
  downlights: boolean
  /** ?clearances=1 shows clearances around the selection. */
  clearances: boolean
  /** ?sun=HH:MM, ?light=evening, ?date=YYYY-MM-DD, ?facing=N|250. */
  sun: { minutes: number | null; evening: boolean; date: string | null; facing: number | null }
  /** The URL sets the sun, so this visit must not overwrite the one the viewer saved. */
  sunFromUrl: boolean
  /** ?cam=x,y,z,tx,ty,tz[,fov]: an exact camera. */
  camera: { position: Vec3; target: Vec3; fov: number | null } | null
}

export function readLaunch(search: string): Launch {
  const p = new URLSearchParams(search)
  const view = p.get('view')
  const cam = p.get('cam')?.split(',').map(Number)
  const date = p.get('date')
  const layout = p.get('decor')
  return {
    space: ID.test(p.get('space') ?? '') ? p.get('space') : null,
    plan: ID.test(p.get('plan') ?? '') ? p.get('plan') : null,
    floorplanEditor: p.get('edit') === 'floorplan',
    layout: layout && LAYOUT_SLUG.test(layout) ? layout : undefined,
    view: VIEW_PRESETS.includes(view as CameraId) ? (view as CameraId) : null,
    xray: p.get('mode') === 'xray',
    flip: p.has('flip') ? p.get('flip') === '1' : null,
    dims: p.get('dims') !== '0',
    downlights: p.get('downlights') !== '0',
    clearances: p.get('clearances') === '1',
    sun: {
      minutes: parseClock(p.get('sun')),
      evening: p.get('light') === 'evening',
      date: isIsoDate(date) ? date : null,
      facing: parseFacing(p.get('facing')),
    },
    sunFromUrl: p.has('sun') || p.has('facing') || p.has('light'),
    camera:
      cam && cam.length >= 6 && cam.every(Number.isFinite)
        ? {
            position: [cam[0], cam[1], cam[2]],
            target: [cam[3], cam[4], cam[5]],
            fov: cam[6] || null,
          }
        : null,
  }
}

/** This page's launch options. */
export const launch: Launch = readLaunch(typeof window === 'undefined' ? '' : window.location.search)

/** Links between pages: the home page, a space, a plan, the floor plan editor. */
export const links = {
  home: () => '/',
  space: (space: string) => `/?space=${space}`,
  plan: (space: string, plan: string) => `/?space=${space}&plan=${plan}`,
  floorplan: (space: string, plan?: string) => `/?space=${space}${plan ? `&plan=${plan}` : ''}&edit=floorplan`,
}

/** Keeps ?decor= in the address bar in step with the open layout, without a reload. */
export function showLayoutInUrl(slug: string | null) {
  const url = new URL(window.location.href)
  if (slug) url.searchParams.set('decor', slug)
  else url.searchParams.delete('decor')
  window.history.replaceState(window.history.state, '', url)
}
