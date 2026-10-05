import { create } from 'zustand'
import { launch } from './project/launch'
import { plan } from './project/plan'
import type { CameraId } from './model/plan'
import { duskLevel, NIGHT_BELOW } from './sun/daylight'
import { isIsoDate, solarPosition, todayIn, type SunPosition } from './sun/solar'
import type { Vec2 } from './model/types'
import { FLIPPABLE, isFlippable, type FlippableView } from './project/cameraSides'

export type ViewMode = 'dollhouse' | 'xray'
export type ViewPreset = CameraId
export type Lighting = 'day' | 'evening'
export type SceneTool = 'measure' | null

/** Eye heights for walk mode, in meters. */
export const EYE_STANDING = 1.6
export const EYE_SEATED = 1.15
export const EYE_MIN = 1.0
export const EYE_MAX = 1.9

export interface SunSettings {
  /** Local date in Buenos Aires, "YYYY-MM-DD". */
  date: string
  /** Minutes after local midnight, 0–1440 (fractional while the day plays). */
  minutes: number
  /** Compass bearing the balcony faces (the plan's +x), degrees clockwise from north. */
  facing: number
}

/** Play speeds: 1 = a whole day in 12 s. */
export const PLAY_SPEEDS = [0.5, 1, 2] as const
export type PlaySpeed = (typeof PLAY_SPEEDS)[number]

/** Quick presets behind the Day / Evening toggle and the L key. */
export const LIGHTING_PRESETS: Record<Lighting, number> = { day: 15 * 60, evening: 21 * 60 }

interface ViewState {
  mode: ViewMode
  preset: ViewPreset
  /** Bumped on every preset request so re-selecting the same preset re-frames. */
  presetNonce: number
  showDims: boolean
  sun: SunSettings
  /** Derived from `sun`: where the sun is. */
  solar: SunPosition
  /** Derived: 'evening' once the sun is below NIGHT_BELOW, when lamps and downlights switch on. */
  lighting: Lighting
  /** Derived: lamp shade glow, 0 by day to 1 at night, in 0.1 steps. */
  dusk: number
  /** The day is animating. */
  playing: boolean
  /** How fast the day plays (1 = 12 s a day). */
  playSpeed: PlaySpeed
  setPlaySpeed: (speed: PlaySpeed) => void
  /** Evening only: the recessed ceiling downlights. */
  downlights: boolean
  /** Jumps to today at the preset time. */
  setLighting: (lighting: Lighting) => void
  setSun: (sun: Partial<SunSettings>) => void
  setPlaying: (playing: boolean) => void
  toggleDownlights: () => void
  setMode: (mode: ViewMode) => void
  goTo: (preset: ViewPreset) => void
  /** Iso views seen from the other long side (mirrored across the plan's center z). Kept for the browser session. */
  isoFlip: Record<FlippableView, boolean>
  /** Flips the current iso view to the other side; no-op for top and eye-level views. */
  flipView: () => void
  toggleDims: () => void
  /** First-person walk mode; the orbit view comes back when it ends. */
  walking: boolean
  /** Where the walk starts (plan x, z); null = at the entry. */
  walkFrom: Vec2 | null
  eyeHeight: number
  enterWalk: (from?: Vec2 | null) => void
  exitWalk: () => void
  setEyeHeight: (h: number) => void
  /** A tool that takes over clicks in the scene. */
  tool: SceneTool
  setTool: (tool: SceneTool) => void
  /** Distances from the selected floor piece to its surroundings. */
  clearances: boolean
  toggleClearances: () => void
}

const SUN_KEY = 'monoambiente.sun'

function readSavedSun(): Partial<SunSettings> {
  try {
    const s = JSON.parse(localStorage.getItem(SUN_KEY) ?? '{}')
    return {
      facing: typeof s.facing === 'number' ? s.facing : undefined,
      date: isIsoDate(s.date) ? s.date : undefined,
      minutes: typeof s.minutes === 'number' ? s.minutes : undefined,
    }
  } catch {
    return {}
  }
}

/** URL (?sun=HH:MM&date=YYYY-MM-DD&facing=N, or ?light=evening) wins over what was saved. */
function initialSun(): SunSettings {
  const saved = readSavedSun()
  const urlMinutes = launch.sun.minutes ?? (launch.sun.evening ? LIGHTING_PRESETS.evening : null)
  const urlDate = launch.sun.date
  return {
    facing: launch.sun.facing ?? saved.facing ?? 0,
    date: isIsoDate(urlDate)
      ? urlDate
      : urlMinutes !== null
        ? todayIn(plan.location)
        : (saved.date ?? todayIn(plan.location)),
    minutes: urlMinutes ?? saved.minutes ?? LIGHTING_PRESETS.day,
  }
}

