import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkedPlan, validatePlan } from '../../src/model/validate'

// Every plan in every example workspace.
const plans = readdirSync('examples').flatMap((ws) =>
  readdirSync(`examples/${ws}/plans`)
    .filter((f) => f.endsWith('.plan.json'))
    .map((f) => `examples/${ws}/plans/${f}`),
)
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'))

describe('validatePlan', () => {
  it.each(plans)('accepts the bundled plan %s', (file) => {
    expect(validatePlan(read(file))).toEqual([])
  })

  it('reports what is wrong, by path', () => {
    const plan = read('examples/loft/plans/loft.plan.json')
    plan.shell.walls[0].thickness = 0
    plan.shell.walls[0].openings = [{ id: 'w', kind: 'window', offset: 100, width: 1, height: 1 }]
    plan.shell.bulges = [{ id: 'b', host: 'nowhere', min: [0, 0, 0], max: [1, 1, 1], material: 'x' }]
    plan.fixtures = [{ id: 'f', type: 'sofa', position: [0, 0, 0] }]
    plan.walls.removable = { ghost: { label: '', note: '', floors: [] } }
    const problems = validatePlan(plan)
    expect(problems).toEqual(
      expect.arrayContaining([
        'shell.walls[0].thickness: expected a positive number',
        expect.stringMatching(/^shell\.walls\[0\]\.openings\[0\]: runs past the end of its wall/),
        'shell.bulges[0].host: no wall "nowhere"',
        expect.stringMatching(/^fixtures\[0\]\.type: expected one of/),
        'walls.removable: no wall "ghost"',
      ]),
    )
  })

  it('rejects something that is not a plan at all', () => {
    expect(validatePlan(null)).toEqual(['plan: expected an object'])
    expect(validatePlan({ version: 2 })[0]).toMatch(/^version/)
  })

  it('checkedPlan names the file in its error', () => {
    expect(() => checkedPlan({}, 'plans/x.plan.json')).toThrow(/^plans\/x\.plan\.json is not a valid plan:/)
  })
})
