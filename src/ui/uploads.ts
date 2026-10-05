import type { DragEvent } from 'react'
import { create } from 'zustand'
import { useDecor } from '../decor/store'

// Uploading images to the artwork library: checks, progress and per-file errors.

/** File types the upload picker offers. */
export const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/avif'
const EXT = /\.(png|jpe?g|webp|gif|avif)$/i
const MAX_MB = 30

interface UploadState {
  total: number
  done: number
  current: string | null
  errors: { id: number; text: string }[]
  dismiss: (id: number) => void
}

export const useUploads = create<UploadState>((set) => ({
  total: 0,
  done: 0,
  current: null,
  errors: [],
  dismiss: (id) => set((s) => ({ errors: s.errors.filter((e) => e.id !== id) })),
}))

let errorId = 0
const fail = (text: string) => useUploads.setState((s) => ({ errors: [...s.errors, { id: ++errorId, text }] }))

/** Checks and uploads files one at a time, reporting progress and per-file errors. */
export async function uploadFiles(files: File[]) {
  const ok: File[] = []
  for (const f of files) {
    if (!EXT.test(f.name)) fail(`“${f.name}” is not a supported image. Use PNG, JPEG, WebP, GIF or AVIF.`)
    else if (f.size > MAX_MB * 1024 * 1024) fail(`“${f.name}” is larger than ${MAX_MB} MB. Resize it and try again.`)
    else ok.push(f)
  }
  if (ok.length === 0) return
  const upload = useDecor.getState().upload
  useUploads.setState((s) => ({ total: s.total - s.done + ok.length, done: 0 }))
  for (const f of ok) {
    useUploads.setState({ current: f.name })
    try {
      const img = await upload(f)
      if (!img)
        fail(`Unable to upload “${f.name}”. ${useDecor.getState().uploadError ?? ''} Try again.`.replace(/\s+/g, ' '))
    } catch {
      fail(`Unable to upload “${f.name}”. Check that the dev server is running, then try again.`)
    }
    useUploads.setState((s) => ({ done: s.done + 1 }))
  }
  useUploads.setState({ total: 0, done: 0, current: null })
}

/** True when a drag carries files (not text or a link). */
export const dragHasFiles = (e: DragEvent) => [...e.dataTransfer.types].includes('Files')
