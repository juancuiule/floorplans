import { useEffect, useMemo, useState } from 'react'
import { paintFace } from '../decor/paint'
import { useDecor } from '../decor/store'
import { ACCENTS, PAINTS } from '../project/finishes'
import { paintFaces, type PaintFace } from '../project/paintFaces'
import { useActiveShell, WALL_LABELS } from '../project/structure'
import { Field, Section, Swatches } from './controls'
import { Icon } from './icons'
import './paint.css'
import { useEdit } from '../decor/edit'

// Wall colors: a base color for every wall, the ceiling, and each side of each
// wall on its own (split by the room it faces). Faces can be painted from the
// list or with the brush, clicking walls in the scene.

/** Every color on offer: the soft paints first, then the stronger accents. */
const PALETTE = [...PAINTS, ...ACCENTS.filter((a) => !PAINTS.some((p) => p.color === a.color))]
const CEILINGS = [{ label: 'Ceiling white', color: '#f7f6f2' }, ...PAINTS]

const nameOf = (color: string) => PALETTE.find((p) => p.color === color)?.label ?? 'Custom'

const setBrush = (paintBrush: string | null) => useEdit.getState().set({ paintBrush })
export function PaintSection() {
  const f = useDecor((s) => s.finishes)
  const set = useDecor((s) => s.setFinishes)
  const { walls } = useActiveShell()
  const faces = useMemo(() => paintFaces(walls), [walls])
  const rooms = useMemo(() => {
    const by = new Map<string, { name: string; faces: PaintFace[] }>()
    for (const face of faces) {
      const r = by.get(face.room) ?? { name: face.roomName, faces: [] }
      r.faces.push(face)
      by.set(face.room, r)
    }
    // The rooms with the most wall first: the main room leads.
    const length = (r: { faces: PaintFace[] }) => r.faces.reduce((t, x) => t + x.s1 - x.s0, 0)
    return [...by.values()].sort((a, b) => length(b) - length(a))
  }, [faces])
  const painted = faces.filter((x) => f.paint[x.id]).length
  const brush = useEdit((s) => s.paintBrush)
  const [open, setOpen] = useState<string | null>(null)

  // Esc puts the brush down; leaving the Room tab does too.
  useEffect(() => {
    if (brush === null) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBrush(null)
    }
    window.addEventListener('keydown', key)
    document.body.dataset.brush = ''
    return () => {
      window.removeEventListener('keydown', key)
      delete document.body.dataset.brush
    }
  }, [brush])
  useEffect(() => () => setBrush(null), [])

  return (
    <Section title="Paint">
      <Field label="All walls" value={nameOf(f.wallPaint)}>
        <Swatches value={f.wallPaint} colors={PAINTS} onChange={(wallPaint) => set({ wallPaint })} />
      </Field>
      <Field label="Ceiling" value={CEILINGS.find((p) => p.color === f.ceilingPaint)?.label ?? 'Custom'}>
        <Swatches value={f.ceilingPaint} colors={CEILINGS} onChange={(ceilingPaint) => set({ ceilingPaint })} />
      </Field>

      <div className="paint-brush" data-on={brush !== null || undefined}>
        <button
          type="button"
          className="btn"
          aria-pressed={brush !== null}
          onClick={() => setBrush(brush === null ? (PALETTE[7]?.color ?? '#9fae95') : null)}
        >
          <Icon name="brush" size={15} />
          {brush === null ? 'Paint walls by clicking' : 'Done painting'}
        </button>
        {brush !== null && (
          <>
            <p className="hint-text">Click a wall in the room to paint that side. Esc when you’re done.</p>
            <Field label="Brush" value={brush === 'base' ? 'Base color (erase)' : nameOf(brush)}>
              <Swatches value={brush === 'base' ? f.wallPaint : brush} colors={PALETTE} onChange={setBrush} />
              <button
                type="button"
                className="btn ghost small"
                aria-pressed={brush === 'base'}
                onClick={() => setBrush('base')}
              >
                Erase (back to the base color)
              </button>
            </Field>
          </>
        )}
      </div>

      <div className="paint-faces">
        <div className="paint-faces-head">
          <span className="label">Wall by wall</span>
          {painted > 0 && (
            <button type="button" className="btn ghost small" onClick={() => set({ paint: {} })}>
              Reset {painted} {painted === 1 ? 'wall' : 'walls'}
            </button>
          )}
        </div>
        {rooms.map((room) => (
          <div key={room.name} className="paint-room" role="group" aria-label={room.name}>
            <span className="paint-room-name">{room.name}</span>
            <ul>
              {room.faces.map((face) => {
                const color = f.paint[face.id]
                const label = WALL_LABELS[face.wall] ?? face.wall
                const expanded = open === face.id
                return (
                  <li key={face.id} className="paint-face" data-face={face.id}>
                    <button
                      type="button"
                      className="paint-face-row"
                      aria-expanded={expanded}
                      onClick={() => setOpen(expanded ? null : face.id)}
                    >
                      <span
                        className="paint-chip"
                        style={{ background: color ?? f.wallPaint }}
                        data-base={!color || undefined}
                      />
                      <span className="paint-face-name">{label}</span>
                      <span className="paint-face-value">{color ? nameOf(color) : 'Base'}</span>
                    </button>
                    {expanded && (
                      <div className="paint-face-edit">
                        <Swatches
                          value={color ?? f.wallPaint}
                          colors={PALETTE}
                          onChange={(c) => paintFace(face.id, c)}
                        />
                        {color && (
                          <button type="button" className="btn ghost small" onClick={() => paintFace(face.id, null)}>
                            Use the base color
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  )
}
