import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Plan } from '../../model/plan'
import { area, boundsOf, edgesOf, rectangles } from '../../model/polygon'
import {
  clearArea,
  doorSwing,
  FITTINGS,
  fittingSize,
  ROOM_KINDS,
  type FittingType,
  type OpeningKind,
  type Sketch,
  type SketchRoom,
} from '../../model/sketch'
import type { Rect, Vec2 } from '../../model/types'
import {
  closeGaps,
  closeOutline,
  EDGE_SNAP,
  edgeLines,
  extent,
  freshId,
  moveCorner,
  moveEdge,
  OPENING_WIDTH,
  openingSpot,
  overlapping,
  rectFrom,
  round,
  roomAt,
  snap,
  snapPoint,
  squareTo,
  toGrid,
  TRACE_SNAP,
  type Selection,
  type Tool,
} from './editing'

// The drawing surface of the floor plan editor: an SVG in plan meters (x right,
// z down, like the 3D app's top view), over an optional reference image. Rooms
// are drawn and reshaped here; the walls shown are the ones planFromSketch()
// builds from them, so what you see is what the 3D plan gets.

const KIND_FILL: Record<SketchRoom['kind'], string> = {
  living: '#efe6d6',
  bedroom: '#e9e1ef',
  kitchen: '#e2ecdf',
  bath: '#dde8ee',
  hall: '#ece9e2',
  balcony: '#e9ebe6',
}

const OPENING_COLOR: Record<OpeningKind, string> = {
  door: '#b07a3f',
  window: '#3b82c4',
  glassDoor: '#5aa7d6',
  passage: '#8a857c',
}

type Drag =
  | { type: 'draw'; from: Vec2; to: Vec2; moved: boolean }
  | { type: 'move'; id: string; grab: Vec2; start: Sketch }
  | { type: 'corner'; id: string; i: number; start: Vec2[] }
  | { type: 'edge'; id: string; i: number; start: Vec2[] }
  | { type: 'fitting'; id: string; grab: Vec2 }
  | { type: 'opening'; id: string }
  | { type: 'reference'; grab: Vec2; origin: Vec2 }
  | { type: 'pan'; client: Vec2; view: Rect }

interface Props {
  sketch: Sketch
  /** The plan the sketch makes now, or null when it cannot make one yet. */
  preview: Plan | null
  tool: Tool
  fittingType: FittingType
  selection: Selection
  /** A change; `commit` is false while a drag is still going (one undo step per gesture). */
  onChange: (sketch: Sketch, commit: boolean) => void
  onSelect: (s: Selection) => void
  /** Corners clicked so far while drawing a room (for the hint). */
  onDrawing: (corners: number) => void
  /** The two ends of a known length, measured on the reference image. */
  onMeasured: (a: Vec2, b: Vec2) => void
  /** Bumped to frame the drawing again. */
  fitNonce: number
}

