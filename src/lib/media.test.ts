import { describe, expect, it } from 'vitest'
import {
  assetsForApp,
  expiresInLabel,
  imageTypeForFile,
  insertAtSelection,
  isAssetExpired,
  markdownImageSnippet,
  mediaApiError,
  mediaAssetFromPlatform,
  mediaTimeIso,
  mergePlatformMedia,
  runWithConcurrency,
} from './media'
import type { ApiResponse, MediaAsset } from '@/types'

function asset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    imageId: 'img-1',
    url: 'qqbot-media://image/v1/token-1',
    fileName: 'kline.png',
    contentType: 'image/png',
    size: 40156,
    width: 800,
    height: 400,
    thumbnail: 'data:image/jpeg;base64,abc',
    appId: '102030405',
    createdAt: 1_790_000_000,
    expiresAt: 1_797_776_000,
    source: 'upload',
    ...overrides,
  }
}

function response(overrides: Partial<ApiResponse> = {}): ApiResponse {
  return {
    ok: false,
    status: 400,
    headers: {},
    body: { code: 40035003, message: '上传任务不存在' },
    raw: '{"code":40035003,"message":"上传任务不存在"}',
    elapsedMs: 3,
    url: 'http://localhost/v2/media-images/complete',
    method: 'POST',
    authApplied: true,
    ...overrides,
  }
}

describe('material markdown helpers', () => {
  it('builds an image reference with optional size hints', () => {
    expect(markdownImageSnippet(asset())).toBe(
      '![kline.png](qqbot-media://image/v1/token-1)',
    )
    expect(markdownImageSnippet(asset(), { width: 800, height: 400 })).toBe(
      '![kline.png #800px #400px](qqbot-media://image/v1/token-1)',
    )
    expect(markdownImageSnippet(asset(), { width: '320', height: 0 })).toBe(
      '![kline.png #320px](qqbot-media://image/v1/token-1)',
    )
    expect(markdownImageSnippet(asset(), { width: -3, height: 'nope' })).toBe(
      '![kline.png](qqbot-media://image/v1/token-1)',
    )
  })

  it('sanitises alt text and falls back when the name is empty', () => {
    expect(
      markdownImageSnippet({ url: 'qqbot-media://image/v1/x', fileName: 'a#b[c](d)\n.png' }),
    ).toBe('![a b c d .png](qqbot-media://image/v1/x)')
    expect(markdownImageSnippet({ url: 'qqbot-media://image/v1/x', fileName: '' })).toBe(
      '![image](qqbot-media://image/v1/x)',
    )
  })

  it('inserts at the caret and clamps out-of-range selections', () => {
    expect(insertAtSelection('hello world', 'X', { start: 6, end: 11 })).toEqual({
      text: 'hello X',
      caret: 7,
    })
    expect(insertAtSelection('hello', 'X', { start: 99, end: 120 })).toEqual({
      text: 'helloX',
      caret: 6,
    })
    expect(insertAtSelection('hello', 'X')).toEqual({ text: 'helloX', caret: 6 })
    expect(insertAtSelection('hello', 'X', { start: 2, end: 1 })).toEqual({
      text: 'heXllo',
      caret: 3,
    })
  })
})

