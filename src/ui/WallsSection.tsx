import { useId, useState, type KeyboardEvent } from 'react'
import { useDecor } from '../decor/store'
import { structureOf } from '../model/finishes'
import { isDefaultStructure, toggleWall, type RemovableWall, type Structure } from '../model/structure'
import type { Rect, Wall } from '../model/types'
import { plan, shell } from '../project'

/** Walls that stay in every layout: exterior walls first, then partitions that carry load. */
const LOCKED_WALLS = shell.walls.filter((w) => !REMOVABLE_WALLS.includes(w.id)).map((w) => w.id)
/** Columns, beams and the like: bulges that aren't tile cladding. */
const HAS_STRUCTURE_BULGES = shell.bulges.some((b) => !b.id.startsWith('tile'))
const DROPPED = plan.droppedCeiling
const DROPPED_HEIGHT = shell.ceilings.find((c) => c.id === DROPPED?.id)?.height ?? 0
import { activeShell, REMOVABLE_WALLS, REMOVALS, useStructure, WALL_LABELS } from '../project/structure'
import { Section } from './controls'

// The Room tab's "what if" for the structure: a small plan of the flat where the
// interior partitions can be clicked out (and back), a list with the same
// toggles, and the option to raise the entry zone's dropped ceiling. Saved in
// the open layout, so A/B compares the flat with and without a wall.

const STRUCTURAL = 'Structural / exterior: can’t be removed'

/** Plan extent drawn: the open plan's walls and floors (a balcony too), with a small margin. */
const VIEW: Rect = (() => {
  const rects: Rect[] = [
    ...shell.walls.map((w) => hitRect(w, 0)),
    ...shell.baseFloors.map((f) => f.rect),
    ...shell.rooms.map((r) => r.rect),
  ]
  const m = 0.2
  return [
    Math.min(...rects.map((r) => r[0])) - m,
    Math.min(...rects.map((r) => r[1])) - m,
    Math.max(...rects.map((r) => r[2])) + m,
    Math.max(...rects.map((r) => r[3])) + m,
  ]
})()

export function WallsSection() {
  const finishes = useDecor((s) => s.finishes)
  const setFinishes = useDecor((s) => s.setFinishes)
  const ghosts = useStructure((s) => s.ghosts)
  const setGhosts = useStructure((s) => s.setGhosts)
  const [hover, setHover] = useState<RemovableWall | null>(null)
  const structure = structureOf(finishes)
  const removed = new Set<string>(structure.removedWalls)

  // Back to the flat as built: the key goes (undefined is not written to the file).
  const apply = (s: Structure) => setFinishes({ structure: isDefaultStructure(s) ? undefined : s })
  const toggle = (id: RemovableWall) => apply(toggleWall(structureOf(useDecor.getState().finishes), id, plan))

  return (
    <Section title="Walls">
      <p className="walls-intro">
        What if a wall weren’t there? Click an inner wall on the plan to take it out. Each layout keeps its own.
      </p>
      <PlanDiagram structure={structure} hover={hover} onHover={setHover} onToggle={toggle} />

      <ul className="wall-list" aria-label="Walls">
        {REMOVABLE_WALLS.map((id) => (
          <WallRow
            key={id}
            id={id}
            standing={!removed.has(id)}
            onToggle={() => toggle(id)}
            onHover={setHover}
            hover={hover === id}
          />
        ))}
        {LOCKED_WALLS.map((id) => (
          <li key={id} className="wall-row fixed" title={STRUCTURAL}>
            <span className="wall-name">{WALL_LABELS[id]}</span>
            <span className="wall-state">Structural</span>
            <SwitchButton label={WALL_LABELS[id]} checked disabled onChange={() => {}} />
          </li>
        ))}
        {HAS_STRUCTURE_BULGES && (
          <li className="wall-row fixed" title={STRUCTURAL}>
            <span className="wall-name">Columns and beams</span>
            <span className="wall-state">Structural</span>
            <SwitchButton label="Columns and beams" checked disabled onChange={() => {}} />
          </li>
        )}
      </ul>

      <div className="wall-options">
        {DROPPED && (
          <label className="check-row">
            <input
              type="checkbox"
              data-option="raise-entry-ceiling"
              checked={structure.raiseEntryCeiling}
              onChange={(e) => apply({ ...structure, raiseEntryCeiling: e.target.checked })}
            />
            <span>
              {DROPPED.label}
              <span className="hint-text">
                {' '}
                (it’s a {DROPPED_HEIGHT.toFixed(2)} dropped ceiling that hides services)
              </span>
            </span>
          </label>
        )}
        {removed.size > 0 && (
          <label className="check-row">
            <input
              type="checkbox"
              data-option="wall-ghosts"
              checked={ghosts}
              onChange={(e) => setGhosts(e.target.checked)}
            />
            <span>Outline removed walls on the floor</span>
          </label>
        )}
      </div>
      {removed.size > 0 && (
        <button type="button" className="btn" onClick={() => apply({ ...structure, removedWalls: [] })}>
          Put every wall back
        </button>
      )}
    </Section>
  )
}

