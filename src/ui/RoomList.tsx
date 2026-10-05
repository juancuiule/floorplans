import { memo, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { defaultGroupName } from '../decor/selection'
import { useDecor } from '../decor/store'
import type { DecorKind } from '../model/decor'
import { structureOf } from '../model/finishes'
import { lostWallOf, WALL_LABELS, type HungItem } from '../project/structure'
import { itemLabel, TABS } from './format'
import { Icon, type IconName } from './icons'
import { itemIcon } from './itemIcons'
import './selection.css'
import { useUi } from './uiStore'
import { isPlaced } from '../model/decor'

// Everything placed in the room: groups first (collapsible), then the rest by
// kind. Docked at the bottom of the panel and collapsible; it scrolls on its
// own when the list is long.

interface Row {
  id: string
  kind: DecorKind
  label: string
  icon: IconName
  image?: string
  /** Hung on a wall this layout takes out. */
  lostWall?: string
  groupId?: string
}

interface GroupRow {
  id: string
  name: string
  rows: Row[]
}

const SEP = '\u0001'

/**
 * One string per placed item with only what a row shows. Moving an item changes
 * its position but not this string, so dragging does not re-render the list.
 */
const rowsSignature = (s: ReturnType<typeof useDecor.getState>) =>
  s.items
    .filter(isPlaced)
    .map((i) =>
      [
        i.id,
        i.kind,
        itemLabel(i),
        itemIcon(i),
        i.kind === 'artwork' ? i.image : '',
        lostWallOf(i as HungItem, structureOf(s.finishes)) ?? '',
        i.groupId ?? '',
      ].join(SEP),
    )
    .join('\n')

export function RoomList() {
  const open = useUi((s) => s.roomListOpen)
  const toggle = useUi((s) => s.toggleRoomList)
  const sig = useDecor(rowsSignature)
  const groupNames = useDecor((s) => s.groupNames)
  const selectedIds = useDecor((s) => s.selectedIds)
  const selectedId = useDecor((s) => s.selectedId)
  const remove = useDecor((s) => s.remove)
  const listRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  const rows = useMemo<Row[]>(
    () =>
      sig
        ? sig.split('\n').map((line) => {
            const [id, kind, label, icon, image, lostWall, groupId] = line.split(SEP)
            return {
              id,
              kind: kind as DecorKind,
              label,
              icon: icon as IconName,
              image: image || undefined,
              lostWall: lostWall || undefined,
              groupId: groupId || undefined,
            }
          })
        : [],
    [sig],
  )
  const groupRows = useMemo<GroupRow[]>(() => {
    const byId = new Map<string, Row[]>()
    for (const r of rows) if (r.groupId) byId.set(r.groupId, [...(byId.get(r.groupId) ?? []), r])
    return [...byId].map(([id, members]) => ({ id, rows: members, name: groupNames[id] || defaultGroupName(members) }))
  }, [rows, groupNames])
  const groups = TABS.map((t) => ({ ...t, rows: rows.filter((r) => r.kind === t.kind && !r.groupId) })).filter(
    (g) => g.rows.length > 0,
  )
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])

  const onSelect = (id: string, e: MouseEvent) => {
    const s = useDecor.getState()
    // In the list a row is always the one piece; Shift adds it to (or takes it out of) the selection.
    if (e.shiftKey) s.toggleSelect(id, { single: true })
    else if (s.selectedIds.length === 1 && s.selectedId === id) s.select(null)
    else s.selectMany([id], id)
  }
  const onSelectGroup = (g: GroupRow, e: MouseEvent) => {
    const s = useDecor.getState()
    const ids = g.rows.map((r) => r.id)
    const all = ids.every((id) => s.selectedIds.includes(id))
    if (e.shiftKey) s.toggleSelect(ids[0])
    else if (all && s.selectedIds.length === ids.length) s.select(null)
    else s.selectMany(ids, ids[0])
  }
  const toggleGroup = (id: string) =>
    setExpanded((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const onDelete = (id: string) => {
    // Keep keyboard focus in the list: move it to the next row, or the previous one.
    const i = rows.findIndex((r) => r.id === id)
    const next = rows[i + 1] ?? rows[i - 1]
    remove(id)
    requestAnimationFrame(() => {
      const el = next && listRef.current?.querySelector<HTMLElement>(`[data-row="${next.id}"] .placed-main`)
      ;(el ?? document.getElementById('room-toggle'))?.focus()
    })
  }

  return (
    <section className={`room${open ? ' open' : ''}`} aria-labelledby="room-toggle">
      <h2 className="room-head">
        <button type="button" id="room-toggle" aria-expanded={open} aria-controls="room-list" onClick={toggle}>
          <Icon name="chevron" size={14} className="disclosure" />
          In the room
          <span className="count">{rows.length}</span>
        </button>
      </h2>
      <div id="room-list" className="room-list" ref={listRef} hidden={!open}>
        {rows.length === 0 && (
          <p className="note">Nothing placed yet. Choose something above, then click in the room to set it down.</p>
        )}
        {groupRows.length > 0 && (
          <div className="room-group" role="group" aria-labelledby="room-groups">
            <h3 className="group-label" id="room-groups">
              Groups <span className="count">{groupRows.length}</span>
            </h3>
            <ul className="placed">
              {groupRows.map((g) => {
                const open = expanded.has(g.id)
                const all = g.rows.every((r) => selected.has(r.id))
                const cover = g.rows.find((r) => r.image)
                return (
                  <li key={g.id} data-group={g.id}>
                    <div className={`placed-row group-row${all ? ' on' : ''}`}>
                      <button
                        type="button"
                        className="icon-btn expand"
                        aria-expanded={open}
                        aria-controls={`group-${g.id}`}
                        aria-label={`${open ? 'Hide' : 'Show'} the pieces of ${g.name}`}
                        onClick={() => toggleGroup(g.id)}
                      >
                        <Icon name="chevron" size={14} className="disclosure" />
                      </button>
                      <button
                        type="button"
                        className="placed-main"
                        aria-pressed={all}
                        onClick={(e) => onSelectGroup(g, e)}
                      >
                        <span className="tile small">
                          {cover?.image ? (
                            <img src={cover.image} alt="" loading="lazy" decoding="async" />
                          ) : (
                            <Icon name="layers" size={16} />
                          )}
                        </span>
                        <span className="placed-name">{g.name}</span>
                      </button>
                    </div>
                    {open && (
                      <ul className="placed group-members" id={`group-${g.id}`}>
                        {g.rows.map((r) => (
                          <PlacedRow
                            key={r.id}
                            row={r}
                            selected={selected.has(r.id)}
                            primary={r.id === selectedId}
                            onSelect={onSelect}
                            onDelete={onDelete}
                          />
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
        {groups.map((g) => (
          <div key={g.kind} className="room-group" role="group" aria-labelledby={`room-${g.kind}`}>
            <h3 className="group-label" id={`room-${g.kind}`}>
              {g.label} <span className="count">{g.rows.length}</span>
            </h3>
            <ul className="placed">
              {g.rows.map((r) => (
                <PlacedRow
                  key={r.id}
                  row={r}
                  selected={selected.has(r.id)}
                  primary={r.id === selectedId}
                  onSelect={onSelect}
                  onDelete={onDelete}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

const PlacedRow = memo(function PlacedRow({
  row,
  selected,
  primary,
  onSelect,
  onDelete,
}: {
  row: Row
  selected: boolean
  primary: boolean
  onSelect: (id: string, e: MouseEvent) => void
  onDelete: (id: string) => void
}) {
  const ref = useRef<HTMLLIElement>(null)
  // Selecting in the room scrolls the list to the row.
  useEffect(() => {
    if (primary) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [primary])
  return (
    <li ref={ref} className={`placed-row${selected ? ' on' : ''}`} data-row={row.id}>
      <button type="button" className="placed-main" aria-pressed={selected} onClick={(e) => onSelect(row.id, e)}>
        <span className="tile small">
          {row.image ? (
            <img src={row.image} alt="" loading="lazy" decoding="async" />
          ) : (
            <Icon name={row.icon} size={16} />
          )}
        </span>
        <span className="placed-name">{row.label}</span>
        {row.lostWall && (
          <span
            className="wall-lost-badge"
            data-lost-wall={row.lostWall}
            title={`Hung on the ${WALL_LABELS[row.lostWall] ?? row.lostWall} wall, which this layout removes. Move it to another wall.`}
          >
            Wall removed
          </span>
        )}
      </button>
      <button
        type="button"
        className="icon-btn danger"
        aria-label={`Delete ${row.label}`}
        title="Delete"
        onClick={() => onDelete(row.id)}
      >
        <Icon name="trash" size={14} />
      </button>
    </li>
  )
})