export function FloorplanCanvas(props: Props) {
  const { sketch, preview, tool, fittingType, selection, onChange, onSelect, onDrawing, onMeasured, fitNonce } = props
  const svg = useRef<SVGSVGElement>(null)
  const [view, setView] = useState<Rect>(() => framed(sketch))
  const [drag, setDrag] = useState<Drag | null>(null)
  const [hover, setHover] = useState<Vec2 | null>(null)
  /** Corners of the room being drawn, click by click. */
  const [outline, setOutline] = useState<Vec2[]>([])
  /** The first end of a length being measured on the reference image. */
  const [measureFrom, setMeasureFrom] = useState<Vec2 | null>(null)
  const bad = new Set(overlapping(sketch.rooms))
  // Tracing over an image, edges pull less: the image's lines are what to follow.
  const reach = sketch.reference && !sketch.reference.hidden ? TRACE_SNAP : EDGE_SNAP

  // Fit on request (the toolbar's Fit button).
  const sketchRef = useRef(sketch)
  useEffect(() => {
    sketchRef.current = sketch
  })
  useEffect(() => {
    setView(framed(sketchRef.current, svg.current))
  }, [fitNonce])

  // Changing tools drops what was half done.
  const [lastTool, setLastTool] = useState(tool)
  if (tool !== lastTool) {
    setLastTool(tool)
    setOutline([])
    setMeasureFrom(null)
  }
  useEffect(() => onDrawing(outline.length), [outline.length, onDrawing])

  /** Plan meters under a pointer event. */
  const at = (e: { clientX: number; clientY: number }): Vec2 => {
    const m = svg.current!.getScreenCTM()!.inverse()
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m)
    return [p.x, p.y]
  }

  // Wheel zooms around the pointer.
  useEffect(() => {
    const el = svg.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const m = el.getScreenCTM()!.inverse()
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m)
      const k = Math.exp(e.deltaY * 0.0015)
      setView(([x, z, w, h]) => {
        const nw = Math.min(80, Math.max(2, w * k))
        const nh = (nw / w) * h
        return [p.x - ((p.x - x) * nw) / w, p.y - ((p.y - z) * nh) / h, nw, nh]
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const addRoom = (points: Vec2[]) => {
    const id = freshId('room')
    const kind = sketch.rooms.length === 0 ? 'living' : 'bedroom'
    // Traced along the inside of the walls, it meets its neighbors halfway across the wall between them.
    const rooms = closeGaps([...sketch.rooms, { id, name: '', kind, points }], id)
    onChange({ ...sketch, rooms }, true)
    onSelect({ kind: 'room', id })
  }

  const finishOutline = (corners = outline) => {
    const points = closeOutline(corners)
    setOutline([])
    if (points) addRoom(points)
  }

  // Keys while drawing a room: Enter closes it, Backspace takes the last corner back, Esc drops it.
  useEffect(() => {
    if (!outline.length) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input, select, textarea')) return
      if (e.key === 'Enter') finishOutline()
      else if (e.key === 'Backspace') setOutline((o) => o.slice(0, -1))
      else if (e.key === 'Escape') setOutline([])
      else return
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const update = (patch: Partial<Sketch>, commit: boolean) => onChange({ ...sketch, ...patch }, commit)
  const setPoints = (id: string, points: Vec2[], base = sketch): Sketch => ({
    ...base,
    rooms: base.rooms.map((r) => (r.id === id ? { ...r, points } : r)),
  })

  /** Where the next corner goes while drawing: squared to the last one, snapped to other rooms. */
  const nextCorner = (p: Vec2): Vec2 => {
    const s = snapPoint(p, edgeLines(sketch.rooms), reach)
    if (!outline.length) return s
    const sq = squareTo(outline[outline.length - 1], s)
    // Near the first corner's lines? Line up with them, so the outline closes square.
    const first = outline[0]
    return [Math.abs(sq[0] - first[0]) < 0.15 ? first[0] : sq[0], Math.abs(sq[1] - first[1]) < 0.15 ? first[1] : sq[1]]
  }

  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    const p = at(e)
    svg.current!.setPointerCapture(e.pointerId)
    if (tool === 'room') {
      const start = nextCorner(p)
      return setDrag({ type: 'draw', from: start, to: start, moved: false })
    }
    if (tool === 'calibrate') {
      if (!measureFrom) return setMeasureFrom(p)
      onMeasured(measureFrom, p)
      return setMeasureFrom(null)
    }
    if (tool === 'reference') {
      if (sketch.reference) setDrag({ type: 'reference', grab: p, origin: sketch.reference.origin })
      else setDrag({ type: 'pan', client: [e.clientX, e.clientY], view })
      return
    }
    if (tool === 'fitting') {
      const id = freshId('fit')
      update(
        { fittings: [...sketch.fittings, { id, type: fittingType, at: [toGrid(p[0]), toGrid(p[1])], rotation: 0 }] },
        true,
      )
      return onSelect({ kind: 'fitting', id })
    }
    if (tool !== 'select') {
      const spot = openingSpot(sketch.rooms, p, OPENING_WIDTH[tool])
      if (!spot) return
      const id = freshId('opening')
      update({ openings: [...sketch.openings, { id, kind: tool, at: spot, width: OPENING_WIDTH[tool] }] }, true)
      return onSelect({ kind: 'opening', id })
    }
    const room = roomAt(sketch.rooms, p)
    if (room) {
      onSelect({ kind: 'room', id: room.id })
      return setDrag({ type: 'move', id: room.id, grab: p, start: sketch })
    }
    onSelect(null)
    setDrag({ type: 'pan', client: [e.clientX, e.clientY], view })
  }

  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const p = at(e)
    setHover(p)
    if (!drag) return
    if (drag.type === 'pan') {
      const r = svg.current!.getBoundingClientRect()
      const k = Math.max(drag.view[2] / r.width, drag.view[3] / r.height)
      setView([
        drag.view[0] - (e.clientX - drag.client[0]) * k,
        drag.view[1] - (e.clientY - drag.client[1]) * k,
        drag.view[2],
        drag.view[3],
      ])
      return
    }
    if (drag.type === 'draw') {
      // Dragging (rather than clicking) draws a rectangle in one go.
      const to = snapPoint(p, edgeLines(sketch.rooms), reach)
      const moved = drag.moved || Math.hypot(to[0] - drag.from[0], to[1] - drag.from[1]) >= 0.3
      return setDrag({ ...drag, to, moved: moved && outline.length === 0 })
    }
    if (drag.type === 'reference' && sketch.reference) {
      const origin: Vec2 = [round(drag.origin[0] + p[0] - drag.grab[0]), round(drag.origin[1] + p[1] - drag.grab[1])]
      return update({ reference: { ...sketch.reference, origin } }, false)
    }
    if (drag.type === 'move') {
      const room = drag.start.rooms.find((r) => r.id === drag.id)!
      const lines = edgeLines(drag.start.rooms, drag.id)
      // Snap whichever corner lands nearest another room's corner line, else the grid.
      const dx = bestShift(
        room.points.map((q) => q[0]),
        p[0] - drag.grab[0],
        lines.x,
      )
      const dz = bestShift(
        room.points.map((q) => q[1]),
        p[1] - drag.grab[1],
        lines.z,
      )
      return onChange(moveRoom(drag.start, drag.id, dx, dz), false)
    }
    if (drag.type === 'corner') {
      const to = snapPoint(p, edgeLines(sketch.rooms, drag.id), reach)
      return onChange(setPoints(drag.id, moveCorner(drag.start, drag.i, to)), false)
    }
    if (drag.type === 'edge') {
      const [a, b] = [drag.start[drag.i], drag.start[(drag.i + 1) % drag.start.length]]
      const lines = edgeLines(sketch.rooms, drag.id)
      const alongX = Math.abs(a[1] - b[1]) < 1e-6
      const line = alongX ? snap(p[1], lines.z, reach) : snap(p[0], lines.x, reach)
      return onChange(setPoints(drag.id, moveEdge(drag.start, drag.i, line)), false)
    }
    if (drag.type === 'fitting') {
      const to: Vec2 = [toGrid(p[0] - drag.grab[0]), toGrid(p[1] - drag.grab[1])]
      return update({ fittings: sketch.fittings.map((f) => (f.id === drag.id ? { ...f, at: to } : f)) }, false)
    }
    if (drag.type === 'opening') {
      const o = sketch.openings.find((x) => x.id === drag.id)!
      const spot = openingSpot(sketch.rooms, p, o.width)
      if (spot) update({ openings: sketch.openings.map((x) => (x.id === o.id ? { ...x, at: spot } : x)) }, false)
    }
  }

  const onUp = () => {
    if (drag?.type === 'draw') {
      if (drag.moved) addRoom(rectFrom(drag.from, drag.to))
      else {
        // A click: the next corner of the room being drawn; on the first corner, close it.
        const first = outline[0]
        const last = outline[outline.length - 1]
        if (first && outline.length >= 3 && Math.hypot(drag.from[0] - first[0], drag.from[1] - first[1]) < 0.2)
          finishOutline()
        else if (!last || drag.from[0] !== last[0] || drag.from[1] !== last[1]) setOutline([...outline, drag.from])
      }
    } else if (drag?.type === 'corner' || drag?.type === 'edge') {
      onChange({ ...sketch, rooms: closeGaps(sketch.rooms, drag.id) }, true)
    } else if (drag && drag.type !== 'pan') onChange(sketch, true)
    setDrag(null)
  }

  const startDrag = (e: ReactPointerEvent, d: Drag, sel: Selection) => {
    if (tool !== 'select' || e.button !== 0) return
    e.stopPropagation()
    svg.current!.setPointerCapture(e.pointerId)
    onSelect(sel)
    setDrag(d)
  }

  const px = view[2] / 900 // about one screen pixel, in meters
  const ref = sketch.reference
  const ghost =
    hover && (tool === 'door' || tool === 'window' || tool === 'glassDoor' || tool === 'passage')
      ? { at: openingSpot(sketch.rooms, hover, OPENING_WIDTH[tool]), color: OPENING_COLOR[tool] }
      : null
  const nextAt = tool === 'room' && hover && outline.length ? nextCorner(hover) : null
  const draftRect = drag?.type === 'draw' && drag.moved ? rectFrom(drag.from, drag.to) : null
  const openingsById = new Map(
    (preview?.shell.walls ?? []).flatMap((w) =>
      (w.openings ?? []).map((o) => [o.id, { wall: w, opening: o }] as const),
    ),
  )
  // Rectangular rooms are labeled with their clear size, between the walls, as a listing's plan gives it.
  const inner = new Map(
    sketch.rooms
      .filter((r) => r.points.length === 4)
      .flatMap((r) => {
        const piece = preview?.shell.rooms.find((p) => p.id === r.id)
        if (!piece) return []
        const [x0, z0, x1, z1] = piece.rect
        return [[r.id, [x1 - x0, z1 - z0]] as const]
      }),
  )
  const selectedRoom = selection?.kind === 'room' ? sketch.rooms.find((r) => r.id === selection.id) : undefined

  return (
    <div className="fp-canvas">
      <svg
        ref={svg}
        viewBox={view.join(' ')}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={() => tool === 'room' && outline.length >= 3 && finishOutline()}
        data-tool={tool}
        role="application"
        aria-label="Floor plan drawing"
      >
        <defs>
          <pattern id="fp-grid" width="0.5" height="0.5" patternUnits="userSpaceOnUse">
            <path d="M 0.5 0 L 0 0 0 0.5" fill="none" stroke="rgb(43 41 37 / 0.07)" strokeWidth={px} />
          </pattern>
          <pattern id="fp-grid-m" width="1" height="1" patternUnits="userSpaceOnUse">
            <path d="M 1 0 L 0 0 0 1" fill="none" stroke="rgb(43 41 37 / 0.14)" strokeWidth={px} />
          </pattern>
        </defs>
        <rect x={view[0] - 80} y={view[1] - 80} width={view[2] + 160} height={view[3] + 160} fill="url(#fp-grid)" />
        <rect x={view[0] - 80} y={view[1] - 80} width={view[2] + 160} height={view[3] + 160} fill="url(#fp-grid-m)" />

        {ref && !ref.hidden && (
          <image
            className="fp-reference"
            href={ref.url}
            x={ref.origin[0]}
            y={ref.origin[1]}
            width={ref.width * ref.scale}
            height={ref.height * ref.scale}
            opacity={ref.opacity}
            preserveAspectRatio="none"
            pointerEvents="none"
          />
        )}

        {sketch.rooms.map((r) => {
          const selected = selectedRoom?.id === r.id
          // Labels sit in the room's largest rectangle: in an L, not in the notch.
          const [x0, z0, x1, z1] = rectangles(r.points)[0] ?? boundsOf(r.points)
          const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2]
          return (
            <g key={r.id} className="fp-room">
              <polygon
                points={r.points.map((q) => q.join(',')).join(' ')}
                fill={bad.has(r.id) ? '#f6d4cf' : KIND_FILL[r.kind]}
                fillOpacity={ref && !ref.hidden ? 0.6 : 1}
                stroke={selected ? 'var(--focus)' : 'rgb(43 41 37 / 0.3)'}
                strokeWidth={(selected ? 2 : 1) * px}
                strokeDasharray={selected ? undefined : `${4 * px} ${3 * px}`}
              />
              <text x={cx} y={cz - 7 * px} fontSize={12 * px} textAnchor="middle" className="fp-label">
                {r.name || ROOM_KINDS.find((k) => k.id === r.kind)!.label}
              </text>
              <text x={cx} y={cz + 9 * px} fontSize={10.5 * px} textAnchor="middle" className="fp-dims">
                {inner.has(r.id)
                  ? `${inner.get(r.id)![0].toFixed(2)} × ${inner.get(r.id)![1].toFixed(2)} m`
                  : `${(preview ? clearArea(preview, r) : area(r.points)).toFixed(1)} m²`}
              </text>
            </g>
          )
        })}

        {preview?.shell.walls.map((w) => (
          <line
            key={w.id}
            x1={w.a[0]}
            y1={w.a[1]}
            x2={w.b[0]}
            y2={w.b[1]}
            stroke={w.kind === 'exterior' ? '#3a3732' : '#6d6860'}
            strokeWidth={w.thickness}
            pointerEvents="none"
          />
        ))}
        {preview?.fixtures
          .filter((f) => f.type === 'railing')
          .map((f) => {
            const half = (f.size?.[0] ?? 1) / 2
            const along = f.rotation === 90
            return (
              <line
                key={f.id}
                x1={f.position[0] - (along ? 0 : half)}
                y1={f.position[2] - (along ? half : 0)}
                x2={f.position[0] + (along ? 0 : half)}
                y2={f.position[2] + (along ? half : 0)}
                stroke="#8b8f93"
                strokeWidth={3 * px}
                pointerEvents="none"
              />
            )
          })}

        {sketch.openings.map((o) => {
          const placed = openingsById.get(o.id)
          if (!placed) return null
          const { wall, opening } = placed
          const vertical = wall.a[0] === wall.b[0]
          const start = (vertical ? Math.min(wall.a[1], wall.b[1]) : Math.min(wall.a[0], wall.b[0])) + opening.offset
          const [ax, az, bx, bz] = vertical
            ? [wall.a[0], start, wall.a[0], start + opening.width]
            : [start, wall.a[1], start + opening.width, wall.a[1]]
          const selected = selection?.kind === 'opening' && selection.id === o.id
          return (
            <g
              key={o.id}
              className="fp-opening"
              onPointerDown={(e) => startDrag(e, { type: 'opening', id: o.id }, { kind: 'opening', id: o.id })}
            >
              <line x1={ax} y1={az} x2={bx} y2={bz} stroke="#fbfaf7" strokeWidth={wall.thickness + px} />
              {o.kind === 'door' && (
                <DoorSwing
                  a={[ax, az]}
                  b={[bx, bz]}
                  swing={doorSwing(o, sketch.rooms, !vertical)}
                  px={px}
                  color={selected ? 'var(--focus)' : OPENING_COLOR.door}
                />
              )}
              <line
                x1={ax}
                y1={az}
                x2={bx}
                y2={bz}
                stroke={selected ? 'var(--focus)' : OPENING_COLOR[o.kind]}
                strokeWidth={(o.kind === 'passage' ? 2 : 5) * px}
                strokeDasharray={o.kind === 'passage' ? `${4 * px} ${3 * px}` : undefined}
              />
            </g>
          )
        })}

        {sketch.fittings.map((f) => {
          const [w, , d] = fittingSize(f)
          const selected = selection?.kind === 'fitting' && selection.id === f.id
          return (
            <g
              key={f.id}
              className="fp-fitting"
              transform={`translate(${f.at[0]} ${f.at[1]}) rotate(${-f.rotation})`}
              onPointerDown={(e) => {
                const p = at(e)
                startDrag(
                  e,
                  { type: 'fitting', id: f.id, grab: [p[0] - f.at[0], p[1] - f.at[1]] },
                  { kind: 'fitting', id: f.id },
                )
              }}
            >
              <rect
                x={-w / 2}
                y={-d / 2}
                width={w}
                height={d}
                fill="#fbfaf7"
                stroke={selected ? 'var(--focus)' : '#57534c'}
                strokeWidth={(selected ? 2 : 1) * px}
              />
              <text
                y={3.5 * px}
                fontSize={9.5 * px}
                textAnchor="middle"
                className="fp-dims"
                transform={`rotate(${f.rotation})`}
              >
                {FITTINGS[f.type].label}
              </text>
            </g>
          )
        })}

        {selectedRoom && tool === 'select' && (
          <g className="fp-handles">
            {edgesOf(selectedRoom.points).map(([a, b], i) => (
              <circle
                key={`e${i}`}
                className="fp-edge-handle"
                data-axis={Math.abs(a[1] - b[1]) < 1e-6 ? 'z' : 'x'}
                cx={(a[0] + b[0]) / 2}
                cy={(a[1] + b[1]) / 2}
                r={5 * px}
                strokeWidth={1.5 * px}
                onPointerDown={(e) =>
                  startDrag(e, { type: 'edge', id: selectedRoom.id, i, start: selectedRoom.points }, selection)
                }
              />
            ))}
            {selectedRoom.points.map((q, i) => (
              <rect
                key={`c${i}`}
                className="fp-corner-handle"
                x={q[0] - 5 * px}
                y={q[1] - 5 * px}
                width={10 * px}
                height={10 * px}
                strokeWidth={1.5 * px}
                onPointerDown={(e) =>
                  startDrag(e, { type: 'corner', id: selectedRoom.id, i, start: selectedRoom.points }, selection)
                }
              />
            ))}
          </g>
        )}

        {/* The room being drawn: corners so far, the next edge, and how it would close. */}
        {outline.length > 0 && (
          <g pointerEvents="none">
            <polyline
              points={[...outline, ...(nextAt ? [nextAt] : [])].map((q) => q.join(',')).join(' ')}
              fill="rgb(47 111 214 / 0.08)"
              stroke="var(--focus)"
              strokeWidth={2 * px}
            />
            {nextAt && outline.length >= 2 && (
              <line
                x1={nextAt[0]}
                y1={nextAt[1]}
                x2={outline[0][0]}
                y2={outline[0][1]}
                stroke="var(--focus)"
                strokeWidth={px}
                strokeDasharray={`${4 * px} ${3 * px}`}
              />
            )}
            {outline.map((q, i) => (
              <circle
                key={i}
                cx={q[0]}
                cy={q[1]}
                r={(i === 0 ? 6 : 4) * px}
                fill={i === 0 ? 'var(--surface)' : 'var(--focus)'}
                stroke="var(--focus)"
                strokeWidth={1.5 * px}
              />
            ))}
            {nextAt && (
              <text x={nextAt[0] + 8 * px} y={nextAt[1] - 8 * px} fontSize={11 * px} className="fp-dims">
                {Math.hypot(
                  nextAt[0] - outline[outline.length - 1][0],
                  nextAt[1] - outline[outline.length - 1][1],
                ).toFixed(2)}{' '}
                m
              </text>
            )}
          </g>
        )}
        {draftRect && (
          <g pointerEvents="none">
            <polygon
              points={draftRect.map((q) => q.join(',')).join(' ')}
              fill="rgb(47 111 214 / 0.12)"
              stroke="var(--focus)"
              strokeWidth={2 * px}
            />
            <text
              x={draftRect[2][0]}
              y={draftRect[2][1] + 16 * px}
              fontSize={12 * px}
              textAnchor="end"
              className="fp-dims"
            >
              {(draftRect[1][0] - draftRect[0][0]).toFixed(2)} × {(draftRect[2][1] - draftRect[1][1]).toFixed(2)} m
            </text>
          </g>
        )}
        {tool === 'calibrate' && measureFrom && hover && (
          <g pointerEvents="none">
            <line
              x1={measureFrom[0]}
              y1={measureFrom[1]}
              x2={hover[0]}
              y2={hover[1]}
              stroke="#d23f31"
              strokeWidth={2 * px}
            />
            <circle cx={measureFrom[0]} cy={measureFrom[1]} r={4 * px} fill="#d23f31" />
          </g>
        )}
        {ghost?.at && (
          <circle cx={ghost.at[0]} cy={ghost.at[1]} r={6 * px} fill={ghost.color} opacity={0.7} pointerEvents="none" />
        )}
      </svg>
    </div>
  )
}

/**
 * A door as plans draw it: the leaf standing open at a right angle from its
 * hinge, and the arc its edge sweeps. `a` and `b` are the opening's ends, a
 * the lower one.
 */
function DoorSwing({
  a,
  b,
  swing,
  px,
  color,
}: {
  a: Vec2
  b: Vec2
  swing: { hinge: 'lo' | 'hi'; opens: 1 | -1 }
  px: number
  color: string
}) {
  const [hinge, free] = swing.hinge === 'lo' ? [a, b] : [b, a]
  const w = Math.hypot(b[0] - a[0], b[1] - a[1])
  const alongX = Math.abs(a[1] - b[1]) < 1e-6
  const tip: Vec2 = alongX ? [hinge[0], hinge[1] + swing.opens * w] : [hinge[0] + swing.opens * w, hinge[1]]
  // The arc runs from the free jamb to the open leaf's tip; which way round depends on the corner it turns.
  const cross = (free[0] - hinge[0]) * (tip[1] - hinge[1]) - (free[1] - hinge[1]) * (tip[0] - hinge[0])
  return (
    <g pointerEvents="none">
      <line x1={hinge[0]} y1={hinge[1]} x2={tip[0]} y2={tip[1]} stroke={color} strokeWidth={2 * px} />
      <path
        d={`M ${free[0]} ${free[1]} A ${w} ${w} 0 0 ${cross > 0 ? 1 : 0} ${tip[0]} ${tip[1]}`}
        fill="none"
        stroke={color}
        strokeWidth={px}
        strokeDasharray={`${3 * px} ${2 * px}`}
      />
    </g>
  )
}

/** The view rectangle that frames a sketch with some room around it. */
function framed(sketch: Sketch, el?: SVGSVGElement | null): Rect {
  const [x0, z0, x1, z1] = extent(sketch)
  const box = el?.getBoundingClientRect()
  if (!box?.width) {
    const m = 1.5
    return [x0 - m, z0 - m, Math.max(x1 - x0 + 2 * m, 6), Math.max(z1 - z0 + 2 * m, 4)]
  }
  // Frame it in what the toolbar, the panel and the hint leave visible, in the svg's own proportions.
  const panel = document.querySelector('.fp-panel')?.getBoundingClientRect()
  const free = { left: 32, top: 80, right: (panel ? panel.left - box.left : box.width) - 32, bottom: box.height - 70 }
  const [w, h] = [Math.max(x1 - x0, 4) + 1, Math.max(z1 - z0, 3) + 1]
  const k = Math.max(w / (free.right - free.left), h / (free.bottom - free.top)) // meters a pixel
  const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2]
  return [
    cx - ((free.left + free.right) / 2) * k,
    cz - ((free.top + free.bottom) / 2) * k,
    box.width * k,
    box.height * k,
  ]
}

