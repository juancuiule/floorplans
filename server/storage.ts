import { randomBytes } from 'node:crypto'
import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
import { isPlanMainSlug, layoutFileName, slugify, slugOfFileName } from '../src/model/layoutNames.ts'
import { validatePlan } from '../src/model/validate.ts'
import { HttpError } from './http.ts'

// Where everyone's data lives (docs/adr/0010-spaces.md). A space is one person's
// (or one household's) corner of the app: their plans, the layouts of each plan
// and their artwork. Nothing in a space is shared with another; the catalog of
// furniture, plants and lamps is code, the same for everyone.
//
//   <root>/spaces/<space>/space.json                 { name, created }
//   <root>/spaces/<space>/plans/<plan>.plan.json
//   <root>/spaces/<space>/layouts/<plan>/decor*.json  decor.json is the plan's main layout
//   <root>/spaces/<space>/artwork/*
//   <root>/spaces/<space>/references/*              floor plan images traced in the editor
//
// Templates are the example workspaces in examples/ (docs/adr/0009): a new plan
// can start as a copy of one, without its artwork.

/** The image libraries of a space. */
export type Library = 'artwork' | 'references'

/** Space and plan ids: lowercase letters, digits and dashes, safe in paths and URLs. */
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/

export interface PlanSummary {
  id: string
  name: string
  subtitle: string
  /** The plan was drawn in the floor plan editor and can be opened there again. */
  sketched: boolean
  /** ISO time of the last change to the plan or any of its layouts. */
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

const write = (file: string, data: unknown) => fs.writeFile(file, JSON.stringify(data, null, 2) + '\n')
const readJson = async (file: string): Promise<Record<string, unknown>> =>
  JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>

function checkId(id: string, what: string) {
  if (!ID.test(id)) throw new HttpError(`Bad ${what} id`, 400)
}

/** Artwork links in a layout point at the space's own library; a copy into another space drops them. */
const withoutArtwork = (layout: Record<string, unknown>): Record<string, unknown> => ({
  ...layout,
  items: Array.isArray(layout.items) ? layout.items.filter((i) => (i as { kind?: string })?.kind !== 'artwork') : [],
})

export class SpaceStore {
  /** The data folder (FLOORPLAN_DATA). */
  readonly root: string
  /** Folder of example workspaces offered as templates. */
  readonly templatesRoot: string

  constructor(root: string, templatesRoot: string) {
    this.root = root
    this.templatesRoot = templatesRoot
  }

  spaceDir(space: string) {
    checkId(space, 'space')
    return path.join(this.root, 'spaces', space)
  }
  planFile(space: string, plan: string) {
    checkId(plan, 'plan')
    return path.join(this.spaceDir(space), 'plans', `${plan}.plan.json`)
  }
  layoutsDir(space: string, plan: string) {
    checkId(plan, 'plan')
    return path.join(this.spaceDir(space), 'layouts', plan)
  }
  artworkDir(space: string) {
    return this.libraryDir(space, 'artwork')
  }
  /** A space's image folders: `artwork` (hung on walls) and `references` (floor plans traced in the editor). */
  libraryDir(space: string, library: Library) {
    return path.join(this.spaceDir(space), library)
  }
  /** The URL the app loads an image of this space from. */
  artworkUrl(space: string, name: string, library: Library = 'artwork') {
    return `/api/spaces/${space}/${library}/${encodeURIComponent(name)}`
  }

  async requireSpace(space: string) {
    if (!existsSync(path.join(this.spaceDir(space), 'space.json'))) throw new HttpError('No such space', 404)
  }

  async requirePlan(space: string, plan: string) {
    await this.requireSpace(space)
    if (!existsSync(this.planFile(space, plan))) throw new HttpError('No such plan', 404)
  }

  async createSpace(name: unknown, id = randomId()): Promise<string> {
    checkId(id, 'space')
    const dir = this.spaceDir(id)
    if (existsSync(dir)) throw new HttpError('That space already exists', 409)
    await fs.mkdir(path.join(dir, 'plans'), { recursive: true })
    await write(path.join(dir, 'space.json'), { name: cleanName(name, 'My space'), created: new Date().toISOString() })
    return id
  }

