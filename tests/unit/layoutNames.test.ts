import { describe, expect, it } from 'vitest'
import {
  isHiddenSlug,
  isMainSlug,
  layoutFileName,
  LAYOUT_SLUG,
  planMainSlug,
  slugOfFileName,
} from '../../src/model/layoutNames'

describe('layout names', () => {
  it('maps slugs to file names and back', () => {
    for (const slug of [null, 'sofa-by-the-window', planMainSlug('loft')]) {
      expect(slugOfFileName(layoutFileName(slug))).toBe(slug)
    }
    expect(layoutFileName(null)).toBe('decor.json')
  })

  it('does not take other files for layouts', () => {
    for (const name of ['decor.json.bak', 'decor..json', 'decor.Sofa.json', 'plan.json', 'decor.a_b.json']) {
      expect(slugOfFileName(name)).toBeUndefined()
    }
  })

  it('knows main and scratch layouts', () => {
    expect(isMainSlug(null)).toBe(true)
    expect(isMainSlug(planMainSlug('loft'))).toBe(true)
    expect(isMainSlug('wall-bed')).toBe(false)
    expect(isHiddenSlug('e2e-smoke')).toBe(true)
    expect(isHiddenSlug('test-align')).toBe(true)
    expect(isHiddenSlug('wall-bed')).toBe(false)
  })

  it('accepts only lowercase slugs of up to 40 characters', () => {
    expect(LAYOUT_SLUG.test('a-1')).toBe(true)
    expect(LAYOUT_SLUG.test('A')).toBe(false)
    expect(LAYOUT_SLUG.test('../x')).toBe(false)
    expect(LAYOUT_SLUG.test('a'.repeat(41))).toBe(false)
  })
})
