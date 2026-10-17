import type { LayoutInfo } from '../model/layoutNames'

export type { LayoutInfo }

// The client of the API (server/api.ts, docs/adr/0010). The only module that
// knows the routes. Layout and artwork calls act on the open space and plan,
// set once at startup with setScope().

export interface LibraryImage {
  name: string
  url: string
}

/** A request the server answered with an error, or did not answer. */
export class ApiError extends Error {}

/** Reading a layout file: its exact text (to recognize this tab's own writes) and its parsed JSON, unchecked. */
export type LayoutRead =
  | { ok: true; text: string; json: unknown }
  /** No dev API: a static build answers with its index.html, or not at all. */
  | { ok: false; reason: 'no-api' }
  /** The file is not JSON (a hand edit half done). */
  | { ok: false; reason: 'broken-file' }

let scope = { space: '', plan: '' }

/** The space and plan this page edits; layout and artwork calls go to them. */
export function setScope(space: string, plan: string) {
  scope = { space, plan }
}

const spaceBase = (space = scope.space) => `/api/spaces/${encodeURIComponent(space)}`
const planBase = () => `${spaceBase()}/plans/${encodeURIComponent(scope.plan)}`

const fileQuery = (slug: string | null) => (slug ? `?file=${encodeURIComponent(slug)}` : '')
const json = (body: unknown): RequestInit => ({
  body: JSON.stringify(body),
  headers: { 'Content-Type': 'application/json' },
})

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new ApiError('The server is not answering')
  }
  const body = (await res.json().catch(() => ({}))) as T & { message?: string; error?: string }
  if (!res.ok) throw new ApiError(body.message ?? body.error ?? `Request failed (${res.status})`)
  return body
}

export async function readLayout(slug: string | null): Promise<LayoutRead> {
  let res: Response
  try {
    res = await fetch(`${planBase()}/decor${fileQuery(slug)}`)
  } catch {
    return { ok: false, reason: 'no-api' }
  }
  if (!res.ok || /html/.test(res.headers.get('Content-Type') ?? '')) return { ok: false, reason: 'no-api' }
  const text = await res.text()
  try {
    return { ok: true, text, json: JSON.parse(text) as unknown }
  } catch {
    return { ok: false, reason: 'broken-file' }
  }
}

/** The layout file's text as it is on disk, or null when it cannot be read. */
export async function readLayoutText(slug: string | null): Promise<string | null> {
  return fetch(`${planBase()}/decor${fileQuery(slug)}`)
    .then((r) => r.text())
    .catch(() => null)
}

/** Writes a serialized layout. Failures are dropped: the next change saves again. */
export async function writeLayout(slug: string | null, body: string): Promise<void> {
  await fetch(`${planBase()}/decor${fileQuery(slug)}`, {
    method: 'PUT',
    body,
    headers: { 'Content-Type': 'application/json' },
  }).catch(() => {})
}

/** Another plan of the open space: the plan and its main layout, unchecked. */
export async function readOtherPlan(plan: string): Promise<{ plan: unknown; layout: unknown }> {
  const base = `${spaceBase()}/plans/${encodeURIComponent(plan)}`
  return { plan: await call<unknown>(base), layout: await call<unknown>(`${base}/decor`) }
}

export const listLayouts = () => call<LayoutInfo[]>(`${planBase()}/layouts`)

/** Saves `data` as a new layout named `name`; returns the slug the server picked. */
export const createLayout = (name: string, data: unknown) =>
  call<{ slug: string; name: string }>(`${planBase()}/layouts`, { method: 'POST', ...json({ name, data }) })

/** Renames a layout; a named one may move to a new slug. */
export const renameLayout = (slug: string | null, name: string) =>
  call<{ slug: string | null; name: string }>(`${planBase()}/layouts${fileQuery(slug)}`, {
    method: 'PATCH',
    ...json({ name }),
  })

export const deleteLayout = (slug: string | null) =>
  call<unknown>(`${planBase()}/layouts${fileQuery(slug)}`, { method: 'DELETE' })

export async function listArtwork(): Promise<LibraryImage[] | null> {
  try {
    const res = await fetch(`${spaceBase()}/artwork`)
    return res.ok ? ((await res.json()) as LibraryImage[]) : null
  } catch {
    return null
  }
}

export const uploadArtwork = (file: File) =>
  call<LibraryImage>(`${spaceBase()}/artwork?name=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    body: file,
    headers: { 'Content-Type': 'application/octet-stream' },
  })

/** Where the page loads a picture from: local paths as they are, other links through the dev server (no CORS). */
export function screenImageSrc(link: string): string | null {
  const s = link.trim()
  if (!s) return null
  if (s.startsWith('/')) return s
  if (/^https?:\/\//i.test(s)) return `/api/image?url=${encodeURIComponent(s)}`
  return null
}

// ---------- spaces and plans ----------

export interface PlanSummary {
  id: string
  name: string
  subtitle: string
  /** Drawn in the floor plan editor, so it can be edited there again. */
  sketched: boolean
  updated: string
}

export interface SpaceInfo {
  id: string
  name: string
  plans: PlanSummary[]
}

export interface TemplateInfo {
  id: string
  name: string
  subtitle: string
}

export const createSpace = (name: string) =>
  call<{ id: string }>('/api/spaces', { method: 'POST', ...json({ name }) }).then((r) => r.id)
export const getSpace = (space: string) => call<SpaceInfo>(spaceBase(space))
export const renameSpace = (space: string, name: string) =>
  call<unknown>(spaceBase(space), { method: 'PATCH', ...json({ name }) })
/** Deletes a space with its plans, layouts and images. There is no undo. */
export const deleteSpace = (space: string) => call<unknown>(spaceBase(space), { method: 'DELETE' })
export const listTemplates = () => call<TemplateInfo[]>('/api/templates')

/** Adds a plan: a copy of a template, or a plan drawn in the editor. Returns its id. */
export const createPlan = (space: string, body: { name: string; template?: string; plan?: unknown }) =>
  call<{ id: string }>(`${spaceBase(space)}/plans`, { method: 'POST', ...json(body) }).then((r) => r.id)
/** A plan as stored, unchecked. */
export const readPlan = (space: string, plan: string) =>
  call<unknown>(`${spaceBase(space)}/plans/${encodeURIComponent(plan)}`)
export const writePlan = (space: string, plan: string, data: unknown) =>
  call<unknown>(`${spaceBase(space)}/plans/${encodeURIComponent(plan)}`, { method: 'PUT', ...json(data) })
export const deletePlan = (space: string, plan: string) =>
  call<unknown>(`${spaceBase(space)}/plans/${encodeURIComponent(plan)}`, { method: 'DELETE' })

/** Uploads a floor plan image to trace in the editor; it goes to the space's references, not its artwork. */
export const uploadReference = (space: string, file: File) =>
  call<LibraryImage>(`${spaceBase(space)}/references?name=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    body: file,
    headers: { 'Content-Type': 'application/octet-stream' },
  })
