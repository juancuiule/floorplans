import { memo, useMemo } from 'react'
import { useDecor } from '../decor/store'
import type { DecorItem } from '../model/decor'
import { matches } from './format'
import { Icon } from './icons'
import type { Entry } from './libraryEntries'

// Catalog lists for furniture, plants and lights. Choosing a row starts placing
// a new item, which then follows the pointer until the next click.

export function CatalogLibrary({
  entries,
  query,
  noun,
  onClear,
}: {
  entries: Entry[]
  query: string
  noun: string
  onClear: () => void
}) {
  const startPlacing = useDecor((s) => s.startPlacing)
  const groups = useMemo(() => {
    const hits = entries.filter((e) => matches(query, e.name, e.note, e.group, e.keywords))
    const out = new Map<string, Entry[]>()
    for (const e of hits) out.set(e.group, [...(out.get(e.group) ?? []), e])
    return [...out]
  }, [entries, query])

  const total = groups.reduce((n, [, list]) => n + list.length, 0)

  return (
    <div className="library">
      <p className="sr-only" role="status">
        {query.trim() ? `${total} ${total === 1 ? 'result' : 'results'}` : ''}
      </p>
      {groups.length === 0 && <NoResults query={query} noun={noun} onClear={onClear} />}
      {groups.map(([group, list]) => (
        <section key={group} className="lib-group" aria-labelledby={`g-${group.replace(/\W+/g, '-')}`}>
          <h3 className="group-label" id={`g-${group.replace(/\W+/g, '-')}`}>
            {group} <span className="count">{list.length}</span>
          </h3>
          <ul className="rows">
            {list.map((e) => (
              <LibraryRow key={e.key} entry={e} onPick={startPlacing} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

const LibraryRow = memo(function LibraryRow({ entry, onPick }: { entry: Entry; onPick: (item: DecorItem) => void }) {
  return (
    <li>
      <button type="button" className="lib-row" onClick={() => onPick(entry.create())}>
        <span className="tile">
          <Icon name={entry.icon} size={20} />
        </span>
        <span className="lib-text">
          <span className="name">{entry.name}</span>
          <span className="note">{entry.note}</span>
        </span>
        {entry.meta && <span className="meta">{entry.meta}</span>}
        <Icon name="plus" size={14} className="add" />
      </button>
    </li>
  )
})

export function NoResults({ query, noun, onClear }: { query: string; noun: string; onClear: () => void }) {
  return (
    <div className="empty">
      <p className="empty-title">
        Nothing in {noun} matches “{query.trim()}”
      </p>
      <p className="note">Try a shorter word, like a room or a material.</p>
      <button type="button" className="btn" onClick={onClear}>
        Clear search
      </button>
    </div>
  )
}
