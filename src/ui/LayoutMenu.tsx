import { useEffect, useRef, useState, type FormEvent } from 'react'
import { getSpace, type PlanSummary } from '../decor/api'
import { useLayouts, type LayoutInfo } from '../decor/layouts'
import { launch } from '../project/launch'
import { MAIN_NAME } from '../model/layoutNames'
import { plan } from '../project/plan'
import { MAIN_SLUG, useDecor } from '../decor/store'
import { Icon } from './icons'
import './layoutMenu.css'

// Layout variants: the menu at the top of the panel lists every saved
// arrangement of the apartment (layouts/decor.json is "Current"), switches between
// them, saves the current one under a new name, renames and deletes. The A/B
// button (or B) flips between this layout and the one to compare with.

/** A main layout (layouts/decor.json, or another plan's layouts/decor.plan-<id>.json) is "Current" until renamed. */
const displayName = (slug: string | null, name: string) =>
  name || (slug === null || slug === MAIN_SLUG ? MAIN_NAME : slug)

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (!Number.isFinite(s) || s < 0 || new Date(iso).getTime() === 0) return ''
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  const d = Math.round(s / 86400)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

export function LayoutMenu() {
  const layout = useDecor((s) => s.layout)
  const layoutName = useDecor((s) => s.layoutName)
  const compareWith = useDecor((s) => s.compareWith)
  const list = useLayouts((s) => s.list)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => void useLayouts.getState().refresh(), [])

  // B flips A/B anywhere outside a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return
      if ((e.target as HTMLElement).closest?.('input, select, textarea, [contenteditable="true"]')) return
      if (e.key !== 'b' && e.key !== 'B') return
      e.preventDefault()
      void useDecor.getState().toggleCompare()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    void useLayouts.getState().refresh()
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])

  const nameOf = (slug: string | null | undefined) => {
    if (slug === undefined) return ''
    if (slug === layout) return displayName(slug, layoutName)
    const hit = list.find((l) => l.slug === slug)
    return hit ? hit.name : displayName(slug, '')
  }
  const current = displayName(layout, layoutName)
  const other = compareWith !== undefined ? nameOf(compareWith) : ''

  return (
    <div className="layout-bar" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="layout-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="layouts-menu"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="layers" size={16} />
        <span className="layout-trigger-text">
          <span className="layout-kicker">Layout</span>
          <span className="layout-current" data-testid="layout-current">
            {current}
          </span>
        </span>
        <Icon name="chevron" size={14} className="layout-chevron" />
      </button>
      <button
        type="button"
        className="layout-ab"
        disabled={compareWith === undefined}
        aria-label={other ? `Compare: switch to ${other}` : 'Compare: switch to another layout first'}
        aria-keyshortcuts="B"
        title={other ? `Switch to ${other} (B)` : 'Switch layouts once to compare them (B)'}
        onClick={() => void useDecor.getState().toggleCompare()}
      >
        <span aria-hidden="true">A/B</span>
      </button>
      {open && (
        <LayoutsPopover
          onClose={() => {
            setOpen(false)
            triggerRef.current?.focus()
          }}
        />
      )}
    </div>
  )
}

type Mode = { kind: 'idle' } | { kind: 'rename'; slug: string | null } | { kind: 'delete'; slug: string | null }

