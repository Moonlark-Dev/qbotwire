import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type {
  ApiRequest,
  ApiResponse,
  Backend,
  Bootstrap,
  CacheSnapshot,
  ConnectionStatus,
  Credentials,
  GatewayEvent,
  GroupEntry,
  SavedEndpoint,
  Settings,
  StoredConfig,
} from '@/types'
import { createMockBackend } from './mockBackend'

export const isTauri =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

function subscribe<T>(event: string, handler: (payload: T) => void): () => void {
  let disposed = false
  let unlisten: UnlistenFn | undefined
  void listen<T>(event, (payload) => handler(payload.payload)).then((fn) => {
    if (disposed) fn()
    else unlisten = fn
  })
  return () => {
    disposed = true
    unlisten?.()
  }
}

const tauriBackend: Backend = {
  mode: 'tauri',
  bootstrap: () => invoke<Bootstrap>('bootstrap'),
  login: (credentials: Credentials) =>
    invoke<ConnectionStatus>('login', { credentials }),
  logout: (options) => invoke<void>('logout', { options: options ?? {} }),
  saveCredentials: (credentials: Credentials) =>
    invoke<StoredConfig>('save_credentials', { credentials }),
  updateSettings: (settings: Settings) =>
    invoke<StoredConfig>('update_settings', { settings }),
  getStatus: () => invoke<ConnectionStatus>('get_status'),
  sendRequest: (request: ApiRequest) =>
    invoke<ApiResponse>('send_request', { request }),
  saveEndpoint: (endpoint: SavedEndpoint) =>
    invoke<SavedEndpoint[]>('save_endpoint', { endpoint }),
  deleteEndpoint: (id: string) =>
    invoke<SavedEndpoint[]>('delete_endpoint', { id }),
  getCache: () => invoke<CacheSnapshot>('get_cache'),
  clearEvents: () => invoke<void>('clear_events'),
  clearCache: (kind) => invoke<CacheSnapshot>('clear_cache', { kind: kind ?? null }),
  renameCacheEntry: (kind, openid, name) =>
    invoke<CacheSnapshot>('rename_cache_entry', { kind, openid, name }),
  refreshGroup: (groupOpenid: string) =>
    invoke<GroupEntry | null>('refresh_group', { groupOpenid }),
  onEvent: (handler) => subscribe<GatewayEvent>('qbotwire:event', handler),
  onStatus: (handler) => subscribe<ConnectionStatus>('qbotwire:status', handler),
  onCache: (handler) => subscribe<CacheSnapshot>('qbotwire:cache', handler),
}

export const backend: Backend = isTauri ? tauriBackend : createMockBackend()
