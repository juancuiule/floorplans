import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { createPlan, readPlan, uploadReference, writePlan } from '../../decor/api'
import type { Plan } from '../../model/plan'
import { area, boundsOf } from '../../model/polygon'
import {
  clearArea,
  doorSwing,
  emptySketch,
  FITTINGS,
  fittingSize,
  planFromSketch,
  readSketch,
  ROOM_KINDS,
  type FittingType,
  type PlanMeta,
  type RoomKind,
  type Sketch,
} from '../../model/sketch'
import type { Rect, Vec2 } from '../../model/types'
import { validatePlan } from '../../model/validate'
import { links } from '../../project/launch'
import { Chips, Field, NumberInput, Section, Slider, Switch } from '../../ui/controls'
import { Icon, type IconName } from '../../ui/icons'
import { calibrated, OPENING_WIDTH, overlapping, resized, type Selection, type Tool } from './editing'
import { FloorplanCanvas } from './FloorplanCanvas'
import './floorplan.css'

// The floor plan editor (docs/adr/0010): draw a plan from nothing, over a
// reference image of it if there is one, or change one drawn here before. It
// looks and works like the 3D editor: tools in a floating toolbar, settings in
// the panel on the right, a hint at the bottom. Saving turns the sketch into a
// plan (planFromSketch) and opens it in 3D.

/** Cities to pick the sun from; time zones without daylight saving, as the sun model uses them. */
const PLACES: PlanMeta['location'][] = [
  { label: 'Buenos Aires', lat: -34.6037, lon: -58.3816, tz: -3 },
  { label: 'Montevideo', lat: -34.9011, lon: -56.1645, tz: -3 },
  { label: 'Santiago', lat: -33.4489, lon: -70.6693, tz: -4 },
  { label: 'São Paulo', lat: -23.5505, lon: -46.6333, tz: -3 },
  { label: 'Mexico City', lat: 19.4326, lon: -99.1332, tz: -6 },
  { label: 'New York', lat: 40.7128, lon: -74.006, tz: -5 },
  { label: 'London', lat: 51.5072, lon: -0.1276, tz: 0 },
  { label: 'Madrid', lat: 40.4168, lon: -3.7038, tz: 1 },
  { label: 'Barcelona', lat: 41.3874, lon: 2.1686, tz: 1 },
  { label: 'Berlin', lat: 52.52, lon: 13.405, tz: 1 },
  { label: 'Tokyo', lat: 35.6762, lon: 139.6503, tz: 9 },
]

const TOOLS: { id: Tool; label: string; icon: IconName; key: string }[] = [
  { id: 'select', label: 'Select', icon: 'pointer', key: 'v' },
  { id: 'room', label: 'Room', icon: 'room', key: 'r' },
  { id: 'door', label: 'Door', icon: 'door', key: 'd' },
  { id: 'window', label: 'Window', icon: 'window', key: 'w' },
  { id: 'glassDoor', label: 'Glass door', icon: 'glassDoor', key: 'g' },
  { id: 'passage', label: 'Opening', icon: 'passage', key: 'o' },
  { id: 'fitting', label: 'Fitting', icon: 'fitting', key: 'f' },
]

/** What the hint at the bottom says, per tool (and while a room is being drawn). */
function hintFor(tool: Tool, corners: number): string {
  if (tool === 'room')
    return corners
      ? 'Click the next corner · click the first corner, double-click or Enter to close · Backspace undoes a corner'
      : 'Click each corner of the room, or drag to draw a rectangle · edges snap to other rooms so they share a wall'
  if (tool === 'select')
    return 'Drag a room to move it · drag a corner or an edge dot to reshape it · drag the grid to pan'
  if (tool === 'fitting') return 'Click to place it · R turns the selected fitting'
  if (tool === 'reference') return 'Drag the reference image into place under your drawing'
  if (tool === 'calibrate') return 'Click both ends of a length you know on the reference image, e.g. a wall'
  return 'Click a wall to put it there · drag it along its wall to move it'
}

