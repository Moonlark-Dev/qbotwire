import { describe, expect, it } from 'vitest'
import { formatBytes, formatDuration, formatRelative, intentsLabel } from './format'

describe('format helpers', () => {
  it('formats durations', () => {
    expect(formatDuration(42)).toBe('42 ms')
    expect(formatDuration(1500)).toBe('1.50 s')
    expect(formatDuration(null)).toBe('—')
  })

  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
  })

  it('formats relative timestamps', () => {
    expect(formatRelative(new Date().toISOString())).toBe('刚刚')
    expect(formatRelative(null)).toBe('—')
  })

  it('describes intents', () => {
    expect(intentsLabel(1 << 25)).toBe('群与单聊')
    expect(intentsLabel((1 << 25) | (1 << 9))).toBe('频道消息 · 群与单聊')
    expect(intentsLabel(0)).toBe('无')
  })
})
