import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { plan } from '../project/plan'
import { LIGHTING_PRESETS, PLAY_SPEEDS, useView, type Lighting, type PlaySpeed } from '../store'
import { compassBearing, compassName, formatMinutes, sunTimes, todayIn, type Compass } from '../sun/solar'
import { onRadioKeys } from './controlUtils'
import { Icon } from './icons'
import './sunControl.css'

/** At 1× a whole day plays in this long. */
const DAY_MS = 12000
const STEP = 15

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const shortDate = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`

/** Southern hemisphere: December is summer. */
const QUICK_DATES: { label: string; tip: string; md: string }[] = [
  { label: 'Dec 21', tip: 'Summer solstice: the highest sun', md: '12-21' },
  { label: 'Mar 20', tip: 'Equinox', md: '03-20' },
  { label: 'Jun 21', tip: 'Winter solstice: the lowest sun', md: '06-21' },
]

const { label: city, tz } = plan.location
const PLACE = `${city ? `${city}, ` : ''}UTC${tz < 0 ? '−' : '+'}${Math.abs(tz)}`

const LIGHTS: Lighting[] = ['day', 'evening']
const LIGHT_LABEL: Record<Lighting, string> = { day: 'Day', evening: 'Evening' }
const SPEED_LABEL: Record<PlaySpeed, string> = { 0.5: '½×', 1: '1×', 2: '2×' }

// Compass rose, read like a map: north up.
const ROSE: (Compass | null)[] = ['NW', 'N', 'NE', 'W', null, 'E', 'SW', 'S', 'SE']

const isTyping = (t: EventTarget | null) =>
  (t as HTMLElement | null)?.closest?.('input, select, textarea, [contenteditable="true"]')

/** , and . step the time by 15 minutes ([ and ] belong to the editor). */
function useSunShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return
      if (e.key !== ',' && e.key !== '.') return
      if (isTyping(e.target)) return
      const { sun, setSun, setPlaying } = useView.getState()
      const m = sun.minutes
      setPlaying(false)
      setSun({ minutes: e.key === '.' ? Math.floor(m / STEP) * STEP + STEP : Math.ceil(m / STEP) * STEP - STEP })
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Advances the clock while playing; the scene only renders (invalidates) while the time changes. */
function usePlayback() {
  const playing = useView((s) => s.playing)
  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    let raf = requestAnimationFrame(function tick(now) {
      const dt = Math.min(now - last, 100)
      last = now
      const { sun, setSun, playSpeed } = useView.getState()
      setSun({ minutes: sun.minutes + ((dt * playSpeed) / DAY_MS) * 1440 })
      raf = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf)
  }, [playing])
}

/**
 * The toolbar's time control: play/pause and a fixed-width clock that opens
 * the time & sun popover. Nothing in it changes width, so the toolbar never
 * reflows between day and evening or while the popover is open.
 */
export function SunControl() {
  // Whole minutes: the toolbar re-renders once a minute of sun time, not every frame.
  const minute = useView((s) => Math.floor(s.sun.minutes))
  const date = useView((s) => s.sun.date)
  const night = useView((s) => s.lighting === 'evening')
  const playing = useView((s) => s.playing)
  const setPlaying = useView((s) => s.setPlaying)
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useSunShortcuts()
  usePlayback()
  const clock = formatMinutes(minute)

  return (
    <div className="group time-control" role="group" aria-label="Time of day">
      <button
        type="button"
        className="time-play"
        aria-pressed={playing}
        aria-label={playing ? 'Pause the day' : 'Play the day'}
        data-tip={playing ? 'Pause' : 'Play the day'}
        onClick={() => setPlaying(!playing)}
      >
        <PlayIcon playing={playing} />
      </button>
      <button
        ref={triggerRef}
        type="button"
        className="time-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Time and sun: ${clock}, ${shortDate(date)}${night ? ', evening' : ''}`}
        data-tip={`${shortDate(date)} · time, sun and lights (L, , .)`}
        aria-keyshortcuts="L , ."
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name={night ? 'moon' : 'sun'} />
        <span className="time-clock">{clock}</span>
        <Icon name="chevron" size={12} className="time-chevron" />
      </button>
      {open && <SunPopover onClose={close} triggerRef={triggerRef} />}
    </div>
  )
}

