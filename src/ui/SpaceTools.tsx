import { useEffect } from 'react'
import { useDecor } from '../decor/store'
import { useMeasure } from '../plan/measureStore'
import { EYE_MAX, EYE_MIN, EYE_SEATED, EYE_STANDING, useView } from '../store'
import { Icon } from './icons'
import './spacetools.css'

// Tools for feeling out the space at human scale: walk through it, measure it,
// check the clearances around a piece.

/** W walks, T measures, C shows clearances. Esc, Delete and the arrows are handled with the editing keys (App). */
function useSpaceShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || e.repeat) return
      if ((e.target as HTMLElement).closest?.('input:not([type="range"]), select, textarea, [contenteditable="true"]'))
        return
      const v = useView.getState()
      const key = e.key.toLowerCase()
      // A piece following the pointer keeps the scene until it is set down or cancelled.
      const placing = useDecor.getState().movingId !== null
      // While walking, W is a step forward.
      if (key === 'w' && !v.walking && !placing) v.enterWalk()
      else if (key === 't' && !placing) v.setTool(v.tool === 'measure' ? null : 'measure')
      else if (key === 'c') v.toggleClearances()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Toolbar buttons (they sit in the Space tools group next to Dimensions). */
export function SpaceTools() {
  const walking = useView((s) => s.walking)
  const measuring = useView((s) => s.tool === 'measure')
  const clearances = useView((s) => s.clearances)
  useSpaceShortcuts()
  const v = useView.getState()
  return (
    <>
      <button
        type="button"
        aria-pressed={walking}
        data-tip="Walk through at eye level (W) · double-click the floor to start there"
        aria-keyshortcuts="W"
        onClick={() => (walking ? v.exitWalk() : v.enterWalk())}
      >
        <Icon name="walk" />
        <span className="tb-label opt">Walk</span>
      </button>
      <button
        type="button"
        aria-pressed={measuring}
        data-tip="Measure between two points (T)"
        aria-keyshortcuts="T"
        onClick={() => v.setTool(measuring ? null : 'measure')}
      >
        <Icon name="tape" />
        <span className="tb-label opt">Measure</span>
      </button>
      <button
        type="button"
        aria-pressed={clearances}
        data-tip="Clearances around the selected piece (C)"
        aria-keyshortcuts="C"
        onClick={v.toggleClearances}
      >
        <Icon name="clearance" />
        <span className="tb-label opt">Clearances</span>
      </button>
    </>
  )
}

/** Walk and measure status, bottom left of the canvas. */
export function SpaceHud() {
  const walking = useView((s) => s.walking)
  const eye = useView((s) => s.eyeHeight)
  const measuring = useView((s) => s.tool === 'measure')
  const count = useMeasure((s) => s.items.length)
  const started = useMeasure((s) => s.start !== null)
  const { setEyeHeight, exitWalk, setTool } = useView.getState()
  if (!walking && !measuring) return null
  return (
    <div className="space-hud">
      {walking && (
        <section className="walk-hud" aria-label="Walk mode">
          <div className="hud-row">
            <strong>Walking</strong>
            <button type="button" className="hud-exit" onClick={exitWalk}>
              Leave <kbd>Esc</kbd>
            </button>
          </div>
          <div className="hud-row eye">
            <label htmlFor="eye-height">Eye</label>
            <input
              id="eye-height"
              type="range"
              min={EYE_MIN}
              max={EYE_MAX}
              step={0.01}
              value={eye}
              onChange={(e) => setEyeHeight(Number(e.target.value))}
            />
            <output htmlFor="eye-height">{eye.toFixed(2)} m</output>
          </div>
          <div className="hud-row presets" role="group" aria-label="Eye height presets">
            <button
              type="button"
              aria-pressed={Math.abs(eye - EYE_STANDING) < 0.005}
              onClick={() => setEyeHeight(EYE_STANDING)}
            >
              Standing
            </button>
            <button
              type="button"
              aria-pressed={Math.abs(eye - EYE_SEATED) < 0.005}
              onClick={() => setEyeHeight(EYE_SEATED)}
            >
              Seated
            </button>
          </div>
          <p className="hud-hint">
            <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd> or arrows to move · drag to look · <kbd>Shift</kbd> to hurry · double-click the floor to jump
          </p>
        </section>
      )}
      {measuring && (
        <section className="measure-hud" aria-label="Measure">
          <div className="hud-row">
            <strong>Measure</strong>
            <button type="button" className="hud-exit" onClick={() => setTool(null)}>
              Done <kbd>Esc</kbd>
            </button>
          </div>
          <p className="hud-hint" role="status">
            {started ? 'Click the second point' : 'Click a first point'} · <kbd>Shift</kbd> keeps it straight · snaps
            within 5 cm
            {count > 0 && (
              <>
                {' '}
                · <kbd>Delete</kbd> removes the last
              </>
            )}
          </p>
        </section>
      )}
    </div>
  )
}
