import { computed, reactive } from 'vue'
import { backend } from '@/lib/backend'
import { mediaApiError, mergePlatformMedia } from '@/lib/media'
import type {
  ApiResponse,
  Bootstrap,
  CacheSnapshot,
  ConnectionStatus,
  Credentials,
  GatewayEvent,
  MediaAsset,
  MediaUploadInput,
  PageKey,
  SavedEndpoint,
  Settings,
  StoredConfig,
} from '@/types'

export interface Toast {
  id: number
  kind: 'success' | 'error' | 'info'
  message: string
}

export interface AppState {
  ready: boolean
  fatal: string | null
  mode: 'tauri' | 'mock'
  version: string
  credentials: Credentials | null
  settings: Settings
  savedEndpoints: SavedEndpoint[]
  cache: CacheSnapshot
  mediaAssets: MediaAsset[]
  status: ConnectionStatus
  events: GatewayEvent[]
  page: PageKey
  settingsOpen: boolean
  toasts: Toast[]
}

const DEFAULT_SETTINGS: Settings = { autoSaveOnSuccess: false, eventLimit: 500 }

export const app = reactive<AppState>({
  ready: false,
  fatal: null,
  mode: backend.mode,
  version: '1.2.0',
  credentials: null,
  settings: { ...DEFAULT_SETTINGS },
  savedEndpoints: [],
  cache: { groups: [], users: [] },
  mediaAssets: [],
  status: { state: 'disconnected' },
  events: [],
  page: 'send',
  settingsOpen: false,
  toasts: [],
})

let toastSeq = 0

export function toast(kind: Toast['kind'], message: string, ttl = 3200) {
  const id = (toastSeq += 1)
  app.toasts.push({ id, kind, message })
  window.setTimeout(() => {
    const index = app.toasts.findIndex((item) => item.id === id)
    if (index >= 0) app.toasts.splice(index, 1)
  }, ttl)
}

function applyConfig(config: StoredConfig) {
  app.credentials = config.credentials ?? null
  app.settings = { ...DEFAULT_SETTINGS, ...config.settings }
  app.savedEndpoints = config.savedEndpoints ?? []
}

function capEvents() {
  const limit = Math.max(50, app.settings.eventLimit || 500)
  if (app.events.length > limit) app.events.splice(limit)
}

export const isConnected = computed(() => app.status.state === 'connected')

export const botLabel = computed(
  () => app.status.bot?.username ?? app.credentials?.appId ?? '未连接',
)

export function findGroup(openid: string | null | undefined) {
  if (!openid) return undefined
  return app.cache.groups.find((group) => group.openid === openid)
}

export function findUser(openid: string | null | undefined) {
  if (!openid) return undefined
  return app.cache.users.find((user) => user.openid === openid)
}

