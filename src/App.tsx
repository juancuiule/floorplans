import { useEffect } from 'react'
import { useEdit } from './decor/edit'
import { mountOf } from './decor/placement'
import { useDecor } from './decor/store'
import { Scene } from './scene/Scene'
import { DecorPanel } from './ui/DecorPanel'
import { EditBar } from './ui/EditBar'
import { SpaceHud } from './ui/SpaceTools'
import { Toolbar } from './ui/Toolbar'
import { useEditShortcuts } from './ui/useEditShortcuts'

const HINTS = {
  wall: 'Click a wall to hang it',
  surface: 'Click the floor or any surface to set it down · hold Alt to skip wall snapping',
  ceiling: 'Click anywhere below the ceiling spot to hang it',
}

const INVALID_HINTS = {
  wall: 'Only walls can take this',
  surface: 'Needs a floor or a flat surface',
  ceiling: 'Point below a ceiling',
}

/** The Shift-drag rubber band over the canvas. */
function Marquee() {
  const m = useEdit((s) => s.marquee)
  if (!m) return null
  return (
    <div
      className="marquee"
      aria-hidden="true"
      style={{
        left: Math.min(m.x0, m.x1),
        top: Math.min(m.y0, m.y1),
        width: Math.abs(m.x1 - m.x0),
        height: Math.abs(m.y1 - m.y0),
      }}
    />
  )
}

export default function App() {
  const moving = useDecor((s) => (s.isDraft ? s.items.find((i) => i.id === s.movingId) : undefined))
  const invalid = useEdit((s) => s.invalid !== null)
  useEditShortcuts()
  useEffect(() => {
    const s = useDecor.getState()
    void s.load()
    void s.refreshLibrary()
  }, [])

  return (
    <div className={`app${moving ? ' placing' : ''}`}>
      <Scene />
      <Toolbar />
      <DecorPanel />
      <EditBar />
      <SpaceHud />
      <Marquee />
      {moving && (
        <div className="hint" role="status">
          {invalid ? INVALID_HINTS[mountOf(moving)] : HINTS[mountOf(moving)]} · <kbd>Esc</kbd> to cancel
        </div>
      )}
    </div>
  )
}
