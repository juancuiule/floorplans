import type { Plan } from './plan'

// Checks for data that comes from files people and agents write by hand: plans
// (plans/*.plan.json) and layouts (see src/decor/validateLayout.ts). A check
// returns problems as readable lines ("shell.walls[2].thickness: expected a
// positive number"), empty when the data is fine. Only what the app relies on
// is checked; unknown extra fields are allowed.

export type Problems = string[]

/** Collects problems under a path. */
export class Checker {
  readonly problems: Problems = []

  fail(path: string, message: string) {
    this.problems.push(`${path}: ${message}`)
  }

  object(v: unknown, path: string): v is Record<string, unknown> {
    if (v && typeof v === 'object' && !Array.isArray(v)) return true
    this.fail(path, 'expected an object')
    return false
  }

  array(v: unknown, path: string): v is unknown[] {
    if (Array.isArray(v)) return true
    this.fail(path, 'expected a list')
    return false
  }

  string(v: unknown, path: string): v is string {
    if (typeof v === 'string' && v.length > 0) return true
    this.fail(path, 'expected text')
    return false
  }

  number(v: unknown, path: string, { min = -Infinity, positive = false } = {}): v is number {
    const ok = typeof v === 'number' && Number.isFinite(v) && v >= min && (!positive || v > 0)
    if (!ok)
      this.fail(
        path,
        positive ? 'expected a positive number' : `expected a number${min > -Infinity ? ` ≥ ${min}` : ''}`,
      )
    return ok
  }

  oneOf<T extends string | number>(v: unknown, options: readonly T[], path: string): v is T {
    if (options.includes(v as T)) return true
    this.fail(path, `expected one of ${options.map((o) => JSON.stringify(o)).join(', ')}, got ${JSON.stringify(v)}`)
    return false
  }

  tuple(v: unknown, length: number, path: string): v is number[] {
    if (Array.isArray(v) && v.length === length && v.every((x) => typeof x === 'number' && Number.isFinite(x)))
      return true
    this.fail(path, `expected ${length} numbers`)
    return false
  }

  /** A rectangle [x0, z0, x1, z1] with x0 < x1 and z0 < z1. */
  rect(v: unknown, path: string) {
    if (this.tuple(v, 4, path) && !(v[0] < v[2] && v[1] < v[3])) this.fail(path, 'expected x0 < x1 and z0 < z1')
  }

  /** The value is one of the keys of `known`. */
  ref(v: unknown, known: ReadonlySet<string>, what: string, path: string) {
    if (typeof v !== 'string' || !known.has(v)) this.fail(path, `no ${what} ${JSON.stringify(v)}`)
  }

  /** Ids in a list are unique. */
  unique(ids: unknown[], path: string) {
    const seen = new Set<unknown>()
    for (const id of ids) {
      if (seen.has(id)) this.fail(path, `duplicate id ${JSON.stringify(id)}`)
      seen.add(id)
    }
  }
}

const WALL_KINDS = ['exterior', 'interior'] as const
const OPENING_KINDS = ['door', 'window', 'passage'] as const
const FIXTURE_TYPES = [
  'box',
  'toilet',
  'basin',
  'showerTray',
  'counter',
  'kitchenSink',
  'cooktop',
  'fridge',
  'downlight',
  'railing',
] as const
const CAMERA_IDS = ['iso-balcony', 'iso-entry', 'top', 'from-balcony', 'from-entry'] as const
const EPS = 1e-6

const list = (c: Checker, v: unknown, path: string): Record<string, unknown>[] =>
  c.array(v, path) ? v.flatMap((x, i) => (c.object(x, `${path}[${i}]`) ? [x] : [])) : []