  async space(space: string): Promise<SpaceInfo> {
    await this.requireSpace(space)
    const meta = await readJson(path.join(this.spaceDir(space), 'space.json'))
    return { id: space, name: String(meta.name ?? space), plans: await this.plans(space) }
  }

  async renameSpace(space: string, name: unknown) {
    await this.requireSpace(space)
    const file = path.join(this.spaceDir(space), 'space.json')
    await write(file, { ...(await readJson(file)), name: cleanName(name, 'My space') })
  }

  async plans(space: string): Promise<PlanSummary[]> {
    const dir = path.join(this.spaceDir(space), 'plans')
    const files = existsSync(dir) ? (await fs.readdir(dir)).filter((f) => f.endsWith('.plan.json')) : []
    const out: PlanSummary[] = []
    for (const f of files) {
      const id = f.replace(/\.plan\.json$/, '')
      const plan = await readJson(path.join(dir, f)).catch(() => ({}) as Record<string, unknown>)
      out.push({
        id,
        name: typeof plan.name === 'string' ? plan.name : id,
        subtitle: typeof plan.subtitle === 'string' ? plan.subtitle : '',
        sketched: !!plan.sketch,
        updated: await this.updated(space, id),
      })
    }
    return out.sort((a, b) => b.updated.localeCompare(a.updated))
  }

  /** The newest change to a plan or its layouts. */
  private async updated(space: string, plan: string): Promise<string> {
    const files = [this.planFile(space, plan)]
    const layouts = this.layoutsDir(space, plan)
    if (existsSync(layouts)) for (const f of await fs.readdir(layouts)) files.push(path.join(layouts, f))
    const times = await Promise.all(
      files.map((f) =>
        fs.stat(f).then(
          (s) => s.mtimeMs,
          () => 0,
        ),
      ),
    )
    return new Date(Math.max(...times)).toISOString()
  }

  async readPlan(space: string, plan: string): Promise<string> {
    await this.requirePlan(space, plan)
    return fs.readFile(this.planFile(space, plan), 'utf8')
  }

  /** Replaces a plan; it must be valid, and keep its id. */
  async writePlan(space: string, plan: string, data: Record<string, unknown>) {
    await this.requirePlan(space, plan)
    if (data.id !== plan) throw new HttpError(`The plan's id must stay "${plan}"`)
    checkPlan(data)
    await write(this.planFile(space, plan), data)
  }

  /**
   * Adds a plan to a space: `plan` as given (from the floor plan editor), or a
   * copy of a template with its main layout. Returns the new plan's id, derived
   * from its name.
   */
  async createPlan(space: string, body: { name?: unknown; template?: unknown; plan?: unknown }): Promise<string> {
    await this.requireSpace(space)
    let data: Record<string, unknown>
    let layout: Record<string, unknown> | null = null
    if (body.plan && typeof body.plan === 'object') data = { ...(body.plan as Record<string, unknown>) }
    else if (typeof body.template === 'string') {
      const t = await this.template(body.template)
      data = t.plan
      layout = t.layout
    } else throw new HttpError('A new plan needs a template or a plan')
    data.name = cleanName(body.name ?? data.name, 'New plan')
    const id = await this.freePlanId(space, slugify(String(data.name)))
    data.id = id
    checkPlan(data)
    await fs.mkdir(path.dirname(this.planFile(space, id)), { recursive: true })
    await write(this.planFile(space, id), data)
    if (layout) {
      await fs.mkdir(this.layoutsDir(space, id), { recursive: true })
      const { plan: _plan, ...rest } = withoutArtwork(layout)
      await write(path.join(this.layoutsDir(space, id), layoutFileName(null)), rest)
    }
    return id
  }

  async deletePlan(space: string, plan: string) {
    await this.requirePlan(space, plan)
    await fs.rm(this.planFile(space, plan))
    await fs.rm(this.layoutsDir(space, plan), { recursive: true, force: true })
  }

