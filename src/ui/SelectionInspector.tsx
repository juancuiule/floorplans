import { useMemo, useState } from 'react'
import { GALLERY_LINE } from '../decor/guides'
import {
  arrangeFrame,
  groupName,
  hangSelection,
  matchSelectionSize,
  pieceBelow,
  selectedGroup,
  selectionSummary,
} from '../decor/selection'
import { useDecor } from '../decor/store'
import type { DecorItem } from '../model/decor'
import { Chips, Field, NumberInput, Section } from './controls'
import { cm, itemLabel } from './format'
import { Icon } from './icons'
import { itemIcon } from './itemIcons'
import { MOD } from './format'
import './selection.css'

// The panel for a multi-selection: what is selected, its group, and the
// "hang as a gallery" helper. Align and distribute live in the edit bar.

const GAPS = [0.05, 0.08, 0.1] as const

export function SelectionInspector() {
  const items = useDecor((s) => s.items)
  const selectedIds = useDecor((s) => s.selectedIds)
  const groupNames = useDecor((s) => s.groupNames)
  const { select, selectMany, group, ungroup, renameGroup, duplicateSelection, removeMany } = useDecor.getState()
  const sel = useMemo(() => items.filter((i) => selectedIds.includes(i.id)), [items, selectedIds])
  const gid = selectedGroup()
  const frame = arrangeFrame(sel)
  const gallery = frame?.kind === 'wall' && sel.every((i) => i.kind === 'artwork')

  return (
    <div className="inspector">
      <header className="i-head">
        <span className="tile large">
          <Icon name="layers" size={22} />
        </span>
        <div className="i-title">
          <h2>{gid ? groupName(gid) : selectionSummary(sel)}</h2>
          <p>
            {gid
              ? `Group · ${selectionSummary(sel)}`
              : frame?.kind === 'wall'
                ? 'Selected together · on one wall'
                : 'Selected together'}
          </p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => select(null)}
          aria-keyshortcuts="Escape"
          title="Clear the selection (Esc)"
        >
          Done
        </button>
      </header>

      {gid ? (
        <Section title="Group">
          <Field label="Name">
            <input
              key={gid}
              className="text-input"
              aria-label="Group name"
              maxLength={60}
              type="text"
              defaultValue={groupNames[gid] ?? ''}
              placeholder={groupName(gid, { ...useDecor.getState(), groupNames: {} })}
              onBlur={(e) => renameGroup(gid, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
            />
          </Field>
          <p className="note">
            Click any piece to pick up the whole group; double-click or <kbd>Alt</kbd>+click for a single one.
          </p>
          <div className="actions">
            <button type="button" className="btn" onClick={ungroup} aria-keyshortcuts="Shift+Meta+G Shift+Control+G">
              Ungroup
            </button>
          </div>
        </Section>
      ) : (
        <Section title="Group">
          <p className="note">
            Group them to move them as one and keep the arrangement. It shows up in the list below.
          </p>
          <div className="actions">
            <button type="button" className="btn" onClick={group} aria-keyshortcuts="Meta+G Control+G">
              <Icon name="layers" size={14} /> Group <kbd>{MOD}G</kbd>
            </button>
          </div>
        </Section>
      )}

      {gallery && <GallerySection count={sel.length} over={belowLabel(sel)} />}

      <Section title={`Selected · ${sel.length}`}>
        <ul className="sel-list">
          {sel.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                className="placed-main"
                onClick={() => selectMany([i.id], i.id)}
                title="Select just this one"
              >
                <span className="tile small">
                  {i.kind === 'artwork' ? (
                    <img src={i.image} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <Icon name={itemIcon(i)} size={16} />
                  )}
                </span>
                <span className="placed-name">{itemLabel(i)}</span>
                {i.kind === 'artwork' && (
                  <span className="sel-meta">
                    {cm(i.size.w)}×{cm(i.size.h)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <div className="i-foot">
        <div className="actions">
          <button type="button" className="btn" onClick={duplicateSelection} aria-keyshortcuts="Meta+D Control+D">
            <Icon name="duplicate" size={14} /> Duplicate
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => removeMany(selectedIds)}
            aria-keyshortcuts="Delete"
          >
            <Icon name="trash" size={14} /> Delete {sel.length}
          </button>
        </div>
        <p className="note">
          Drag any of them to move them all. <kbd>Shift</kbd>+click adds or removes a piece.
        </p>
      </div>
    </div>
  )
}

function belowLabel(sel: DecorItem[]): string | null {
  const below = pieceBelow(sel)
  return below ? itemLabel(below.item).toLowerCase() : null
}

/** Arrange the selected artwork as a neat row or grid on a center line. */
function GallerySection({ count, over }: { count: number; over: string | null }) {
  const [layout, setLayout] = useState<'row' | 'grid'>(count > 3 ? 'grid' : 'row')
  const [gap, setGap] = useState<number>(0.08)
  const [center, setCenter] = useState(Math.round(GALLERY_LINE * 100))
  return (
    <Section title="Hang as a gallery">
      <Field label="Layout">
        <Chips
          value={layout}
          options={[
            { id: 'row', label: 'One row' },
            { id: 'grid', label: 'Grid' },
          ]}
          onChange={setLayout}
        />
      </Field>
      <Field label="Gap between frames">
        <Chips value={gap} options={GAPS.map((g) => ({ id: g as number, label: `${g * 100} cm` }))} onChange={setGap} />
      </Field>
      <Field label="Center line">
        <NumberInput name="center" value={center} min={60} max={220} unit="cm" onChange={setCenter} />
      </Field>
      <div className="actions">
        <button
          type="button"
          className="btn solid"
          onClick={() => hangSelection({ layout, gap, centerV: center / 100 })}
        >
          Hang {count} pieces
        </button>
        <button
          type="button"
          className="btn"
          onClick={matchSelectionSize}
          title="Every piece takes the print size and frame of the last one clicked"
        >
          Match size and frame
        </button>
      </div>
      <p className="note">
        {over ? `Centered over the ${over}` : 'Centered where they hang now'}; 145–155 cm is the usual eye level.
      </p>
    </Section>
  )
}