/** The shift that lands one of `coords` on a snap line, or the grid shift. */
function bestShift(coords: number[], d: number, lines: number[]): number {
  let best = toGrid(coords[0] + d) - coords[0]
  let gap = Infinity
  for (const c of coords) {
    const s = snap(c + d, lines)
    if (lines.includes(s) && Math.abs(s - (c + d)) < gap) {
      gap = Math.abs(s - (c + d))
      best = s - c
    }
  }
  return round(best)
}

/** Moves a room, with the doors and windows on its edges and the fittings inside it. */
function moveRoom(base: Sketch, id: string, dx: number, dz: number): Sketch {
  const room = base.rooms.find((r) => r.id === id)!
  const onEdge = (p: Vec2) =>
    edgesOf(room.points).some(([a, b]) => {
      const alongX = Math.abs(a[1] - b[1]) < 1e-6
      return alongX
        ? Math.abs(p[1] - a[1]) < 1e-6 && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0])
        : Math.abs(p[0] - a[0]) < 1e-6 && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1])
    })
  const inside = (p: Vec2) => roomAt([room], p) !== undefined
  const shift = (p: Vec2): Vec2 => [round(p[0] + dx), round(p[1] + dz)]
  return {
    ...base,
    rooms: base.rooms.map((r) => (r.id === id ? { ...r, points: r.points.map(shift) } : r)),
    openings: base.openings.map((o) => (onEdge(o.at) ? { ...o, at: shift(o.at) } : o)),
    fittings: base.fittings.map((f) => (inside(f.at) ? { ...f, at: shift(f.at) } : f)),
  }
}
