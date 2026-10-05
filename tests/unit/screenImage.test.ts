// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { checkImageUrl } from '../../server/imageProxy'
import { screenImageSrc } from '../../src/decor/api'

describe('TV picture links', () => {
  it('loads library paths directly and other links through the dev server', () => {
    expect(screenImageSrc('/artwork/image%2065.png')).toBe('/artwork/image%2065.png')
    expect(screenImageSrc(' https://example.com/a b.jpg ')).toBe('/api/image?url=https%3A%2F%2Fexample.com%2Fa%20b.jpg')
    expect(screenImageSrc('')).toBeNull()
    expect(screenImageSrc('ftp://example.com/a.jpg')).toBeNull()
    expect(screenImageSrc('javascript:alert(1)')).toBeNull()
  })

  it('the image proxy only fetches public http(s) addresses', () => {
    expect(checkImageUrl('https://images.example.com/photo.jpg').hostname).toBe('images.example.com')
    for (const bad of [
      'not a url',
      'file:///etc/passwd',
      'http://localhost:5173/x.png',
      'http://127.0.0.1/x',
      'http://10.0.0.2/x',
      'http://192.168.1.1/x',
      'http://169.254.169.254/latest',
      'http://[::1]/x',
      'http://printer.local/x',
    ])
      expect(() => checkImageUrl(bad), bad).toThrow()
  })
})
