// Saving a layout: a debounced writer that knows what is on disk.
//
// The store hands it the serialized layout after every change. It writes once
// the changes pause, skips writes that would put back what is already on disk
// (a cancelled drag, an undo to the saved state) and remembers what it wrote,
// so the file watcher's echo of this tab's own save is not mistaken for an
// edit made somewhere else.

export interface Saver<T> {
  /** The file on disk now has `body` (it was just loaded or renamed). Cancels a pending write. */
  synced(body: string): void
  /** The layout changed to `body`: write it to `target` once changes pause, unless it is what is on disk. */
  change(body: string, target: T): void
  /** Writes a pending change now; resolves once it is written. */
  flush(): Promise<void>
  /** Drops a pending change without writing it. */
  cancel(): void
  /** Whether `text` read from disk is something this saver wrote (or loaded) itself. */
  isOwn(text: string): boolean
}

export function createSaver<T>(write: (body: string, target: T) => Promise<void>, delayMs = 400): Saver<T> {
  let onDisk = ''
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: (() => Promise<void>) | null = null
  /** Bodies written recently: the watcher may report them after a newer write. */
  const written: string[] = []

  const cancel = () => {
    clearTimeout(timer)
    pending = null
  }

  return {
    synced(body) {
      cancel()
      onDisk = body
    },
    change(body, target) {
      cancel()
      if (body === onDisk) return
      const save = async () => {
        onDisk = body
        written.push(body)
        if (written.length > 8) written.shift()
        await write(body, target)
      }
      pending = save
      timer = setTimeout(() => {
        pending = null
        void save()
      }, delayMs)
    },
    async flush() {
      const save = pending
      cancel()
      if (save) await save()
    },
    cancel,
    isOwn(text) {
      return text === onDisk || written.includes(text)
    },
  }
}
