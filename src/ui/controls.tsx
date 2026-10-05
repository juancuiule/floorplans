import { useId, useState, type CSSProperties, type ReactNode } from 'react'
import { onRadioKeys, parseNumber } from './controlUtils'
import { FieldIds, useFieldIds } from './fieldIds'
import { Icon } from './icons'
import { useUi } from './uiStore'

// Inspector building blocks. Every control is keyboard-first: radio groups move
// with the arrow keys, number fields step with +/- buttons or the arrow keys.

/** A collapsible group of fields, e.g. "Size" or "Finish". Remembers if the viewer closed it. */
export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  const closed = useUi((s) => !!s.collapsed[title])
  const toggle = useUi((s) => s.toggleSection)
  const id = useId()
  return (
    <section className="i-section">
      <div className="i-section-head">
        <h3>
          <button type="button" aria-expanded={!closed} aria-controls={id} onClick={() => toggle(title)}>
            <Icon name="chevron" size={14} className="disclosure" />
            {title}
          </button>
        </h3>
        {aside}
      </div>
      <div id={id} className="i-section-body" hidden={closed}>
        {children}
      </div>
    </section>
  )
}

/** A label, an optional current value on the right, and one control. */
export function Field({ label, value, children }: { label: string; value?: ReactNode; children: ReactNode }) {
  const id = useId()
  const ids = { labelId: `${id}-l`, controlId: `${id}-c` }
  return (
    <FieldIds.Provider value={ids}>
      <div className="field">
        <div className="field-head">
          <label className="label" id={ids.labelId} htmlFor={ids.controlId}>
            {label}
          </label>
          {value !== undefined && <span className="value">{value}</span>}
        </div>
        {children}
      </div>
    </FieldIds.Provider>
  )
}

export function Chips<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
  label,
}: {
  value: T
  options: { id: T; label: string }[]
  onChange: (v: T) => void
  disabled?: boolean
  /** Only needed outside a Field. */
  label?: string
}) {
  const { labelId } = useFieldIds()
  const index = options.findIndex((o) => o.id === value)
  return (
    <div
      className="chips"
      role="radiogroup"
      aria-labelledby={label ? undefined : labelId}
      aria-label={label}
      aria-disabled={disabled || undefined}
      onKeyDown={(e) =>
        !disabled &&
        onRadioKeys(
          e,
          options.map((o) => o.id),
          index,
          onChange,
        )
      }
    >
      {options.map((o, i) => (
        <button
          type="button"
          key={String(o.id)}
          role="radio"
          aria-checked={o.id === value}
          tabIndex={i === index || (index < 0 && i === 0) ? 0 : -1}
          disabled={disabled}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Swatches({
  value,
  colors,
  onChange,
}: {
  value: string
  colors: { label: string; color: string }[]
  onChange: (c: string) => void
}) {
  const { labelId } = useFieldIds()
  const index = colors.findIndex((c) => c.color.toLowerCase() === value.toLowerCase())
  return (
    <div className="swatches">
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="swatch-set"
        onKeyDown={(e) =>
          onRadioKeys(
            e,
            colors.map((c) => c.color),
            index,
            onChange,
          )
        }
      >
        {colors.map((c, i) => (
          <button
            type="button"
            key={c.color}
            role="radio"
            aria-checked={i === index}
            aria-label={c.label}
            title={c.label}
            tabIndex={i === index || (index < 0 && i === 0) ? 0 : -1}
            style={{ background: c.color }}
            onClick={() => onChange(c.color)}
          />
        ))}
      </div>
      <label
        className={`custom-color${index < 0 ? ' on' : ''}`}
        title="Custom color"
        style={index < 0 ? { background: value } : undefined}
      >
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Custom color" />
      </label>
    </div>
  )
}

const clamp = (v: number, min = -Infinity, max = Infinity) => Math.min(max, Math.max(min, v))
const roundTo = (v: number, step: number) => Math.round(v / step) * step
const show = (v: number) => String(Math.round(v * 10) / 10)

/**
 * A number with its unit and − / + steppers. Typing only commits values inside
 * min–max, so a half-typed "1" never shrinks a bed to one centimeter; leaving
 * the field clamps whatever is there.
 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  name,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  /** What the number is, for the stepper buttons: "width" gives "Decrease width". */
  name: string
}) {
  const { controlId } = useFieldIds()
  // What the viewer is typing; null shows the live value.
  const [draft, setDraft] = useState<string | null>(null)

  const commit = (v: number) => {
    const next = clamp(v, min, max)
    if (next !== value) onChange(next)
  }
  const stepBy = (dir: 1 | -1) => {
    setDraft(null)
    commit(roundTo(value + dir * step, step))
  }

  return (
    <div className="number">
      <button
        type="button"
        className="step"
        aria-label={`Decrease ${name}`}
        disabled={min !== undefined && value <= min}
        onClick={() => stepBy(-1)}
      >
        <Icon name="minus" size={14} />
      </button>
      <input
        id={controlId}
        type="text"
        inputMode="decimal"
        aria-label={unit ? undefined : name}
        aria-describedby={unit ? `${controlId}-unit` : undefined}
        value={draft ?? show(value)}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          setDraft(e.target.value)
          const v = parseNumber(e.target.value)
          if (v !== null && v >= (min ?? -Infinity) && v <= (max ?? Infinity)) onChange(v)
        }}
        onBlur={() => {
          if (draft === null) return
          const v = parseNumber(draft)
          setDraft(null)
          commit(v ?? value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            stepBy(e.key === 'ArrowUp' ? 1 : -1)
          } else if (e.key === 'Enter') e.currentTarget.blur()
          else if (e.key === 'Escape' && draft !== null) {
            e.stopPropagation()
            setDraft(null)
          }
        }}
      />
      {unit && (
        <span className="unit" id={`${controlId}-unit`}>
          {unit}
        </span>
      )}
      <button
        type="button"
        className="step"
        aria-label={`Increase ${name}`}
        disabled={max !== undefined && value >= max}
        onClick={() => stepBy(1)}
      >
        <Icon name="plus" size={14} />
      </button>
    </div>
  )
}

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format: (v: number) => string
}) {
  const { controlId } = useFieldIds()
  return (
    <input
      id={controlId}
      className="slider"
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-valuetext={format(value)}
      style={{ '--fill': `${((value - min) / (max - min)) * 100}%` } as CSSProperties}
      onChange={(e) => onChange(parseFloat(e.target.value))}
    />
  )
}

/** An on/off setting. The label names what happens when it is on. */
export function Switch({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  const id = useId()
  return (
    <div className="switch-row">
      <label htmlFor={id}>{label}</label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        className="switch"
        onClick={() => onChange(!checked)}
      >
        <span className="knob" />
      </button>
    </div>
  )
}
