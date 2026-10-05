// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { embedUrl, parseYouTube } from '../../src/decor/youtube'

describe('YouTube links', () => {
  it('reads every common link form', () => {
    for (const link of [
      'https://www.youtube.com/watch?v=jNQXAC9IVRw',
      'youtube.com/watch?v=jNQXAC9IVRw&list=abc',
      'https://youtu.be/jNQXAC9IVRw',
      'https://m.youtube.com/watch?v=jNQXAC9IVRw',
      'https://www.youtube.com/embed/jNQXAC9IVRw',
      'https://www.youtube.com/shorts/jNQXAC9IVRw',
      'https://www.youtube-nocookie.com/embed/jNQXAC9IVRw',
      'jNQXAC9IVRw',
    ])
      expect(parseYouTube(link)?.id, link).toBe('jNQXAC9IVRw')
  })

  it('keeps the start time', () => {
    expect(parseYouTube('https://youtu.be/jNQXAC9IVRw?t=90')?.start).toBe(90)
    expect(parseYouTube('https://www.youtube.com/watch?v=jNQXAC9IVRw&t=1m5s')?.start).toBe(65)
  })

  it('rejects anything else', () => {
    for (const bad of [
      '',
      'hello',
      'https://vimeo.com/123',
      'https://www.youtube.com/watch?v=short',
      'https://example.com/watch?v=jNQXAC9IVRw',
    ])
      expect(parseYouTube(bad), bad).toBeNull()
  })

  it('embeds privacy-enhanced, from the start time', () => {
    expect(embedUrl({ id: 'jNQXAC9IVRw', start: 65 })).toBe(
      'https://www.youtube-nocookie.com/embed/jNQXAC9IVRw?rel=0&modestbranding=1&playsinline=1&start=65',
    )
  })
})