export const eventTypes = computed(() => {
  const counts = new Map<string, number>()
  for (const event of app.events) {
    counts.set(event.type, (counts.get(event.type) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
})

export async function bootstrap() {
  try {
    const data: Bootstrap = await backend.bootstrap()
    app.mode = backend.mode
    app.version = data.version
    applyConfig(data.config)
    app.status = data.status
    app.cache = data.cache
    app.mediaAssets = data.mediaAssets ?? []
    app.events = data.events.slice(0, app.settings.eventLimit)
    backend.onEvent((event) => {
      app.events.unshift(event)
      capEvents()
    })
    backend.onStatus((status) => {
      app.status = status
    })
    backend.onCache((snapshot) => {
      app.cache = snapshot
    })
    app.ready = true
  } catch (error) {
    app.fatal = error instanceof Error ? error.message : String(error)
    app.ready = true
  }
}

export async function login(credentials: Credentials): Promise<ConnectionStatus> {
  const status = await backend.login(credentials)
  app.credentials = { ...credentials }
  app.status = status
  return status
}

export async function saveCredentials(credentials: Credentials) {
  const config = await backend.saveCredentials(credentials)
  applyConfig(config)
  toast('success', '凭据已保存到本机')
}

export async function updateSettings(settings: Settings) {
  const config = await backend.updateSettings(settings)
  applyConfig(config)
  capEvents()
}

export async function logout(clearCredentials = false) {
  await backend.logout({ clearCredentials })
  app.status = { state: 'disconnected' }
  app.events = []
  if (clearCredentials) {
    app.credentials = null
    app.cache = { groups: [], users: [] }
  }
}

export async function sendRequest(request: Parameters<typeof backend.sendRequest>[0]) {
  return backend.sendRequest(request)
}

export async function persistEndpoint(endpoint: SavedEndpoint): Promise<SavedEndpoint[]> {
  const saved = await backend.saveEndpoint(endpoint)
  app.savedEndpoints = saved
  return saved
}

export async function removeEndpoint(id: string) {
  app.savedEndpoints = await backend.deleteEndpoint(id)
}

export async function clearEvents() {
  await backend.clearEvents()
  app.events = []
}

export async function refreshCache() {
  app.cache = await backend.getCache()
}

export async function refreshMediaAssets() {
  app.mediaAssets = await backend.listMediaAssets()
}

/** Persist local metadata (thumbnail / dimensions) for uploaded or synced assets. */
export async function saveMediaAssets(assets: MediaAsset[]): Promise<MediaAsset[]> {
  app.mediaAssets = await backend.saveMediaAssets(assets)
  return app.mediaAssets
}

/** Remove one link from the local cache only; the platform copy stays. */
export async function dropMediaAsset(imageId: string): Promise<MediaAsset[]> {
  app.mediaAssets = await backend.removeMediaAsset(imageId)
  return app.mediaAssets
}

export async function clearMediaAssets(): Promise<MediaAsset[]> {
  app.mediaAssets = await backend.clearMediaAssets()
  return app.mediaAssets
}

/** Upload one image through the backend and remember its stable link. */
export async function uploadMediaImage(input: MediaUploadInput): Promise<MediaAsset> {
  const asset = await backend.uploadMediaImage(input)
  await saveMediaAssets([asset])
  return asset
}

/**
 * Pull every valid platform image (20 per page) into the local link cache. The
 * platform list is the source of truth for `expires_at`; local thumbnails and
 * content types are preserved by `mergePlatformMedia`.
 */
export async function syncMediaAssets(): Promise<number> {
  const credentials = app.credentials
  if (!credentials) throw new Error('还没有配置 Bot 凭据，请先登录')
  const rows: unknown[] = []
  let cursor = ''
  for (let page = 0; page < 10; page += 1) {
    const response = await sendRequest({
      method: 'GET',
      path: '/v2/media-images',
      query: cursor ? [{ key: 'cursor', value: cursor, enabled: true }] : [],
      body: '',
    })
    if (!response.ok) throw new Error(mediaApiError(response))
    const body = response.body
    if (!body || typeof body !== 'object' || Array.isArray(body)) break
    const record = body as Record<string, unknown>
    if (Array.isArray(record.images)) rows.push(...record.images)
    const next = typeof record.next_cursor === 'string' ? record.next_cursor : ''
    if (!next) break
    cursor = next
  }
  const merged = mergePlatformMedia(app.mediaAssets, rows, credentials.appId)
  app.mediaAssets = await backend.saveMediaAssets(merged)
  return rows.length
}

/**
 * Delete one image from the platform, then release its local cache entry.
 * `40035008` means it is already gone, so the local entry is still removed.
 */
export async function deleteMediaAsset(imageId: string): Promise<void> {
  const response = await sendRequest({
    method: 'DELETE',
    path: `/v2/media-images/${encodeURIComponent(imageId)}/delete`,
    query: [],
    body: '',
  })
  if (!response.ok) {
    const body = response.body
    const code =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>).code
        : undefined
    if (code !== 40035008) throw new Error(mediaApiError(response))
  }
  app.mediaAssets = await backend.removeMediaAsset(imageId)
}

export async function clearCache(kind?: 'groups' | 'users') {
  app.cache = await backend.clearCache(kind)
  toast('success', kind ? '已清空对应缓存' : '已清空全部缓存')
}

export async function renameCacheEntry(kind: 'group' | 'user', openid: string, name: string) {
  app.cache = await backend.renameCacheEntry(kind, openid, name)
}

export async function refreshGroup(openid: string) {
  const updated = await backend.refreshGroup(openid)
  if (updated) await refreshCache()
  return updated
}

export async function refreshUser(openid: string) {
  const updated = await backend.refreshUser(openid)
  if (updated) await refreshCache()
  return updated
}

export function findSaved(method: string, path: string, body: string): SavedEndpoint | undefined {
  return app.savedEndpoints.find(
    (saved) =>
      saved.method.toUpperCase() === method.toUpperCase() &&
      saved.path.trim() === path.trim() &&
      saved.body.trim() === body.trim(),
  )
}

export function setPage(page: PageKey) {
  app.page = page
}

export function responsePreview(response: ApiResponse | null | undefined): string {
  if (!response) return ''
  return response.raw
}