function PlayIcon({ playing }: { playing: boolean }) {
  return (
    <svg
      className="icon"
      width={16}
      height={16}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {playing ? <path d="M6 4.5h2.5v11H6zM11.5 4.5H14v11h-2.5z" /> : <path d="M6.5 4.2v11.6L15.5 10z" />}
    </svg>
  )
}

/** Fixed position under the trigger, kept inside the viewport; follows the trigger on resize. */
function useAnchor(triggerRef: RefObject<HTMLElement | null>, popRef: RefObject<HTMLElement | null>) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  useLayoutEffect(() => {
    const place = () => {
      const t = triggerRef.current?.getBoundingClientRect()
      const p = popRef.current
      if (!t || !p) return
      const gutter = 12
      const w = p.offsetWidth
      const left = Math.max(gutter, Math.min(t.left, window.innerWidth - w - gutter))
      setPos((prev) => (prev && prev.top === t.bottom + 8 && prev.left === left ? prev : { top: t.bottom + 8, left }))
    }
    place()
    window.addEventListener('resize', place)
    const ro = new ResizeObserver(place)
    const bar = triggerRef.current?.closest('.toolbar')
    if (bar) ro.observe(bar)
    return () => {
      window.removeEventListener('resize', place)
      ro.disconnect()
    }
  }, [triggerRef, popRef])
  return pos
}