/** Problems with a plan, or none. Wall, ceiling and room references are checked against the plan itself. */
export function validatePlan(raw: unknown): Problems {
  const c = new Checker()
  if (!c.object(raw, 'plan')) return c.problems
  const p = raw
  c.oneOf(p.version, [1], 'version')
  if (c.string(p.id, 'id') && !/^[a-z0-9-]+$/.test(p.id)) c.fail('id', 'expected lowercase letters, digits and dashes')
  c.string(p.name, 'name')
  if (c.object(p.location, 'location')) {
    c.number(p.location.lat, 'location.lat', { min: -90 })
    c.number(p.location.lon, 'location.lon', { min: -180 })
    c.number(p.location.tz, 'location.tz', { min: -12 })
  }
  if (c.object(p.materials, 'materials')) {
    for (const [id, m] of Object.entries(p.materials))
      if (c.object(m, `materials.${id}`)) c.string(m.color, `materials.${id}.color`)
  }
  c.array(p.fixtures, 'fixtures')
  if (!c.object(p.shell, 'shell')) return c.problems
  const s = p.shell

  const walls = list(c, s.walls, 'shell.walls')
  c.unique(
    walls.map((w) => w.id),
    'shell.walls',
  )
  const wallIds = new Set(walls.map((w) => w.id).filter((id): id is string => typeof id === 'string'))
  walls.forEach((w, i) => {
    const at = `shell.walls[${i}]`
    c.string(w.id, `${at}.id`)
    const ends = c.tuple(w.a, 2, `${at}.a`) && c.tuple(w.b, 2, `${at}.b`)
    c.number(w.thickness, `${at}.thickness`, { positive: true })
    const height = c.number(w.height, `${at}.height`, { positive: true }) ? (w.height as number) : Infinity
    c.oneOf(w.kind, WALL_KINDS, `${at}.kind`)
    c.string(w.material, `${at}.material`)
    if (w.openings === undefined) return
    const length = ends
      ? Math.hypot((w.b as number[])[0] - (w.a as number[])[0], (w.b as number[])[1] - (w.a as number[])[1])
      : Infinity
    list(c, w.openings, `${at}.openings`).forEach((o, j) => {
      const op = `${at}.openings[${j}]`
      c.string(o.id, `${op}.id`)
      c.oneOf(o.kind, OPENING_KINDS, `${op}.kind`)
      const placed =
        c.number(o.offset, `${op}.offset`, { min: 0 }) && c.number(o.width, `${op}.width`, { positive: true })
      if (placed && (o.offset as number) + (o.width as number) > length + EPS)
        c.fail(
          op,
          `runs past the end of its wall (${((o.offset as number) + (o.width as number)).toFixed(2)} m of ${length.toFixed(2)} m)`,
        )
      if (
        c.number(o.height, `${op}.height`, { positive: true }) &&
        (o.height as number) + ((o.sill as number) ?? 0) > height + EPS
      )
        c.fail(op, 'is taller than its wall')
    })
  })

  const ceilings = list(c, s.ceilings, 'shell.ceilings')
  ceilings.forEach((x, i) => {
    c.rect(x.rect, `shell.ceilings[${i}].rect`)
    c.number(x.height, `shell.ceilings[${i}].height`, { positive: true })
  })
  list(c, s.rooms, 'shell.rooms').forEach((r, i) => {
    c.string(r.id, `shell.rooms[${i}].id`)
    c.rect(r.rect, `shell.rooms[${i}].rect`)
  })
  list(c, s.baseFloors, 'shell.baseFloors').forEach((f, i) => c.rect(f.rect, `shell.baseFloors[${i}].rect`))
  list(c, s.bulges, 'shell.bulges').forEach((b, i) => {
    c.ref(b.host, wallIds, 'wall', `shell.bulges[${i}].host`)
    c.tuple(b.min, 3, `shell.bulges[${i}].min`)
    c.tuple(b.max, 3, `shell.bulges[${i}].max`)
  })
  list(c, s.accentPanels, 'shell.accentPanels').forEach((a, i) =>
    c.ref(a.wall, wallIds, 'wall', `shell.accentPanels[${i}].wall`),
  )
  if (c.object(s.slab, 'shell.slab')) c.rect(s.slab.rect, 'shell.slab.rect')

  list(c, p.fixtures, 'fixtures').forEach((f, i) => {
    c.string(f.id, `fixtures[${i}].id`)
    c.oneOf(f.type, FIXTURE_TYPES, `fixtures[${i}].type`)
    c.tuple(f.position, 3, `fixtures[${i}].position`)
  })

  if (c.object(p.walls, 'walls')) {
    for (const key of ['labels', 'roles', 'removable', 'accent'] as const) {
      const map = p.walls[key]
      if (map === undefined || !c.object(map, `walls.${key}`)) continue
      for (const id of Object.keys(map)) c.ref(id, wallIds, 'wall', `walls.${key}`)
    }
  }
  if (p.droppedCeiling !== undefined && c.object(p.droppedCeiling, 'droppedCeiling')) {
    const ceilingIds = new Set(ceilings.map((x) => x.id as string))
    c.ref(p.droppedCeiling.id, ceilingIds, 'ceiling', 'droppedCeiling.id')
    if (p.droppedCeiling.bulkheadWall !== undefined)
      c.ref(p.droppedCeiling.bulkheadWall, wallIds, 'wall', 'droppedCeiling.bulkheadWall')
  }
  if (p.cameras !== undefined && c.object(p.cameras, 'cameras')) {
    for (const [id, cam] of Object.entries(p.cameras)) {
      c.oneOf(id, CAMERA_IDS, 'cameras')
      if (c.object(cam, `cameras.${id}`)) {
        c.tuple(cam.position, 3, `cameras.${id}.position`)
        c.tuple(cam.target, 3, `cameras.${id}.target`)
      }
    }
  }
  return c.problems
}

/** The plan, or an error listing what is wrong with it. */
export function checkedPlan(raw: unknown, source: string): Plan {
  const problems = validatePlan(raw)
  if (problems.length) throw new Error(`${source} is not a valid plan:\n  ${problems.join('\n  ')}`)
  return raw as Plan
}
