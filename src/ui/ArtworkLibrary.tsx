import { memo, useMemo, useRef, useState } from 'react'
import { FRAME_COLORS, SIZE_PRESETS } from '../decor/catalog'
import type { LibraryImage } from '../decor/api'
import { newId } from '../decor/clone'
import { useDecor } from '../decor/store'
import { matches } from './format'
import { Icon } from './icons'
import { NoResults } from './Libraries'
import { unplacedAt } from '../model/decor'
import { ACCEPT, uploadFiles, useUploads } from './uploads'

// The artwork library: this space's own images (never shared with other spaces), searchable, and a drop
// zone for uploading more.

function naturalSize(url: string, el: HTMLImageElement | null): Promise<[number, number]> {
  if (el?.complete && el.naturalWidth) return Promise.resolve([el.naturalWidth, el.naturalHeight])
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve([img.naturalWidth || 1, img.naturalHeight || 1])
    img.onerror = () => resolve([1, 1])
    img.src = url
  })
}

export function ArtworkLibrary({ query, onClear }: { query: string; onClear: () => void }) {
  const library = useDecor((s) => s.library)
  const startPlacing = useDecor((s) => s.startPlacing)
  const input = useRef<HTMLInputElement>(null)
  const shown = useMemo(() => library.filter((img) => matches(query, img.name)), [library, query])

  const place = async (url: string, el: HTMLImageElement | null) => {
    const [width, height] = await naturalSize(url, el)
    const landscape = width > height * 1.05
    const [pw, ph] = SIZE_PRESETS[1].size
    startPlacing({
      kind: 'artwork',
      id: newId('artwork'),
      image: url,
      at: unplacedAt(),
      facing: 'z+',
      size: { preset: 'A4', w: landscape ? ph : pw, h: landscape ? pw : ph },
      fit: 'cover',
      frame: { style: 'thin', color: FRAME_COLORS[0].color, mat: 0 },
    })
  }

  return (
    <div className="library">
      <UploadBox onBrowse={() => input.current?.click()} />
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = ''
          void uploadFiles(files)
        }}
      />
      {library.length === 0 ? (
        <div className="empty">
          <p className="empty-title">No images yet</p>
          <p className="note">
            Upload a photo or a print to hang it on a wall. Your images stay in this space: other spaces never see them.
          </p>
        </div>
      ) : shown.length === 0 ? (
        <NoResults query={query} noun="artwork" onClear={onClear} />
      ) : (
        <section className="lib-group" aria-labelledby="g-images">
          <h3 className="group-label" id="g-images">
            Choose an image to hang <span className="count">{shown.length}</span>
          </h3>
          <ul className="thumbs">
            {shown.map((img) => (
              <Thumb key={img.url} img={img} onPick={place} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

const Thumb = memo(function Thumb({
  img,
  onPick,
}: {
  img: LibraryImage
  onPick: (url: string, el: HTMLImageElement | null) => void
}) {
  const [loaded, setLoaded] = useState(false)
  const ref = useRef<HTMLImageElement>(null)
  return (
    <li>
      <button
        type="button"
        className={`thumb${loaded ? ' loaded' : ''}`}
        title={img.name}
        aria-label={`Hang ${img.name}`}
        onClick={() => onPick(img.url, ref.current)}
      >
        <img ref={ref} src={img.url} alt="" loading="lazy" decoding="async" onLoad={() => setLoaded(true)} />
      </button>
    </li>
  )
})

function UploadBox({ onBrowse }: { onBrowse: () => void }) {
  const { total, done, current, errors, dismiss } = useUploads()
  const busy = total > 0
  return (
    <div className="upload">
      <button type="button" className="dropzone" onClick={onBrowse} disabled={busy}>
        <Icon name="upload" size={18} />
        <span>
          <strong>Upload images</strong>
          <span className="note">or drop them anywhere on this panel</span>
        </span>
      </button>
      <div role="status" className="upload-status">
        {busy && (
          <>
            <span>
              Uploading {Math.min(done + 1, total)} of {total}
              {current ? ` · ${current}` : ''}
            </span>
            <progress max={total} value={done + 0.5} aria-label="Upload progress" />
          </>
        )}
      </div>
      {errors.length > 0 && (
        <ul className="upload-errors">
          {errors.map((e) => (
            <li key={e.id} role="alert">
              <Icon name="alert" size={14} />
              <span>{e.text}</span>
              <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => dismiss(e.id)}>
                <Icon name="close" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
