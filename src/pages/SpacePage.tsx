import { useCallback, useEffect, useState } from 'react'
import {
  createPlan,
  deletePlan,
  deleteSpace,
  getSpace,
  listTemplates,
  renameSpace,
  type SpaceInfo,
  type TemplateInfo,
} from '../decor/api'
import { forgetSpace, rememberSpace } from './recent'
import { links } from '../project/launch'
import './pages.css'

/** A space: its plans, and new ones drawn from scratch or copied from a template. */
export function SpacePage({ space }: { space: string }) {
  const [info, setInfo] = useState<SpaceInfo | null>(null)
  const [templates, setTemplates] = useState<TemplateInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [copied, setCopied] = useState(false)

  const show = useCallback(
    (s: SpaceInfo) => {
      setInfo(s)
      setName(s.name)
      rememberSpace(space, s.name)
      document.title = `${s.name} · Floorplan`
    },
    [space],
  )
  const refresh = useCallback(async () => show(await getSpace(space)), [space, show])

  useEffect(() => {
    getSpace(space).then(show, (e) => setError(e instanceof Error ? e.message : String(e)))
    listTemplates().then(setTemplates, () => setTemplates([]))
  }, [space, show])

  const run = async (action: () => Promise<unknown>) => {
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const saveName = () =>
    run(async () => {
      if (!info || name.trim() === info.name) return
      await renameSpace(space, name.trim())
      await refresh()
    })

  const fromTemplate = (t: TemplateInfo) =>
    run(async () => {
      const id = await createPlan(space, { name: t.name, template: t.id })
      window.location.href = links.plan(space, id)
    })

  const remove = (id: string, planName: string) =>
    run(async () => {
      if (!window.confirm(`Delete “${planName}” and all its layouts? This cannot be undone.`)) return
      await deletePlan(space, id)
      await refresh()
    })

  const [confirmName, setConfirmName] = useState('')
  const removeSpace = () =>
    run(async () => {
      if (!info || confirmName.trim() !== info.name) return
      await deleteSpace(space)
      forgetSpace(space)
      window.location.href = links.home()
    })

  const copyLink = async () => {
    await navigator.clipboard?.writeText(window.location.href).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (!info)
    return (
      <main className="page">
        <div className="page-inner">
          <a className="brand" href={links.home()}>
            Floorplan
          </a>
          {error ? (
            <p className="notice error">This space cannot be opened: {error}</p>
          ) : (
            <p className="notice">Loading…</p>
          )}
        </div>
      </main>
    )

  return (
    <main className="page">
      <div className="page-inner">
        <header className="page-head">
          <a className="brand" href={links.home()}>
            Floorplan
          </a>
          <button className="btn" type="button" onClick={copyLink}>
            {copied ? 'Link copied' : 'Copy this space’s link'}
          </button>
        </header>
        <label className="sr-only" htmlFor="space-title">
          Space name
        </label>
        <input
          id="space-title"
          className="title-input"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <p className="lede">
          Your plans, each with its own layouts. Your artwork library is shared by these plans and private to this
          space.
        </p>
        {error && <p className="notice error">{error}</p>}

        <h2>Plans</h2>
        <div className="cards">
          {info.plans.map((p) => (
            <article key={p.id} className="card">
              <a className="card-title" href={links.plan(space, p.id)} style={{ color: 'inherit' }}>
                {p.name}
              </a>
              <span className="card-meta">{p.subtitle}</span>
              <span className="card-meta">Changed {new Date(p.updated).toLocaleString()}</span>
              <div className="card-actions">
                <a className="btn primary" href={links.plan(space, p.id)}>
                  Open in 3D
                </a>
                {p.sketched && (
                  <a className="btn" href={links.floorplan(space, p.id)}>
                    Edit floor plan
                  </a>
                )}
                <button className="btn danger" type="button" onClick={() => remove(p.id, p.name)}>
                  Delete
                </button>
              </div>
            </article>
          ))}
          <a className="card new" href={links.floorplan(space)}>
            <span className="card-title">Draw a floor plan</span>
            <span className="card-meta">
              Trace a picture of your floor plan, or draw rooms on a grid. Walls are worked out for you.
            </span>
          </a>
        </div>

        {templates.length > 0 && (
          <>
            <h2>Or start from an example</h2>
            <div className="cards">
              {templates.map((t) => (
                <button key={t.id} type="button" className="card" onClick={() => fromTemplate(t)}>
                  <span className="card-title">{t.name}</span>
                  <span className="card-meta">{t.subtitle}</span>
                  <span className="card-meta">A copy you can change, furnished but without artwork.</span>
                </button>
              ))}
            </div>
          </>
        )}

        <section className="danger-zone" aria-labelledby="delete-space">
          <h2 id="delete-space">Delete this space</h2>
          <p className="lede">
            Deletes {whatItHolds(info.plans.length)}, for everyone with the link. This cannot be undone.
          </p>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault()
              void removeSpace()
            }}
          >
            <label className="sr-only" htmlFor="confirm-delete">
              Type the space’s name to confirm
            </label>
            <input
              id="confirm-delete"
              type="text"
              placeholder={`Type “${info.name}” to confirm`}
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              autoComplete="off"
            />
            <button className="btn danger" type="submit" disabled={confirmName.trim() !== info.name}>
              Delete space
            </button>
          </form>
        </section>
      </div>
    </main>
  )
}

/** What deleting a space takes with it, in words. */
function whatItHolds(plans: number) {
  if (plans === 0) return 'its artwork'
  if (plans === 1) return 'its plan, the plan’s layouts and its artwork'
  return `its ${plans} plans, all their layouts and its artwork`
}
