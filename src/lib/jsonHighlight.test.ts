import { describe, expect, it } from 'vitest'
import { highlightJson } from './jsonHighlight'

describe('highlightJson', () => {
  it('highlights keys, strings, numbers and booleans', () => {
    const html = highlightJson({ name: 'qbotwire', count: 2, ok: true, none: null })
    expect(html).toContain('tok-key')
    expect(html).toContain('tok-string')
    expect(html).toContain('tok-number')
    expect(html).toContain('tok-bool')
    expect(html).toContain('tok-null')
  })

  it('escapes markup from payloads', () => {
    const html = highlightJson({ content: '<img src=x onerror=alert(1)>' })
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  it('handles non-serialisable values without throwing', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(typeof highlightJson(circular)).toBe('string')
    expect(highlightJson(undefined)).toBe('')
  })
})
