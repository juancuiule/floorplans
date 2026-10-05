import { useMemo, type ReactNode } from 'react'
import type { AlignMode } from '../decor/arrange'
import { LAMPS, PLANTS } from '../decor/catalog'
import { FURNITURE } from '../decor/furnitureCatalog'
import { collisionsOf, mountOf } from '../decor/placement'
import {
  alignSelection,
  arrangeFrame,
  distributeSelection,
  groupName,
  matchSelectionSize,
  selectedGroup,
  selectionSummary,
} from '../decor/selection'
import { useDecor } from '../decor/store'
import type { DecorItem } from '../model/decor'
import './editbar.css'

const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'

function label(item: DecorItem): string {
  if (item.kind === 'artwork')
    return decodeURIComponent(item.image.split('/').pop() ?? '').replace(/\.[^.]+$/, '') || 'Artwork'
  if (item.kind === 'plant') return PLANTS[item.species].label
  if (item.kind === 'furniture') return FURNITURE[item.type].label
  return LAMPS[item.type].label
}

const icon = (d: ReactNode) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {d}
  </svg>
)

const ICONS = {
  rotL: icon(
    <>
      <path d="M3.5 7.5a4.5 4.5 0 1 1 1.3 3.2" />
      <path d="M3.5 3.5v4h4" />
    </>,
  ),
  rotR: icon(
    <>
      <path d="M12.5 7.5a4.5 4.5 0 1 0-1.3 3.2" />
      <path d="M12.5 3.5v4h-4" />
    </>,
  ),
  dup: icon(
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 3.5v-.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h.5" />
    </>,
  ),
  del: icon(
    <>
      <path d="M3 4.5h10" />
      <path d="M6.5 4.5V3h3v1.5" />
      <path d="M4.5 4.5l.6 8.1a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8.1" />
    </>,
  ),
  undo: icon(
    <>
      <path d="M6 3.5L3 6.5l3 3" />
      <path d="M3 6.5h6.5a3.5 3.5 0 0 1 0 7H7" />
    </>,
  ),
  redo: icon(
    <>
      <path d="M10 3.5l3 3-3 3" />
      <path d="M13 6.5H6.5a3.5 3.5 0 0 0 0 7H9" />
    </>,
  ),
}

const bar = (x: number, y: number, w: number, h: number) => <rect x={x} y={y} width={w} height={h} rx="0.8" />

const ALIGN_ICONS: Record<AlignMode, ReactNode> = {
  left: icon(
    <>
      <path d="M2.5 2v12" />
      {bar(4.5, 3.5, 9, 3)}
      {bar(4.5, 9.5, 5.5, 3)}
    </>,
  ),
  hcenter: icon(
    <>
      <path d="M8 2v12" />
      {bar(3, 3.5, 10, 3)}
      {bar(5, 9.5, 6, 3)}
    </>,
  ),
  right: icon(
    <>
      <path d="M13.5 2v12" />
      {bar(2.5, 3.5, 9, 3)}
      {bar(6, 9.5, 5.5, 3)}
    </>,
  ),
  top: icon(
    <>
      <path d="M2 2.5h12" />
      {bar(3.5, 4.5, 3, 9)}
      {bar(9.5, 4.5, 3, 5.5)}
    </>,
  ),
  vmiddle: icon(
    <>
      <path d="M2 8h12" />
      {bar(3.5, 3, 3, 10)}
      {bar(9.5, 5, 3, 6)}
    </>,
  ),
  bottom: icon(
    <>
      <path d="M2 13.5h12" />
      {bar(3.5, 2.5, 3, 9)}
      {bar(9.5, 6, 3, 5.5)}
    </>,
  ),
}

