import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateLayout } from '../../src/decor/validateLayout'

// Every layout in every example workspace, including scratch files from test runs that happen to be on disk.
const layouts = readdirSync('examples').flatMap((ws) =>
  readdirSync(`examples/${ws}/layouts`)
    .filter((f) => /^decor(\.[a-z0-9-]+)?\.json$/.test(f))
    .map((f) => `examples/${ws}/layouts/${f}`),
)
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'))

describe('validateLayout', () => {
  it.each(layouts)('accepts %s', (file) => {
    expect(validateLayout(read(file))).toEqual([])
  })

  it('accepts an empty layout', () => {
    expect(validateLayout({ version: 1, items: [] })).toEqual([])
    expect(validateLayout({})).toEqual([])
  })

  it('reports unknown catalog entries and malformed items, by path', () => {
    const problems = validateLayout({
      version: 1,
      items: [
        { kind: 'plant', id: 'p', species: 'triffid', pot: 'clay', at: [1, 0, 1], rotation: 0, scale: 1 },
        { kind: 'furniture', id: 'f', type: 'sofa', at: [1, 0], size: [1, 1, 1], finish: {}, options: {} },
        { kind: 'spaceship', id: 'p', at: [0, 0, 0] },
      ],
    })
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^items\[0\]\.species: expected one of .*, got "triffid"$/),
        'items[1].at: expected 3 numbers',
        expect.stringMatching(/^items\[2\]\.kind: expected one of/),
        'items: duplicate id "p"',
      ]),
    )
  })

  it('rejects a file whose items are not a list', () => {
    expect(validateLayout({ version: 1, items: {} })).toEqual(['items: expected a list'])
  })
})
