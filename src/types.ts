/**
 * Shared types between the Vue front end and the Rust backend.
 *
 * Every field is camelCase on both sides (serde uses rename_all = "camelCase").
 */

export type Environment = 'production' | 'sandbox' | 'custom'

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'

export type PageKey = 'send' | 'receive' | 'cache' | 'media'

export interface Credentials {
  appId: string
  clientSecret: string
  environment: Environment
  /** Only used when environment === 'custom'. */
  baseUrl?: string | null
  /** Optional override for the access-token endpoint. */
  tokenUrl?: string | null
  intents: number
}

export interface BotInfo {
  id: string
  username: string
  avatar?: string | null
}

export interface ConnectionStatus {
  state: ConnectionState
  bot?: BotInfo | null
  sessionId?: string | null
  lastSeq?: number | null
  error?: string | null
  gatewayUrl?: string | null
  intents?: number | null
  heartbeatIntervalMs?: number | null
  latencyMs?: number | null
  connectedAt?: string | null
}

export interface GatewayEvent {
  id: string
  seq?: number | null
  type: string
  receivedAt: string
  data: unknown
}

export interface GroupEntry {
  openid: string
  name?: string | null
  avatar?: string | null
  memberCount?: number | null
  /** Cross-app group OpenID (2026-11-16 API change), set when a third-party app is bound. */
  unionGroupOpenid?: string | null
  source?: string | null
  firstSeen: string
  lastSeen: string
  messageCount: number
  infoFetchedAt?: string | null
}

export interface UserEntry {
  openid: string
  name?: string | null
  avatar?: string | null
  unionOpenid?: string | null
  /** `GET /v2/users/{openid}/info`: whether the user accepts proactive messages. */
  allowProactiveMsg?: boolean | null
  source?: string | null
  firstSeen: string
  lastSeen: string
  messageCount: number
  /** Last time the profile was fetched from `GET /v2/users/{openid}/info`. */
  infoFetchedAt?: string | null
}

export interface CacheSnapshot {
  groups: GroupEntry[]
  users: UserEntry[]
}

/**
 * A material image cached locally.
 *
 * `url` is the stable `qqbot-media://image/v1/<token>` reference returned by
 * `POST /v2/media-images/complete`; Markdown embeds it as
 * `![说明 #宽px #高px](url)`. The platform `preview_url` is short-lived, so only
 * a small locally generated `thumbnail` is persisted.
 */
export interface MediaAsset {
  imageId: string
  url: string
  fileName: string
  contentType: string
  size: number
  width?: number | null
  height?: number | null
  thumbnail?: string | null
  /** AppID owning the image; `qqbot-media` references only work for it. */
  appId?: string | null
  /** Unix seconds. */
  createdAt: number
  /** Unix seconds; the platform refreshes it on every successful send. */
  expiresAt: number
  source: 'upload' | 'sync' | string
}

export interface MediaUploadInput {
  fileName: string
  contentType: string
  /** Base64 of the original image bytes. */
  dataBase64: string
}

export interface QueryParam {
  key: string
  value: string
  enabled: boolean
}

export interface SavedEndpoint {
  id: string
  name: string
  method: string
  path: string
  query: QueryParam[]
  body: string
  createdAt: string
  lastUsedAt?: string | null
  useCount: number
}

export interface Settings {
  /** Persist a hand-built request automatically after a successful call. */
  autoSaveOnSuccess: boolean
  /** Maximum number of events kept in memory by the backend and the UI. */
  eventLimit: number
}

export interface StoredConfig {
  credentials?: Credentials | null
  settings: Settings
  savedEndpoints: SavedEndpoint[]
}

export interface ApiRequest {
  method: string
  path: string
  query: QueryParam[]
  body: string
}

export interface ApiResponse {
  ok: boolean
  status: number
  statusText?: string | null
  headers: Record<string, string>
  body: unknown
  raw: string
  elapsedMs: number
  url: string
  method: string
  requestBody?: string | null
  authApplied: boolean
}

export interface Bootstrap {
  config: StoredConfig
  status: ConnectionStatus
  events: GatewayEvent[]
  cache: CacheSnapshot
  mediaAssets: MediaAsset[]
  version: string
}

export interface Backend {
  readonly mode: 'tauri' | 'mock'
  bootstrap(): Promise<Bootstrap>
  login(credentials: Credentials): Promise<ConnectionStatus>
  logout(options?: { clearCredentials?: boolean }): Promise<void>
  saveCredentials(credentials: Credentials): Promise<StoredConfig>
  updateSettings(settings: Settings): Promise<StoredConfig>
  getStatus(): Promise<ConnectionStatus>
  sendRequest(request: ApiRequest): Promise<ApiResponse>
  saveEndpoint(endpoint: SavedEndpoint): Promise<SavedEndpoint[]>
  deleteEndpoint(id: string): Promise<SavedEndpoint[]>
  getCache(): Promise<CacheSnapshot>
  listMediaAssets(): Promise<MediaAsset[]>
  saveMediaAssets(assets: MediaAsset[]): Promise<MediaAsset[]>
  removeMediaAsset(imageId: string): Promise<MediaAsset[]>
  clearMediaAssets(): Promise<MediaAsset[]>
  uploadMediaImage(input: MediaUploadInput): Promise<MediaAsset>
  clearEvents(): Promise<void>
  clearCache(kind?: 'groups' | 'users'): Promise<CacheSnapshot>
  renameCacheEntry(kind: 'group' | 'user', openid: string, name: string): Promise<CacheSnapshot>
  refreshGroup(groupOpenid: string): Promise<GroupEntry | null>
  refreshUser(openid: string): Promise<UserEntry | null>
  onEvent(handler: (event: GatewayEvent) => void): () => void
  onStatus(handler: (status: ConnectionStatus) => void): () => void
  onCache(handler: (snapshot: CacheSnapshot) => void): () => void
  injectDemoEvent?(): void
}