const MULTI_ICONS = {
  distH: icon(
    <>
      <path d="M2 2v12M14 2v12" />
      {bar(6, 4, 4, 8)}
    </>,
  ),
  distV: icon(
    <>
      <path d="M2 2h12M2 14h12" />
      {bar(4, 6, 8, 4)}
    </>,
  ),
  group: icon(
    <>
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" strokeDasharray="2 1.6" />
      {bar(4, 4, 4, 4)}
      {bar(8.5, 8.5, 3.5, 3.5)}
    </>,
  ),
  ungroup: icon(
    <>
      {bar(2, 2, 6, 6)}
      {bar(9.5, 9.5, 4.5, 4.5)}
    </>,
  ),
  match: icon(
    <>
      {bar(2, 3.5, 5, 9)}
      {bar(9, 3.5, 5, 9)}
    </>,
  ),
}

const ALIGN_LABELS: Record<AlignMode, [string, string]> = {
  left: ['Align left', 'Alt+A'],
  hcenter: ['Align centers', 'Alt+H'],
  right: ['Align right', 'Alt+D'],
  top: ['Align tops', 'Alt+W'],
  vmiddle: ['Align middles', 'Alt+V'],
  bottom: ['Align bottoms', 'Alt+S'],
}

function Btn({
  title,
  onClick,
  disabled,
  children,
  danger,
}: {
  title: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
  danger?: boolean
}) {
  return (
    <button
      type="button"
      className={danger ? 'danger' : undefined}
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

/** Floating actions for the selected item, bottom center. */
export function EditBar() {
  const items = useDecor((s) => s.items)
  const selectedId = useDecor((s) => s.selectedId)
  const many = useDecor((s) => s.selectedIds.length > 1)
  const placing = useDecor((s) => s.isDraft && s.movingId !== null)
  const canUndo = useDecor((s) => s.canUndo)
  const canRedo = useDecor((s) => s.canRedo)
  const { undo, redo, rotateBy, duplicate, remove } = useDecor.getState()
  const item = items.find((i) => i.id === selectedId)
  const col = useMemo(() => (item && !many ? collisionsOf(item, items) : null), [item, items, many])
  if (!item || placing) return null
  if (many) return <MultiBar />

  const turnable = 'rotation' in item && mountOf(item) !== 'wall'
  const step = item.kind === 'furniture' ? 90 : 15
  const others = col?.overlaps.map((id) => items.find((i) => i.id === id)).filter((i): i is DecorItem => !!i) ?? []
  const warning = others.length ? `Overlaps ${others.map(label).join(', ')}` : col?.wall ? 'Cuts into a wall' : null

  return (
    <div className="editbar" role="toolbar" aria-label="Selected item">
      <div className="editbar-name">
        <strong title={label(item)}>{label(item)}</strong>
        {warning ? (
          <span className="editbar-warn" role="status" title={warning}>
            {warning}
          </span>
        ) : (
          'rotation' in item && turnable && <span className="editbar-meta">{Math.round(item.rotation)}°</span>
        )}
      </div>
      {turnable && (
        <div className="editbar-group">
          <Btn title={`Rotate left ${step}° (Shift+R)`} onClick={() => rotateBy(item.id, -step)}>
            {ICONS.rotL}
          </Btn>
          <Btn title={`Rotate right ${step}° (R)`} onClick={() => rotateBy(item.id, step)}>
            {ICONS.rotR}
          </Btn>
        </div>
      )}
      <div className="editbar-group">
        <Btn title={`Duplicate (${mod}D)`} onClick={() => duplicate(item.id)}>
          {ICONS.dup}
        </Btn>
        <Btn title="Delete (Delete)" onClick={() => remove(item.id)} danger>
          {ICONS.del}
        </Btn>
      </div>
      <div className="editbar-group">
        <Btn title={`Undo (${mod}Z)`} onClick={undo} disabled={!canUndo}>
          {ICONS.undo}
        </Btn>
        <Btn title={`Redo (${mod === '⌘' ? '⇧⌘Z' : 'Ctrl+Y'})`} onClick={redo} disabled={!canRedo}>
          {ICONS.redo}
        </Btn>
      </div>
    </div>
  )
}

/** Align, distribute and group tools for a multi-selection. */
function MultiBar() {
  const items = useDecor((s) => s.items)
  const selectedIds = useDecor((s) => s.selectedIds)
  const canUndo = useDecor((s) => s.canUndo)
  const canRedo = useDecor((s) => s.canRedo)
  const { undo, redo, duplicateSelection, removeMany, group, ungroup } = useDecor.getState()
  const sel = useMemo(() => items.filter((i) => selectedIds.includes(i.id)), [items, selectedIds])
  const frame = arrangeFrame(sel)
  const gid = selectedGroup()
  const grouped = sel.some((i) => i.groupId)
  const artworks = sel.filter((i) => i.kind === 'artwork').length
  const why = frame ? '' : ' (pick pieces on one wall, or on the floor)'
  const onWall = frame?.kind === 'wall'
  const dist = (u: boolean) => (onWall ? (u ? 'along the wall' : 'in height') : u ? 'left to right' : 'front to back')

  return (
    <div className="editbar" role="toolbar" aria-label="Selection">
      <div className="editbar-name">
        <strong title={gid ? groupName(gid) : undefined}>{gid ? groupName(gid) : selectionSummary(sel)}</strong>
        <span className="editbar-count">
          {gid ? selectionSummary(sel) : onWall ? 'On one wall' : frame ? 'On the floor' : 'Walls and floor'}
        </span>
      </div>
      <div className="editbar-group" role="group" aria-label="Align">
        {(Object.keys(ALIGN_ICONS) as AlignMode[]).map((m) => (
          <Btn
            key={m}
            title={`${ALIGN_LABELS[m][0]} (${ALIGN_LABELS[m][1]})${why}`}
            onClick={() => alignSelection(m)}
            disabled={!frame}
          >
            {ALIGN_ICONS[m]}
          </Btn>
        ))}
      </div>
      <div className="editbar-group" role="group" aria-label="Distribute">
        <Btn
          title={`Distribute ${dist(true)} with equal gaps (Alt+Shift+H)${why}`}
          onClick={() => distributeSelection('u')}
          disabled={!frame || sel.length < 3}
        >
          {MULTI_ICONS.distH}
        </Btn>
        <Btn
          title={`Distribute ${dist(false)} with equal gaps (Alt+Shift+V)${why}`}
          onClick={() => distributeSelection('v')}
          disabled={!frame || sel.length < 3}
        >
          {MULTI_ICONS.distV}
        </Btn>
        {artworks >= 2 && (
          <Btn title="Match size and frame (to the last clicked artwork)" onClick={matchSelectionSize}>
            {MULTI_ICONS.match}
          </Btn>
        )}
      </div>
      <div className="editbar-group">
        {!gid && (
          <Btn title={`Group (${mod}G)`} onClick={group}>
            {MULTI_ICONS.group}
          </Btn>
        )}
        {grouped && (
          <Btn title={`Ungroup (Shift+${mod}G)`} onClick={ungroup}>
            {MULTI_ICONS.ungroup}
          </Btn>
        )}
        <Btn title={`Duplicate (${mod}D)`} onClick={duplicateSelection}>
          {ICONS.dup}
        </Btn>
        <Btn title="Delete (Delete)" onClick={() => removeMany(selectedIds)} danger>
          {ICONS.del}
        </Btn>
      </div>
      <div className="editbar-group">
        <Btn title={`Undo (${mod}Z)`} onClick={undo} disabled={!canUndo}>
          {ICONS.undo}
        </Btn>
        <Btn title={`Redo (${mod === '⌘' ? '⇧⌘Z' : 'Ctrl+Y'})`} onClick={redo} disabled={!canRedo}>
          {ICONS.redo}
        </Btn>
      </div>
    </div>
  )
}