function SunPopover({ onClose, triggerRef }: { onClose: () => void; triggerRef: RefObject<HTMLButtonElement | null> }) {
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  const minutes = useView((s) => Math.round(s.sun.minutes))
  const date = useView((s) => s.sun.date)
  const facing = useView((s) => s.sun.facing)
  const elevation = useView((s) => Math.round(s.solar.elevation))
  const azimuth = useView((s) => Math.round(s.solar.azimuth))
  const lighting = useView((s) => s.lighting)
  const downlights = useView((s) => s.downlights)
  const playing = useView((s) => s.playing)
  const playSpeed = useView((s) => s.playSpeed)
  const { setSun, setPlaying, setLighting, toggleDownlights, setPlaySpeed } = useView.getState()
  const pos = useAnchor(triggerRef, ref)
  const times = sunTimes(date, plan.location)
  const year = date.slice(0, 4)
  const today = todayIn(plan.location)
  const facingName = compassName(facing)
  const night = lighting === 'evening'

  useEffect(() => {
    const panel = ref.current
    panel?.focus({ preventScroll: true })
    const trigger = triggerRef.current
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!panel?.contains(t) && !trigger?.contains(t)) onClose()
    }
    // Esc closes from anywhere (the canvas has focus after a click in the scene), before the editor's Esc.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      e.stopImmediatePropagation()
      onClose()
    }
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey, true)
      if (
        !document.activeElement ||
        document.activeElement === document.body ||
        panel?.contains(document.activeElement)
      )
        trigger?.focus()
    }
  }, [onClose, triggerRef])

  const pct = (m: number) => `${((m / 1440) * 100).toFixed(2)}%`
  const status = night ? 'Night: lamps on' : elevation < 0 ? 'Twilight' : `Sun ${elevation}° up, bearing ${azimuth}°`
  const lightIndex = night ? 1 : 0
  const speedIndex = PLAY_SPEEDS.indexOf(playSpeed)

  return createPortal(
    <div
      ref={ref}
      className="popover sun-pop"
      role="dialog"
      aria-labelledby={`${id}-title`}
      tabIndex={-1}
      style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
    >
      <div className="popover-head">
        <h2 id={`${id}-title`}>Time and sun</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </div>

      <section className="sun-presets">
        <div
          role="radiogroup"
          aria-label="Time of day"
          className="seg"
          onKeyDown={(e) => onRadioKeys(e, LIGHTS, lightIndex, setLighting)}
        >
          {LIGHTS.map((l, i) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={lighting === l}
              tabIndex={i === lightIndex ? 0 : -1}
              title={`Today at ${formatMinutes(LIGHTING_PRESETS[l])} (L)`}
              aria-keyshortcuts="L"
              onClick={() => setLighting(l)}
            >
              <Icon name={l === 'day' ? 'sun' : 'moon'} size={14} />
              {LIGHT_LABEL[l]}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="seg-toggle"
          aria-pressed={downlights}
          title="Recessed ceiling lights, on at night"
          onClick={toggleDownlights}
        >
          <Icon name="downlight" size={14} />
          Downlights
        </button>
      </section>

      <section>
        <div className="sun-row">
          <label htmlFor={`${id}-time`} className="group-label">
            Time
          </label>
          <output htmlFor={`${id}-time`} className="sun-now">
            {formatMinutes(minutes)}
          </output>
        </div>
        <div
          className="sun-slider"
          style={{ '--rise': pct(times.sunrise), '--set': pct(times.sunset) } as CSSProperties}
        >
          <input
            id={`${id}-time`}
            type="range"
            min={0}
            max={1439}
            step={1}
            value={minutes % 1440}
            aria-valuetext={formatMinutes(minutes)}
            onChange={(e) => {
              if (useView.getState().playing) setPlaying(false)
              setSun({ minutes: Number(e.target.value) })
            }}
          />
          {Number.isFinite(times.sunrise) && (
            <span className="sun-mark" style={{ left: pct(times.sunrise) }}>
              Sunrise {formatMinutes(times.sunrise)}
            </span>
          )}
          {Number.isFinite(times.sunset) && (
            <span className="sun-mark" style={{ left: pct(times.sunset) }}>
              Sunset {formatMinutes(times.sunset)}
            </span>
          )}
        </div>
        <div className="sun-row sun-play">
          <button type="button" className="chip-btn" aria-pressed={playing} onClick={() => setPlaying(!playing)}>
            <PlayIcon playing={playing} />
            {playing ? 'Pause' : 'Play the day'}
          </button>
          <div
            role="radiogroup"
            aria-label="Play speed"
            className="seg seg-small"
            onKeyDown={(e) => onRadioKeys(e, [...PLAY_SPEEDS], speedIndex, setPlaySpeed)}
          >
            {PLAY_SPEEDS.map((s, i) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={playSpeed === s}
                tabIndex={i === speedIndex ? 0 : -1}
                aria-label={`${SPEED_LABEL[s]} speed`}
                title={`A whole day in ${DAY_MS / 1000 / s} s`}
                onClick={() => setPlaySpeed(s)}
              >
                {SPEED_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
        <p className="sun-status">{status}</p>
      </section>

      <section>
        <div className="sun-row">
          <label htmlFor={`${id}-date`} className="group-label">
            Date
          </label>
          <input
            id={`${id}-date`}
            className="sun-date-input"
            type="date"
            value={date}
            required
            onChange={(e) => e.target.value && setSun({ date: e.target.value })}
          />
        </div>
        <div className="chips sun-chips">
          {QUICK_DATES.map((q) => {
            const iso = `${year}-${q.md}`
            return (
              <button
                key={q.md}
                type="button"
                aria-pressed={date === iso}
                title={q.tip}
                onClick={() => setSun({ date: iso })}
              >
                {q.label}
              </button>
            )
          })}
          <button type="button" aria-pressed={date === today} onClick={() => setSun({ date: today })}>
            Today
          </button>
        </div>
      </section>

      <section className="sun-facing">
        <div>
          <h3 className="group-label" id={`${id}-facing`}>
            Balcony faces
          </h3>
          <p className="sun-hint">
            Saved with the apartment. {facingName ? `Facing ${facingName}.` : `Bearing ${Math.round(facing)}°.`}
          </p>
        </div>
        <div className="rose" role="radiogroup" aria-labelledby={`${id}-facing`}>
          {ROSE.map((c, i) =>
            c ? (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={facingName === c}
                onClick={() => setSun({ facing: compassBearing(c) })}
              >
                {c}
              </button>
            ) : (
              <label key={i} className="rose-center">
                <span className="sr-only">Bearing in degrees</span>
                <input
                  type="number"
                  min={0}
                  max={359}
                  step={5}
                  value={Math.round(facing)}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    if (Number.isFinite(v)) setSun({ facing: ((v % 360) + 360) % 360 })
                  }}
                />
                <span aria-hidden="true">°</span>
              </label>
            ),
          )}
        </div>
      </section>
      <p className="sun-hint">
        {PLACE}. <kbd>L</kbd> day or evening, <kbd>,</kbd> <kbd>.</kbd> 15 minutes.
      </p>
    </div>,
    document.body,
  )
}