describe('material local cache helpers', () => {
  it('keeps assets owned by the current bot (and legacy untagged ones)', () => {
    const mine = asset()
    const legacy = asset({ imageId: 'legacy', appId: null })
    const other = asset({ imageId: 'other', appId: '999' })
    expect(assetsForApp([mine, legacy, other], '102030405').map((item) => item.imageId)).toEqual([
      'img-1',
      'legacy',
    ])
    expect(assetsForApp([mine, other], null)).toHaveLength(2)
  })

  it('describes expiry and converts unix seconds', () => {
    const now = Date.UTC(2026, 10, 20)
    expect(expiresInLabel(now / 1000 - 10, now)).toBe('已过期')
    expect(expiresInLabel(now / 1000 + 86_400 * 3 + 60, now)).toBe('3 天后过期')
    expect(expiresInLabel(now / 1000 + 3_600 * 5 + 60, now)).toBe('5 小时后过期')
    expect(expiresInLabel(now / 1000 + 120, now)).toBe('2 分钟后过期')
    expect(isAssetExpired({ expiresAt: now / 1000 - 1 }, now)).toBe(true)
    expect(isAssetExpired({ expiresAt: now / 1000 + 1 }, now)).toBe(false)
    expect(mediaTimeIso(1_790_000_000)).toBe(new Date(1_790_000_000_000).toISOString())
    expect(mediaTimeIso(0)).toBeNull()
  })

  it('maps upload file names and MIME types to the supported image types', () => {
    expect(imageTypeForFile({ name: 'a.png' })).toBe('image/png')
    expect(imageTypeForFile({ name: 'a.JPEG' })).toBe('image/jpeg')
    expect(imageTypeForFile({ name: 'a.jpg' })).toBe('image/jpeg')
    expect(imageTypeForFile({ name: 'a.webp' })).toBe('image/webp')
    expect(imageTypeForFile({ name: 'a.png', type: 'image/jpg' })).toBe('image/jpeg')
    expect(imageTypeForFile({ name: 'a.png', type: 'text/plain' })).toBeNull()
    expect(imageTypeForFile({ name: 'a.bmp' })).toBeNull()
  })

  it('merges a platform page while preserving local metadata and stale links', () => {
    const uploaded = asset()
    const stale = asset({ imageId: 'stale', createdAt: 1_780_000_000, source: 'sync' })
    const rows = [
      {
        image_id: 'img-1',
        url: 'qqbot-media://image/v1/token-1',
        file_name: 'kline.png',
        created_at: 1_790_000_100,
        expires_at: 1_798_000_000,
      },
      {
        image_id: 'img-2',
        url: 'qqbot-media://image/v1/token-2',
        file_name: 'cover.webp',
        created_at: 1_790_000_200,
        expires_at: 1_798_000_000,
      },
    ]
    const merged = mergePlatformMedia([uploaded, stale], rows, '102030405')
    expect(merged.map((item) => item.imageId)).toEqual(['img-2', 'img-1', 'stale'])
    const first = merged.find((item) => item.imageId === 'img-1')!
    expect(first.thumbnail).toBe(uploaded.thumbnail)
    expect(first.size).toBe(uploaded.size)
    expect(first.width).toBe(800)
    expect(first.contentType).toBe('image/png')
    expect(first.expiresAt).toBe(1_798_000_000)
    expect(first.source).toBe('upload')
    expect(merged.find((item) => item.imageId === 'img-2')?.source).toBe('sync')
    expect(merged.find((item) => item.imageId === 'img-2')?.appId).toBe('102030405')
  })

  it('ignores malformed platform rows', () => {
    expect(mediaAssetFromPlatform(null)).toBeNull()
    expect(mediaAssetFromPlatform({ image_id: 'x' })).toBeNull()
    expect(mediaAssetFromPlatform({ url: 'qqbot-media://image/v1/x' })).toBeNull()
    expect(
      mediaAssetFromPlatform({ image_id: 42, url: 'qqbot-media://image/v1/x' }),
    ).toBeNull()
  })

  it('formats API errors with the platform code when available', () => {
    expect(mediaApiError(response())).toBe('HTTP 400 · code 40035003 · 上传任务不存在')
    expect(mediaApiError(response({ body: null, raw: '<html>bad</html>' }))).toBe(
      'HTTP 400 · <html>bad</html>',
    )
    expect(mediaApiError(response({ body: null, raw: '' }))).toBe('HTTP 400')
  })
})

describe('runWithConcurrency', () => {
  it('runs work with a bounded number of workers and preserves results', async () => {
    const items = [1, 2, 3, 4, 5, 6, 7]
    const started: number[] = []
    let active = 0
    let peak = 0
    await runWithConcurrency(items, 3, async (item) => {
      active += 1
      peak = Math.max(peak, active)
      started.push(item)
      await new Promise((resolve) => setTimeout(resolve, 4))
      active -= 1
    })
    expect(peak).toBeLessThanOrEqual(3)
    expect(started.sort((a, b) => a - b)).toEqual(items)
  })

  it('does not start another worker when a task rejects', async () => {
    const seen: number[] = []
    await runWithConcurrency([1, 2, 3], 2, async (item) => {
      seen.push(item)
      throw new Error(`fail ${item}`)
    }).catch(() => undefined)
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2])
  })
})
