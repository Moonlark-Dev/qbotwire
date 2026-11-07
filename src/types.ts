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

export type PageKey = 'send' | 'receive' | 'cache'

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
  source?: string | null
  firstSeen: string
  lastSeen: string
  messageCount: number
}

export interface CacheSnapshot {
  groups: GroupEntry[]
  users: UserEntry[]
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
  clearEvents(): Promise<void>
  clearCache(kind?: 'groups' | 'users'): Promise<CacheSnapshot>
  renameCacheEntry(kind: 'group' | 'user', openid: string, name: string): Promise<CacheSnapshot>
  refreshGroup(groupOpenid: string): Promise<GroupEntry | null>
  onEvent(handler: (event: GatewayEvent) => void): () => void
  onStatus(handler: (status: ConnectionStatus) => void): () => void
  onCache(handler: (snapshot: CacheSnapshot) => void): () => void
  injectDemoEvent?(): void
}
