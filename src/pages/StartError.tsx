import { links } from '../project/launch'
import './pages.css'

/** A plan that would not open: missing, or not a valid plan (with every problem listed). */
export function StartError({ space, message }: { space: string; message: string }) {
  return (
    <main className="page">
      <div className="page-inner">
        <h1>This plan cannot be opened</h1>
        <pre className="notice error" style={{ whiteSpace: 'pre-wrap' }}>
          {message}
        </pre>
        <p>
          <a className="btn" href={links.space(space)}>
            Back to your plans
          </a>
        </p>
      </div>
    </main>
  )
}
