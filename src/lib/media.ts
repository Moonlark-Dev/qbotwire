/**
 * Material image helpers.
 *
 * QQ Bot material management (`/v2/media-images/*`) uploads an image once and
 * returns a `qqbot-media://image/v1/<token>` reference that can be embedded in
 * Markdown. These helpers build that Markdown, insert it at a caret and prepare
 * local uploads (base64 / thumbnail / concurrency) for the media page.
 *
 * Reference: https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/material-management.html
 */
import type { ApiResponse, MediaAsset } from '@/types'

export const MEDIA_IMAGE_MAX_BYTES = 10 * 1024 * 1024

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

export interface MarkdownImageOptions {
  width?: number | string | null
  height?: number | string | null
}

export interface TextSelection {
  start: number
  end: number
}

function sizeHint(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.round(parsed)
}

/**
 * Build the Markdown image snippet. QQ accepts an optional `#宽px #高px` hint
 * inside the alt text, e.g. `![K线 #800px #400px](qqbot-media://image/v1/…)`.
 */
export function markdownImageSnippet(
  asset: Pick<MediaAsset, 'url' | 'fileName'>,
  options: MarkdownImageOptions = {},
): string {
  const alt =
    (asset.fileName || 'image')
      .replace(/[[\]()#\r\n]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'image'
  const hints: string[] = []
  const width = sizeHint(options.width)
  const height = sizeHint(options.height)
  if (width) hints.push(`#${width}px`)
  if (height) hints.push(`#${height}px`)
  const suffix = hints.length ? ` ${hints.join(' ')}` : ''
  return `![${alt}${suffix}](${asset.url})`
}

/** Insert `snippet` at the caret (or append when no selection is known). */
export function insertAtSelection(
  text: string,
  snippet: string,
  selection?: TextSelection | null,
): { text: string; caret: number } {
  const observed = selection ?? { start: text.length, end: text.length }
  const start = Math.max(0, Math.min(observed.start, text.length))
  const end = Math.max(start, Math.min(observed.end, text.length))
  return {
    text: `${text.slice(0, start)}${snippet}${text.slice(end)}`,
    caret: start + snippet.length,
  }
}

/**
 * `qqbot-media` links are bound to the AppID that uploaded them, so assets from
 * another bot are hidden. Assets imported before AppID tracking keep working.
 */
export function assetsForApp(
  assets: readonly MediaAsset[],
  appId: string | null | undefined,
): MediaAsset[] {
  if (!appId) return [...assets]
  return assets.filter((asset) => !asset.appId || asset.appId === appId)
}

export function isAssetExpired(asset: Pick<MediaAsset, 'expiresAt'>, now = Date.now()): boolean {
  return asset.expiresAt * 1000 <= now
}

/** Human-readable remaining lifetime; both axis values are Unix seconds. */
export function expiresInLabel(expiresAt: number, now = Date.now()): string {
  if (!Number.isFinite(expiresAt)) return '—'
  const seconds = Math.floor(expiresAt - now / 1000)
  if (seconds <= 0) return '已过期'
  const days = Math.floor(seconds / 86_400)
  if (days >= 1) return `${days} 天后过期`
  const hours = Math.floor(seconds / 3_600)
  if (hours >= 1) return `${hours} 小时后过期`
  return `${Math.max(1, Math.floor(seconds / 60))} 分钟后过期`
}

export function mediaTimeIso(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return new Date(seconds * 1000).toISOString()
}

/** Resolve the content type accepted by the material API, or null. */
export function imageTypeForFile(file: { name: string; type?: string }): string | null {
  const declared = (file.type ?? '').trim().toLowerCase()
  if (declared) {
    if (declared === 'image/jpg') return 'image/jpeg'
    if (Object.values(CONTENT_TYPES).includes(declared)) return declared
    return null
  }
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return CONTENT_TYPES[extension] ?? null
}

/** Base64 payload (without the `data:` prefix) for the Tauri/sandbox upload. */
export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

export interface LocalImageMeta {
  width: number
  height: number
  thumbnail: string | null
}

/**
 * Read the image dimensions and render a small JPEG thumbnail for the local
 * cache. Failure is non-fatal: the card falls back to a placeholder icon.
 */
export async function readImageMeta(file: Blob): Promise<LocalImageMeta | null> {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return null
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('无法读取图片'))
      element.src = objectUrl
    })
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    if (!width || !height) return null
    const scale = Math.min(1, 320 / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext('2d')
    if (!context) return { width, height, thumbnail: null }
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    let thumbnail = ''
    try {
      thumbnail = canvas.toDataURL('image/jpeg', 0.78)
    } catch {
      thumbnail = ''
    }
    return { width, height, thumbnail: thumbnail || null }
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/**
 * Run tasks with a bounded number of concurrent workers. A rejected task is the
 * worker's responsibility: this helper lets the other jobs finish.
 */
export async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const queue = items.map((item, index) => ({ item, index }))
  const workers = Math.max(1, Math.min(Math.floor(limit) || 1, queue.length))
  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (;;) {
        const next = queue.shift()
        if (!next) return
        await worker(next.item, next.index)
      }
    }),
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

/**
 * Convert one row of `GET /v2/media-images` into a cached asset, keeping local
 * metadata (thumbnail / dimensions / content type) from a previous upload.
 */
export function mediaAssetFromPlatform(
  row: unknown,
  existing: MediaAsset | null = null,
  appId: string | null = null,
): MediaAsset | null {
  if (!isRecord(row)) return null
  const imageId = asString(row.image_id).trim()
  const url = asString(row.url).trim()
  if (!imageId || !url) return null
  const createdAt = asNumber(row.created_at)
  const expiresAt = asNumber(row.expires_at)
  return {
    imageId,
    url,
    fileName: asString(row.file_name).trim() || existing?.fileName || imageId,
    contentType: existing?.contentType ?? '',
    size: existing?.size ?? 0,
    width: existing?.width ?? null,
    height: existing?.height ?? null,
    thumbnail: existing?.thumbnail ?? null,
    appId: appId ?? existing?.appId ?? null,
    createdAt: createdAt ?? existing?.createdAt ?? 0,
    expiresAt: expiresAt ?? existing?.expiresAt ?? 0,
    source: existing?.source === 'upload' ? 'upload' : 'sync',
  }
}

/**
 * Merge a platform page into the local cache without dropping cached links that
 * are no longer returned (expired / deleted elsewhere). Returns newest first.
 */
export function mergePlatformMedia(
  existing: readonly MediaAsset[],
  rows: readonly unknown[],
  appId: string | null = null,
): MediaAsset[] {
  const byId = new Map(existing.map((asset) => [asset.imageId, asset]))
  for (const row of rows) {
    if (!isRecord(row)) continue
    const imageId = asString(row.image_id).trim()
    if (!imageId) continue
    const merged = mediaAssetFromPlatform(row, byId.get(imageId) ?? null, appId)
    if (merged) byId.set(merged.imageId, merged)
  }
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt)
}

/** Compact error text for a non-OK `ApiResponse`. */
export function mediaApiError(response: ApiResponse): string {
  const body = response.body
  if (isRecord(body)) {
    const code = asNumber(body.code)
    const message = asString(body.message) || asString(body.msg)
    if (message) {
      return `HTTP ${response.status}${code !== null ? ` · code ${code}` : ''} · ${message}`
    }
  }
  const snippet = response.raw.trim().slice(0, 200)
  return snippet ? `HTTP ${response.status} · ${snippet}` : `HTTP ${response.status}`
}