function derive(sun: SunSettings) {
  const solar = solarPosition(sun.date, sun.minutes, plan.location)
  return {
    solar,
    lighting: (solar.elevation < NIGHT_BELOW ? 'evening' : 'day') as Lighting,
    dusk: duskLevel(solar.elevation),
  }
}

const sun0 = initialSun()

const FLIP_KEY = 'monoambiente.isoFlip'

/** ?flip=1 opens the ?view iso view from its other side; otherwise the session's choice. */
function initialFlip(): Record<FlippableView, boolean> {
  const flip = Object.fromEntries(FLIPPABLE.map((v) => [v, false])) as Record<FlippableView, boolean>
  try {
    const saved = JSON.parse(sessionStorage.getItem(FLIP_KEY) ?? '{}')
    for (const v of FLIPPABLE) flip[v] = saved?.[v] === true
  } catch {
    /* storage blocked: start unflipped */
  }
  if (launch.flip !== null && launch.view && isFlippable(launch.view)) flip[launch.view] = launch.flip
  return flip
}

export const useView = create<ViewState>((set) => ({
  mode: launch.xray ? 'xray' : 'dollhouse',
  preset: launch.view ?? 'iso-balcony',
  presetNonce: 0,
  showDims: launch.dims,
  sun: sun0,
  ...derive(sun0),
  playing: false,
  playSpeed: 1,
  setPlaySpeed: (playSpeed) => set({ playSpeed }),
  downlights: launch.downlights,
  setLighting: (lighting) =>
    set((s) => {
      const sun = { ...s.sun, date: todayIn(plan.location), minutes: LIGHTING_PRESETS[lighting] }
      return { sun, ...derive(sun), playing: false }
    }),
  setSun: (patch) =>
    set((s) => {
      const sun = { ...s.sun, ...patch }
      sun.minutes = ((sun.minutes % 1440) + 1440) % 1440
      return { sun, ...derive(sun) }
    }),
  setPlaying: (playing) => set({ playing }),
  toggleDownlights: () => set((s) => ({ downlights: !s.downlights })),
  setMode: (mode) => set({ mode }),
  // A camera preset ends a walk: the preset takes over the camera.
  goTo: (preset) => set((s) => ({ preset, presetNonce: s.presetNonce + 1, walking: false })),
  isoFlip: initialFlip(),
  flipView: () =>
    set((s) => {
      if (!isFlippable(s.preset)) return {}
      return {
        isoFlip: { ...s.isoFlip, [s.preset]: !s.isoFlip[s.preset] },
        presetNonce: s.presetNonce + 1,
        walking: false,
      }
    }),
  toggleDims: () => set((s) => ({ showDims: !s.showDims })),
  walking: false,
  walkFrom: null,
  eyeHeight: EYE_STANDING,
  enterWalk: (from = null) => set({ walking: true, walkFrom: from }),
  exitWalk: () => set({ walking: false }),
  setEyeHeight: (h) => set({ eyeHeight: Math.min(EYE_MAX, Math.max(EYE_MIN, h)) }),
  tool: null,
  setTool: (tool) => set({ tool }),
  clearances: launch.clearances,
  toggleClearances: () => set((s) => ({ clearances: !s.clearances })),
}))

// The balcony's orientation belongs to the apartment; the time is where you left it.
// URL-driven sessions (screenshots) don't overwrite what you saved.
let saveTimer: ReturnType<typeof setTimeout> | undefined
if (!launch.sunFromUrl) {
  useView.subscribe((s, prev) => {
    if ((s.sun === prev.sun && s.playing === prev.playing) || s.playing) return
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      try {
        const { facing, date, minutes } = useView.getState().sun
        localStorage.setItem(SUN_KEY, JSON.stringify({ facing, date, minutes: Math.round(minutes) }))
      } catch {
        /* private mode: keep it for this visit only */
      }
    }, 300)
  })
}

useView.subscribe((s, prev) => {
  if (s.isoFlip === prev.isoFlip) return
  try {
    sessionStorage.setItem(FLIP_KEY, JSON.stringify(s.isoFlip))
  } catch {
    /* storage blocked: this page only */
  }
})

declare global {
  interface Window {
    /** Dev only: the view store, for scripts. */
    __view?: typeof useView
  }
}
if (import.meta.env.DEV && typeof window !== 'undefined') window.__view = useView

// This module holds live state (the store, and here its undo history). Swapping it
// in place during development would leave parts of the app on the old copy, so a
// change to it reloads the page.
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload())