function LayoutsPopover({ onClose }: { onClose: () => void }) {
  const layout = useDecor((s) => s.layout)
  const layoutName = useDecor((s) => s.layoutName)
  const itemCount = useDecor((s) => s.items.length)
  const compareWith = useDecor((s) => s.compareWith)
  const { list, error } = useLayouts()
  const [mode, setMode] = useState<Mode>({ kind: 'idle' })
  const [busy, setBusy] = useState(false)

  // Only this plan's layouts. The open layout shows even when the list hides it (test files).
  const rows: LayoutInfo[] = list.filter((l) => l.plan === plan.id)
  if (!rows.some((l) => l.slug === layout))
    rows.push({ slug: layout, name: displayName(layout, layoutName), items: itemCount, updated: '', plan: plan.id })

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
      setMode({ kind: 'idle' })
    }
  }

  return (
    <div
      id="layouts-menu"
      className="layout-pop"
      role="dialog"
      aria-label="Layouts"
      aria-busy={busy || undefined}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.stopPropagation()
        if (mode.kind !== 'idle') setMode({ kind: 'idle' })
        else onClose()
      }}
    >
      <div className="layout-pop-head">
        <h2>Layouts</h2>
        <p>Each layout keeps its own furniture, decor and finishes.</p>
      </div>
      {error && (
        <p className="layout-error" role="alert">
          <Icon name="alert" size={14} />
          {error}
        </p>
      )}
      <ul className="layout-list">
        {rows.map((l) => {
          const isCurrent = l.slug === layout
          const isB = l.slug === compareWith && !isCurrent
          const name = isCurrent ? displayName(layout, layoutName) : l.name
          const items = isCurrent ? itemCount : l.items
          if (mode.kind === 'rename' && mode.slug === l.slug)
            return (
              <li key={String(l.slug)}>
                <NameForm
                  label={`New name for ${name}`}
                  initial={name}
                  submit="Rename"
                  onCancel={() => setMode({ kind: 'idle' })}
                  onSubmit={(n) => run(() => useLayouts.getState().rename(l.slug, n))}
                />
              </li>
            )
          if (mode.kind === 'delete' && mode.slug === l.slug)
            return (
              <li key={String(l.slug)} className="layout-confirm" role="alertdialog" aria-label={`Delete ${name}?`}>
                <span>
                  Delete <strong>{name}</strong>? This can’t be undone.
                </span>
                <div className="layout-confirm-actions">
                  <button type="button" className="btn" autoFocus onClick={() => setMode({ kind: 'idle' })}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn solid-danger"
                    onClick={() => run(() => useLayouts.getState().remove(l.slug))}
                  >
                    Delete
                  </button>
                </div>
              </li>
            )
          const meta = [`${items} ${items === 1 ? 'item' : 'items'}`, !isCurrent && ago(l.updated)]
            .filter(Boolean)
            .join(' · ')
          return (
            <li key={String(l.slug)} className={`layout-row${isCurrent ? ' current' : ''}`}>
              <button
                type="button"
                className="layout-pick"
                aria-current={isCurrent || undefined}
                onClick={() => {
                  if (!isCurrent) void run(() => useDecor.getState().switchLayout(l.slug))
                  onClose()
                }}
              >
                <span className="layout-check">{isCurrent && <Icon name="check" size={14} />}</span>
                <span className="layout-text">
                  <span className="layout-name">
                    {name}
                    {isB && <span className="layout-tag">B</span>}
                  </span>
                  <span className="layout-meta">{meta}</span>
                </span>
              </button>
              <div className="layout-actions">
                {!isCurrent && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-pressed={isB}
                    aria-label={`Compare with ${name}`}
                    title={isB ? 'Compared with A/B' : 'Use for A/B compare'}
                    onClick={() => useDecor.getState().setCompareWith(isB ? undefined : l.slug)}
                  >
                    <Icon name="compare" size={15} />
                  </button>
                )}
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Rename ${name}`}
                  title="Rename"
                  onClick={() => setMode({ kind: 'rename', slug: l.slug })}
                >
                  <Icon name="pencil" size={15} />
                </button>
                {l.slug !== null && l.slug !== MAIN_SLUG && (
                  <button
                    type="button"
                    className="icon-btn danger"
                    aria-label={`Delete ${name}`}
                    title="Delete"
                    onClick={() => setMode({ kind: 'delete', slug: l.slug })}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <OtherPlans onDone={onClose} run={run} />
      <div className="layout-pop-foot">
        <NameForm
          label="Save a copy as"
          placeholder="Name, e.g. Desk by the window"
          submit="Save as new"
          initial=""
          onSubmit={(n) =>
            run(async () => {
              await useLayouts.getState().saveAs(n)
              onClose()
            })
          }
        />
      </div>
    </div>
  )
}

/**
 * The space's other plans, whose layout can be brought over: for an apartment
 * drawn again, its furniture, artwork and paint come along, fitted to the new walls.
 */
function OtherPlans({ onDone, run }: { onDone: () => void; run: (fn: () => Promise<void>) => Promise<void> }) {
  const [plans, setPlans] = useState<PlanSummary[]>([])
  useEffect(() => {
    if (!launch.space) return
    getSpace(launch.space).then(
      (s) => setPlans(s.plans.filter((p) => p.id !== plan.id)),
      () => setPlans([]),
    )
  }, [])
  if (!plans.length) return null
  return (
    <div className="layout-other">
      <h3>From another plan</h3>
      <ul>
        {plans.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className="btn"
              onClick={() =>
                run(async () => {
                  await useLayouts.getState().bringFrom(p.id, `From ${p.name}`)
                  onDone()
                })
              }
            >
              <Icon name="layers" size={14} /> Bring in the layout of {p.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function NameForm({
  label,
  initial,
  submit,
  placeholder,
  onSubmit,
  onCancel,
}: {
  label: string
  initial: string
  submit: string
  placeholder?: string
  onSubmit: (name: string) => void
  onCancel?: () => void
}) {
  const [value, setValue] = useState(initial)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (onCancel) inputRef.current?.select()
  }, [onCancel])
  const send = (e: FormEvent) => {
    e.preventDefault()
    const name = value.trim()
    if (name) onSubmit(name)
  }
  return (
    <form className="layout-form" onSubmit={send}>
      <label className={onCancel ? 'sr-only' : 'layout-form-label'} htmlFor={`${submit}-input`}>
        {label}
      </label>
      <div className="layout-form-row">
        <input
          ref={inputRef}
          id={`${submit}-input`}
          type="text"
          value={value}
          placeholder={placeholder}
          maxLength={60}
          autoComplete="off"
          spellCheck={false}
          autoFocus={!!onCancel}
          onChange={(e) => setValue(e.target.value)}
        />
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn solid" disabled={!value.trim()}>
          {submit}
        </button>
      </div>
    </form>
  )
}