  private async freePlanId(space: string, wanted: string) {
    const base = wanted.slice(0, 36).replace(/-+$/, '') || 'plan'
    if (!existsSync(this.planFile(space, base))) return base
    for (let i = 2; ; i++) if (!existsSync(this.planFile(space, `${base}-${i}`))) return `${base}-${i}`
  }

  async templates(): Promise<TemplateInfo[]> {
    if (!existsSync(this.templatesRoot)) return []
    const out: TemplateInfo[] = []
    for (const id of (await fs.readdir(this.templatesRoot)).sort()) {
      const t = await this.template(id).catch(() => null)
      if (t) out.push({ id, name: String(t.plan.name ?? id), subtitle: String(t.plan.subtitle ?? '') })
    }
    return out
  }

  /** A template's default plan and its main layout. */
  private async template(id: string) {
    checkId(id, 'template')
    const dir = path.join(this.templatesRoot, id)
    const ws = await readJson(path.join(dir, 'workspace.json')).catch(() => {
      throw new HttpError('No such template', 404)
    })
    const planId = String(ws.defaultPlan)
    const plan = await readJson(path.join(dir, 'plans', `${planId}.plan.json`))
    const layout = await readJson(path.join(dir, 'layouts', 'decor.json')).catch(() => null)
    return { plan, layout }
  }

  /**
   * Copies an example-style workspace (examples/<name>/, docs/adr/0009) into a
   * new space, artwork included: its owner's way in. Layouts are sorted into
   * their plans, and artwork links point at the new space's library.
   */
  async importWorkspace(dir: string, opts: { id?: string; name?: string } = {}): Promise<string> {
    const ws = await readJson(path.join(dir, 'workspace.json'))
    const space = await this.createSpace(opts.name ?? ws.name, opts.id)
    const defaultPlan = String(ws.defaultPlan)
    const planIds: string[] = []
    for (const f of await fs.readdir(path.join(dir, 'plans'))) {
      if (!f.endsWith('.plan.json')) continue
      await fs.copyFile(path.join(dir, 'plans', f), this.planFile(space, f.replace(/\.plan\.json$/, '')))
      planIds.push(f.replace(/\.plan\.json$/, ''))
    }
    const artwork = path.join(dir, 'artwork')
    if (existsSync(artwork)) await fs.cp(artwork, this.artworkDir(space), { recursive: true })
    const layouts = path.join(dir, 'layouts')
    for (const f of existsSync(layouts) ? await fs.readdir(layouts) : []) {
      const slug = slugOfFileName(f)
      if (slug === undefined) continue
      const data = await readJson(path.join(layouts, f))
      // A plan's main layout is decor.json in the default plan's folder, decor.plan-<id>.json for the others.
      const plan =
        slug && isPlanMainSlug(slug)
          ? slug.slice('plan-'.length)
          : typeof data.plan === 'string'
            ? data.plan
            : defaultPlan
      if (!planIds.includes(plan)) continue
      const target = slug && isPlanMainSlug(slug) ? null : slug
      const text = JSON.stringify({ ...data, plan: undefined }, null, 2).replaceAll(
        '"/artwork/',
        `"/api/spaces/${space}/artwork/`,
      )
      await fs.mkdir(this.layoutsDir(space, plan), { recursive: true })
      await fs.writeFile(path.join(this.layoutsDir(space, plan), layoutFileName(target)), text + '\n')
    }
    return space
  }
}

/** A space id nobody can guess: the link is the key (docs/adr/0010). */
function randomId() {
  return [...randomBytes(12)].map((b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('')
}

function cleanName(name: unknown, fallback: string) {
  const n = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').slice(0, 60) : ''
  return n || fallback
}

function checkPlan(data: Record<string, unknown>) {
  const problems = validatePlan(data)
  if (problems.length) throw new HttpError(`Not a valid plan: ${problems.slice(0, 5).join('; ')}`)
}
