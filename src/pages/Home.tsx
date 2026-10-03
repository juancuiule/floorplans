import { useState, type FormEvent } from 'react'
import { createSpace } from '../decor/api'
import { forgetSpace, recentSpaces, rememberSpace } from './recent'
import { links } from '../project/launch'
import './pages.css'

/** The front door: the spaces this browser has opened, and a new one. */
export function Home() {
  const [spaces, setSpaces] = useState(recentSpaces)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const id = await createSpace(name.trim() || 'My space')
      rememberSpace(id, name.trim() || 'My space')
      window.location.href = links.space(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <div className="page-inner">
        <header className="page-head">
          <span className="brand">Floorplan</span>
        </header>
        <h1>Plan your home in 3D</h1>
        <p className="lede">
          Draw your apartment, furnish it from a shared catalog of furniture, plants and lights, hang your own artwork,
          and see it in the real sun.
        </p>

        <h2>Start a space</h2>
        <form className="inline-form" onSubmit={create}>
          <label className="sr-only" htmlFor="space-name">
            Name
          </label>
          <input
            id="space-name"
            type="text"
            placeholder="Our flat"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="btn primary" type="submit" disabled={busy}>
            Create a space
          </button>
        </form>
        <p className="notice">
          A space holds your plans, their layouts and your artwork. There are no accounts yet: anyone with a space’s
          link can open and edit it, so keep the link to yourself and bookmark it.
        </p>
        {error && <p className="notice error">{error}</p>}

        {spaces.length > 0 && (
          <>
            <h2>Your spaces on this browser</h2>
            <div className="cards">
              {spaces.map((s) => (
                <article key={s.id} className="card">
                  <a className="card-title" href={links.space(s.id)} style={{ color: 'inherit' }}>
                    {s.name || 'Untitled space'}
                  </a>
                  <span className="card-meta">Opened {new Date(s.opened).toLocaleDateString()}</span>
                  <div className="card-actions">
                    <a className="btn primary" href={links.space(s.id)}>
                      Open
                    </a>
                    <button
                      className="btn"
                      type="button"
                      title="Only from this browser’s list: the space itself is kept"
                      onClick={() => {
                        forgetSpace(s.id)
                        setSpaces(recentSpaces())
                      }}
                    >
                      Remove from this list
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