function WallRow({
  id,
  standing,
  hover,
  onToggle,
  onHover,
}: {
  id: RemovableWall
  standing: boolean
  hover: boolean
  onToggle: () => void
  onHover: (id: RemovableWall | null) => void
}) {
  const noteId = useId()
  return (
    <li
      className={`wall-row${hover ? ' hover' : ''}${standing ? '' : ' removed'}`}
      data-wall={id}
      onPointerEnter={() => onHover(id)}
      onPointerLeave={() => onHover(null)}
    >
      <span className="wall-name">{REMOVALS[id].label}</span>
      <span className="wall-state">{standing ? 'Standing' : 'Removed'}</span>
      <SwitchButton label={REMOVALS[id].label} describedBy={noteId} checked={standing} onChange={onToggle} />
      <span className="wall-note" id={noteId}>
        {REMOVALS[id].note}
      </span>
    </li>
  )
}

/** On = the wall stands. */
function SwitchButton({
  label,
  checked,
  disabled,
  describedBy,
  onChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  describedBy?: string
  onChange: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={checked}
      aria-label={`${label} wall`}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={onChange}
    >
      <span className="knob" />
    </button>
  )
}

// ---------- plan diagram ----------

/** Floor-level solid spans of a wall as plan rectangles (doors and the passage leave gaps). */
function wallRects(w: Wall): Rect[] {
  const alongZ = Math.abs(w.a[0] - w.b[0]) < 1e-6
  const i = alongZ ? 1 : 0
  const lo = Math.min(w.a[i], w.b[i])
  const hi = Math.max(w.a[i], w.b[i])
  const dir = Math.sign(w.b[i] - w.a[i]) || 1
  const gaps = (w.openings ?? [])
    .filter((o) => (o.sill ?? 0) < 0.05 && o.height > 1.5)
    .map((o) => {
      const p = w.a[i] + dir * o.offset
      const q = w.a[i] + dir * (o.offset + o.width)
      return [Math.min(p, q), Math.max(p, q)] as const
    })
    .sort((p, q) => p[0] - q[0])
  const spans: [number, number][] = []
  let s = lo
  for (const [g0, g1] of gaps) {
    if (g0 > s) spans.push([s, g0])
    s = Math.max(s, g1)
  }
  if (s < hi) spans.push([s, hi])
  const t = w.thickness / 2
  return spans.map(([p, q]) => (alongZ ? [w.a[0] - t, p, w.a[0] + t, q] : [p, w.a[1] - t, q, w.a[1] + t]))
}

/** A thin strip on a wall's centerline, `offset`..`offset + width` from wall.a: a window on the plan. */
function glassRect(w: Wall, offset: number, width: number): Rect {
  const alongZ = Math.abs(w.a[0] - w.b[0]) < 1e-6
  const i = alongZ ? 1 : 0
  const dir = Math.sign(w.b[i] - w.a[i]) || 1
  const p = w.a[i] + dir * offset
  const q = w.a[i] + dir * (offset + width)
  const lo = Math.min(p, q)
  const hi = Math.max(p, q)
  return alongZ ? [w.a[0] - 0.03, lo, w.a[0] + 0.03, hi] : [lo, w.a[1] - 0.03, hi, w.a[1] + 0.03]
}

const rectProps = ([x0, z0, x1, z1]: Rect) => ({
  x: x0,
  y: z0,
  width: x1 - x0,
  height: z1 - z0,
})