export function FloorplanEditorPage({ space, plan: planId }: { space: string; plan: string | null }) {
  const [sketch, setSketch] = useState<Sketch | null>(planId ? null : emptySketch())
  const [name, setName] = useState('My apartment')
  const [place, setPlace] = useState(PLACES[0])
  const [tool, setTool] = useState<Tool>('room')
  const [fittingType, setFittingType] = useState<FittingType>('toilet')
  const [selection, setSelection] = useState<Selection>(null)
  const [corners, setCorners] = useState(0)
  const [measured, setMeasured] = useState<{ a: Vec2; b: Vec2; meters: number } | null>(null)
  const [fitNonce, setFitNonce] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const past = useRef<Sketch[]>([])
  const future = useRef<Sketch[]>([])
  const committed = useRef<Sketch | null>(planId ? null : emptySketch())
  const [history, setHistory] = useState({ undo: false, redo: false })
  const fileInput = useRef<HTMLInputElement>(null)

  // An existing plan opens with what was drawn for it.
  useEffect(() => {
    if (!planId) return
    readPlan(space, planId).then(
      (raw) => {
        const p = raw as Plan
        if (!p.sketch) return setError('This plan was not drawn here, so it cannot be edited here.')
        const s = readSketch(p.sketch as Parameters<typeof readSketch>[0])
        setSketch(s)
        committed.current = s
        setName(p.name)
        setPlace(
          PLACES.find((x) => x.label === p.location.label) ?? { ...p.location, label: p.location.label ?? 'Here' },
        )
        setTool('select')
        setFitNonce((n) => n + 1)
      },
      (e) => setError(e instanceof Error ? e.message : String(e)),
    )
  }, [space, planId])

  const syncHistory = () => setHistory({ undo: past.current.length > 0, redo: future.current.length > 0 })

  const change = useCallback((next: Sketch, commit: boolean) => {
    setSketch(next)
    if (!commit) return
    if (committed.current && committed.current !== next) past.current.push(committed.current)
    committed.current = next
    future.current = []
    setHistory({ undo: past.current.length > 0, redo: false })
  }, [])

  const undo = useCallback(() => {
    const prev = past.current.pop()
    if (!prev || !committed.current) return
    future.current.push(committed.current)
    committed.current = prev
    setSketch(prev)
    setSelection(null)
    syncHistory()
  }, [])

  const redo = useCallback(() => {
    const next = future.current.pop()
    if (!next || !committed.current) return
    past.current.push(committed.current)
    committed.current = next
    setSketch(next)
    setSelection(null)
    syncHistory()
  }, [])

  const preview = useMemo(() => {
    if (!sketch?.rooms.some((r) => r.kind !== 'balcony')) return null
    try {
      return planFromSketch(sketch, { id: planId ?? 'new', name, location: place })
    } catch {
      return null
    }
  }, [sketch, planId, name, place])

  const problems = useMemo(() => {
    if (!sketch) return []
    const out: string[] = []
    if (!sketch.rooms.some((r) => r.kind !== 'balcony')) out.push('Draw at least one room.')
    if (overlapping(sketch.rooms).length)
      out.push('Some rooms overlap (shown in red). Rooms may share edges, not floor.')
    if (preview && !preview.shell.walls.some((w) => w.openings?.some((o) => o.kind === 'door')))
      out.push('There is no door yet: walk mode starts at the front door.')
    if (preview) out.push(...validatePlan(preview))
    return out
  }, [sketch, preview])
  const blocking = problems.filter((p) => !p.startsWith('There is no door'))

  const deleteSelection = useCallback(() => {
    if (!sketch || !selection) return
    const without = <T extends { id: string }>(list: T[]) => list.filter((x) => x.id !== selection.id)
    change(
      {
        ...sketch,
        rooms: without(sketch.rooms),
        openings: without(sketch.openings),
        fittings: without(sketch.fittings),
      },
      true,
    )
    setSelection(null)
  }, [sketch, selection, change])

  // Keys: tools by letter, delete, turn a fitting, undo and redo, Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input, select, textarea') || !sketch) return
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      if (mod && key === 'z') {
        e.preventDefault()
        return e.shiftKey ? redo() : undo()
      }
      if (mod) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection) {
        e.preventDefault()
        return deleteSelection()
      }
      if (key === 'r' && selection?.kind === 'fitting') {
        return change(
          {
            ...sketch,
            fittings: sketch.fittings.map((f) =>
              f.id === selection.id ? { ...f, rotation: (f.rotation + 90) % 360 } : f,
            ),
          },
          true,
        )
      }
      if (e.key === 'Escape') {
        setSelection(null)
        return setTool('select')
      }
      const t = TOOLS.find((x) => x.key === key)
      if (t) setTool(t.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sketch, selection, change, undo, redo, deleteSelection])

  const save = async () => {
    if (!sketch || !preview || blocking.length) return
    setSaving(true)
    setError(null)
    try {
      const id = planId
        ? (await writePlan(space, planId, planFromSketch(sketch, { id: planId, name, location: place })), planId)
        : await createPlan(space, { name, plan: preview })
      window.location.href = links.plan(space, id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  // ---------- reference image ----------

  const addReference = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !sketch) return
    setError(null)
    try {
      const img = await uploadReference(space, file)
      const size = await imageSize(img.url)
      // Until it is calibrated, show it about 10 m wide where the drawing is.
      const scale = 10 / size[0]
      const origin: Vec2 = sketch.rooms.length ? (boundsOf(sketch.rooms[0].points).slice(0, 2) as Vec2) : [0, 0]
      change(
        { ...sketch, reference: { url: img.url, width: size[0], height: size[1], origin, scale, opacity: 0.5 } },
        true,
      )
      setFitNonce((n) => n + 1)
      setTool('calibrate')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  const setReference = (patch: Partial<NonNullable<Sketch['reference']>>, commit = true) =>
    sketch?.reference && change({ ...sketch, reference: { ...sketch.reference, ...patch } }, commit)
  const onMeasured = useCallback((a: Vec2, b: Vec2) => {
    setMeasured({ a, b, meters: Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) * 100) / 100 })
  }, [])
  const applyScale = () => {
    if (!sketch?.reference || !measured) return
    change({ ...sketch, reference: calibrated(sketch.reference, measured.a, measured.b, measured.meters) }, true)
    setMeasured(null)
    setTool('room')
    setFitNonce((n) => n + 1)
  }

  const room = selection?.kind === 'room' ? sketch?.rooms.find((r) => r.id === selection.id) : undefined
  const opening = selection?.kind === 'opening' ? sketch?.openings.find((o) => o.id === selection.id) : undefined
  const fitting = selection?.kind === 'fitting' ? sketch?.fittings.find((f) => f.id === selection.id) : undefined
  const patch = <K extends 'rooms' | 'openings' | 'fittings'>(key: K, id: string, p: Partial<Sketch[K][number]>) =>
    sketch &&
    change({ ...sketch, [key]: (sketch[key] as { id: string }[]).map((x) => (x.id === id ? { ...x, ...p } : x)) }, true)
  const toolIndex = TOOLS.findIndex((t) => t.id === tool)

  return (
    <div className="app fp-app">
      {sketch ? (
        <FloorplanCanvas
          sketch={sketch}
          preview={preview}
          tool={tool}
          fittingType={fittingType}
          selection={selection}
          onChange={change}
          onSelect={setSelection}
          onDrawing={setCorners}
          onMeasured={onMeasured}
          fitNonce={fitNonce}
        />
      ) : (
        <div className="fp-canvas" />
      )}

      <div className="toolbar">
        <a className="title" href={links.space(space)} title="All plans in this space">
          <h1>
            <span aria-hidden="true">‹ </span>
            {name || 'Floor plan'}
          </h1>
          <span>{planId ? 'Editing the floor plan' : 'New floor plan'}</span>
        </a>
        <div className="tb-main">
          <div className="group" role="radiogroup" aria-label="Tool">
            {TOOLS.map((t, i) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={tool === t.id}
                tabIndex={i === Math.max(0, toolIndex) ? 0 : -1}
                data-tip={`${t.label} (${t.key.toUpperCase()})`}
                aria-keyshortcuts={t.key.toUpperCase()}
                onClick={() => setTool(t.id)}
              >
                <Icon name={t.icon} />
                <span className="tb-label mid">{t.label}</span>
              </button>
            ))}
          </div>
          <div className="group" role="group" aria-label="History and view">
            <button type="button" aria-disabled={!history.undo} data-tip="Undo (⌘Z)" aria-label="Undo" onClick={undo}>
              <Icon name="undo" />
            </button>
            <button type="button" aria-disabled={!history.redo} data-tip="Redo (⇧⌘Z)" aria-label="Redo" onClick={redo}>
              <Icon name="redo" />
            </button>
            <button
              type="button"
              data-tip="Fit the drawing"
              aria-label="Fit the drawing"
              onClick={() => setFitNonce((n) => n + 1)}
            >
              <Icon name="fit" />
            </button>
          </div>
        </div>
      </div>

      <aside className="panel fp-panel" aria-label="Floor plan">
        <div className="panel-body">
          {error && (
            <p className="banner" role="status">
              <Icon name="alert" size={14} />
              {error}
            </p>
          )}

          {room && (
            <Section title="Room">
              <Field label="Name">
                <input
                  className="text-input"
                  value={room.name}
                  placeholder={ROOM_KINDS.find((k) => k.id === room.kind)!.label}
                  onChange={(e) => patch('rooms', room.id, { name: e.target.value })}
                />
              </Field>
              <Field label="Kind">
                <Chips<RoomKind>
                  value={room.kind}
                  options={ROOM_KINDS}
                  onChange={(kind) => patch('rooms', room.id, { kind })}
                />
              </Field>
              {room.points.length === 4 && (
                <RoomSize
                  points={room.points}
                  inner={preview?.shell.rooms.find((p) => p.id === room.id)?.rect}
                  onChange={(size) => patch('rooms', room.id, { points: resized(room.points, ...size) })}
                />
              )}
              <p className="note">
                {(preview ? clearArea(preview, room) : area(room.points)).toFixed(1)} m² between the walls ·{' '}
                {room.points.length} corners. The kind picks the floor; a balcony gets railings instead of walls.
              </p>
              <div className="actions">
                <button type="button" className="btn danger" onClick={deleteSelection} aria-keyshortcuts="Delete">
                  <Icon name="trash" size={14} /> Delete room
                </button>
              </div>
            </Section>
          )}
          {opening && (
            <Section title={TOOLS.find((t) => t.id === opening.kind)!.label}>
              <Field label="Width">
                <NumberInput
                  name="width"
                  value={opening.width}
                  min={0.5}
                  max={4}
                  step={0.05}
                  unit="m"
                  onChange={(width) => patch('openings', opening.id, { width })}
                />
              </Field>
              <p className="note">Drag it along its wall. New ones are {OPENING_WIDTH[opening.kind]} m wide.</p>
              {opening.kind === 'door' && preview && (
                <div className="actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      const now = doorSwing(opening, sketch!.rooms, openingAlongX(preview, opening.id))
                      patch('openings', opening.id, { hinge: now.hinge === 'lo' ? 'hi' : 'lo' })
                    }}
                  >
                    Hinge on the other side
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      const now = doorSwing(opening, sketch!.rooms, openingAlongX(preview, opening.id))
                      patch('openings', opening.id, { opens: now.opens === 1 ? -1 : 1 })
                    }}
                  >
                    Open the other way
                  </button>
                </div>
              )}
              <div className="actions">
                <button type="button" className="btn danger" onClick={deleteSelection} aria-keyshortcuts="Delete">
                  <Icon name="trash" size={14} /> Delete
                </button>
              </div>
            </Section>
          )}
          {fitting && (
            <Section title={FITTINGS[fitting.type].label}>
              <Field label="Width">
                <NumberInput
                  name="fitting width"
                  value={fittingSize(fitting)[0]}
                  min={0.2}
                  max={4}
                  step={0.05}
                  unit="m"
                  onChange={(w) => patch('fittings', fitting.id, { size: [w, fittingSize(fitting)[2]] })}
                />
              </Field>
              <Field label="Depth">
                <NumberInput
                  name="fitting depth"
                  value={fittingSize(fitting)[2]}
                  min={0.2}
                  max={2}
                  step={0.05}
                  unit="m"
                  onChange={(d) => patch('fittings', fitting.id, { size: [fittingSize(fitting)[0], d] })}
                />
              </Field>
              <p className="note">Drag to move it, R to turn it ({fitting.rotation}°).</p>
              <div className="actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => patch('fittings', fitting.id, { rotation: (fitting.rotation + 90) % 360 })}
                >
                  Turn 90°
                </button>
                <button type="button" className="btn danger" onClick={deleteSelection} aria-keyshortcuts="Delete">
                  <Icon name="trash" size={14} /> Delete
                </button>
              </div>
            </Section>
          )}
          {tool === 'fitting' && (
            <Section title="Fitting to place">
              <Field label="Fitting to place">
                <Chips<FittingType>
                  value={fittingType}
                  options={(Object.keys(FITTINGS) as FittingType[]).map((f) => ({ id: f, label: FITTINGS[f].label }))}
                  onChange={setFittingType}
                />
              </Field>
            </Section>
          )}

          <Section title="Plan">
            <Field label="Name">
              <input className="text-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="City, for the sun">
              <select
                className="select"
                value={place.label}
                onChange={(e) => setPlace(PLACES.find((p) => p.label === e.target.value) ?? place)}
              >
                {!PLACES.some((p) => p.label === place.label) && <option>{place.label}</option>}
                {PLACES.map((p) => (
                  <option key={p.label}>{p.label}</option>
                ))}
              </select>
            </Field>
            {sketch && (
              <Field label="Ceiling height">
                <NumberInput
                  name="ceiling height"
                  value={sketch.height}
                  min={2.2}
                  max={4}
                  step={0.05}
                  unit="m"
                  onChange={(height) => change({ ...sketch, height }, true)}
                />
              </Field>
            )}
          </Section>

          <Section title="Reference image">
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={addReference}
              aria-label="Reference image file"
            />
            {!sketch?.reference ? (
              <>
                <p className="note">
                  Trace over a picture of the floor plan: a listing’s plan, a scan or a photo taken square on.
                </p>
                <div className="actions">
                  <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
                    <Icon name="upload" size={14} /> Add an image
                  </button>
                </div>
              </>
            ) : (
              <>
                <Switch
                  label="Show the image"
                  checked={!sketch.reference.hidden}
                  onChange={(v) => setReference({ hidden: !v })}
                />
                <Field label="Opacity" value={`${Math.round(sketch.reference.opacity * 100)}%`}>
                  <Slider
                    value={sketch.reference.opacity}
                    min={0.1}
                    max={1}
                    step={0.05}
                    format={(v) => `${Math.round(v * 100)}%`}
                    onChange={(opacity) => setReference({ opacity }, false)}
                  />
                </Field>
                {measured ? (
                  <Field label="That length is">
                    <div className="fp-calibrate">
                      <NumberInput
                        name="length"
                        value={measured.meters}
                        min={0.1}
                        max={100}
                        step={0.05}
                        unit="m"
                        onChange={(meters) => setMeasured({ ...measured, meters })}
                      />
                      <button type="button" className="btn fp-primary" onClick={applyScale}>
                        Set scale
                      </button>
                    </div>
                  </Field>
                ) : (
                  <p className="note">
                    {tool === 'calibrate'
                      ? 'Click both ends of a length you know on the image.'
                      : `1 m on the drawing is ${Math.round(1 / sketch.reference.scale)} px of the image.`}
                  </p>
                )}
                <div className="actions">
                  <button
                    type="button"
                    className="btn"
                    aria-pressed={tool === 'calibrate'}
                    onClick={() => setTool(tool === 'calibrate' ? 'select' : 'calibrate')}
                  >
                    <Icon name="ruler" size={14} /> Set scale
                  </button>
                  <button
                    type="button"
                    className="btn"
                    aria-pressed={tool === 'reference'}
                    onClick={() => setTool(tool === 'reference' ? 'select' : 'reference')}
                  >
                    <Icon name="move" size={14} /> Move
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => sketch && change({ ...sketch, reference: undefined }, true)}
                  >
                    <Icon name="trash" size={14} /> Remove
                  </button>
                </div>
              </>
            )}
          </Section>

          {problems.length > 0 && (
            <ul className="fp-problems" aria-label="Problems">
              {problems.slice(0, 5).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="fp-footer">
          <button
            type="button"
            className="btn fp-primary"
            onClick={save}
            disabled={!preview || blocking.length > 0 || saving}
          >
            {planId ? 'Save and open in 3D' : 'Create and open in 3D'}
          </button>
        </div>
      </aside>

      <div className="hint" role="status">
        {hintFor(tool, corners)}
      </div>
    </div>
  )
}

/**
 * A rectangular room's width (x) and depth (z), typed in: its clear size
 * between the walls, as a listing gives it. The far sides move; `onChange`
 * gets the size on the drawing's lines (centerlines, or faces of outer walls).
 */
function RoomSize({
  points,
  inner,
  onChange,
}: {
  points: Vec2[]
  inner?: Rect
  onChange: (size: [number, number]) => void
}) {
  const [x0, z0, x1, z1] = boundsOf(points)
  const [i0, j0, i1, j1] = inner ?? [x0, z0, x1, z1]
  const cm = (v: number) => Math.round(v * 100) / 100
  // What the walls take off each way.
  const [tw, td] = [x1 - x0 - (i1 - i0), z1 - z0 - (j1 - j0)]
  const [w, d] = [cm(i1 - i0), cm(j1 - j0)]
  return (
    <>
      <Field label="Width">
        <NumberInput
          name="room width"
          value={w}
          min={0.5}
          max={30}
          step={0.05}
          unit="m"
          onChange={(v) => onChange([cm(v + tw), cm(d + td)])}
        />
      </Field>
      <Field label="Depth">
        <NumberInput
          name="room depth"
          value={d}
          min={0.5}
          max={30}
          step={0.05}
          unit="m"
          onChange={(v) => onChange([cm(w + tw), cm(v + td)])}
        />
      </Field>
    </>
  )
}

/** Whether an opening sits in a wall along x, in the plan the sketch makes. */
function openingAlongX(plan: Plan, id: string): boolean {
  const wall = plan.shell.walls.find((w) => w.openings?.some((o) => o.id === id))
  return !!wall && wall.a[1] === wall.b[1]
}

/** An image's natural size in pixels. */
function imageSize(url: string): Promise<[number, number]> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve([img.naturalWidth, img.naturalHeight])
    img.onerror = () => reject(new Error('That image could not be opened'))
    img.src = url
  })
}