/** A bigger target than a 10 cm wall: the wall's bounding box grown by `pad`. */
function hitRect(w: Wall, pad: number): Rect {
  const t = w.thickness / 2 + pad
  return [
    Math.min(w.a[0], w.b[0]) - t,
    Math.min(w.a[1], w.b[1]) - t,
    Math.max(w.a[0], w.b[0]) + t,
    Math.max(w.a[1], w.b[1]) + t,
  ]
}

function PlanDiagram({
  structure,
  hover,
  onHover,
  onToggle,
}: {
  structure: Structure
  hover: RemovableWall | null
  onHover: (id: RemovableWall | null) => void
  onToggle: (id: RemovableWall) => void
}) {
  const active = activeShell(structure)
  const removed = new Set<string>(structure.removedWalls)
  const [x0, z0, x1, z1] = VIEW
  const exterior = shell.walls.filter((w) => w.kind === 'exterior')
  const columns = shell.bulges.filter((b) => b.material !== 'tile' && b.min[1] < 0.1)
  const onKey = (e: KeyboardEvent, id: RemovableWall) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onToggle(id)
    }
  }

  return (
    <svg
      className="plan-diagram"
      viewBox={`${x0} ${z0} ${x1 - x0} ${z1 - z0}`}
      role="group"
      aria-label="Plan of the flat: click an inner wall to remove it or put it back"
    >
      {/* Floors */}
      {shell.baseFloors.map((f) => (
        <rect key={f.id} className="pd-floor" {...rectProps(f.rect)} />
      ))}
      {shell.rooms
        .filter((r) => r.floor)
        .map((r) => (
          <rect
            key={r.id}
            className={`pd-floor ${r.id === 'balcony' ? 'pd-balcony' : 'pd-wet'}`}
            {...rectProps(r.rect)}
          />
        ))}
      {active.floorFills.map((f) => (
        <rect key={f.id} className="pd-floor pd-wet" {...rectProps(f.rect)} />
      ))}

      {/* Exterior and party walls, the facade, columns: fixed. */}
      {exterior.map((w) => (
        <g key={w.id} className="pd-fixed" data-wall={w.id}>
          <title>{`${WALL_LABELS[w.id]}. ${STRUCTURAL}`}</title>
          {wallRects(w).map((r, i) => (
            <rect key={i} {...rectProps(r)} />
          ))}
          {w.openings
            ?.filter((o) => o.kind === 'window')
            .map((o) => (
              <rect key={o.id} className="pd-glass" {...rectProps(glassRect(w, o.offset, o.width))} />
            ))}
        </g>
      ))}
      {columns.map((b) => (
        <g key={b.id} className="pd-fixed">
          <title>{`${b.id === 'kitchen-pier' ? 'Kitchen pier' : 'Column'}. ${STRUCTURAL}`}</title>
          <rect {...rectProps([b.min[0], b.min[2], b.max[0], b.max[2]])} />
        </g>
      ))}

      {/* Partitions: clickable. */}
      {REMOVABLE_WALLS.map((id) => {
        const w = shell.walls.find((x) => x.id === id)!
        const gone = removed.has(id)
        const standing = active.walls.find((x) => x.id === id)
        const label = REMOVALS[id].label
        return (
          <g
            key={id}
            className={`pd-wall${gone ? ' removed' : ''}${hover === id ? ' hover' : ''}`}
            data-wall={id}
            role="switch"
            aria-checked={!gone}
            aria-label={`${label} wall`}
            tabIndex={0}
            onClick={() => onToggle(id)}
            onKeyDown={(e) => onKey(e, id)}
            onPointerEnter={() => onHover(id)}
            onPointerLeave={() => onHover(null)}
          >
            <title>{`${label}: ${gone ? 'removed. Click to put it back' : 'click to remove'}`}</title>
            <rect className="pd-hit" {...rectProps(hitRect(w, 0.14))} />
            {gone &&
              active.ghosts
                .filter((g) => g.wall === id)
                .map((g, i) => <rect key={i} className="pd-ghost" {...rectProps(g.rect)} />)}
            {standing && wallRects(standing).map((r, i) => <rect key={i} className="pd-solid" {...rectProps(r)} />)}
          </g>
        )
      })}
    </svg>
  )
}
