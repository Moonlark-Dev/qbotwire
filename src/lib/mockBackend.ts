/**
 * Browser preview backend.
 *
 * The real application talks to the Rust core through Tauri `invoke`. For UI
 * previews served from Vite (and for `pnpm preview` on the LAN) that bridge is
 * not available, so this module provides an in-memory, clearly-labelled demo
 * implementation backed by localStorage. It never contacts QQ.
 */
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
  MediaAsset,
  MediaUploadInput,
  SavedEndpoint,
  Settings,
  StoredConfig,
  UserEntry,
} from '@/types'

const CONFIG_KEY = 'qbotwire.mock.config.v1'
const CACHE_KEY = 'qbotwire.mock.cache.v1'
const MEDIA_KEY = 'qbotwire.mock.media.v1'
const EVENT_LIMIT = 200

const DEMO_BOT = {
  id: '102030405',
  username: 'QBotWire Demo',
  avatar: null as string | null,
}

const nowIso = () => new Date().toISOString()

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage can be unavailable in private windows */
  }
}

function hashString(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash)
}

const PALETTE = ['#4f7cff', '#17a673', '#e08b2d', '#ba5cff', '#e35d6a', '#0f9bb5']

/** Small deterministic SVG avatar so the preview works fully offline. */
export function demoAvatar(seed: string, label: string): string {
  const color = PALETTE[hashString(seed) % PALETTE.length]
  const text = label.trim().slice(0, 1) || '?'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="24" fill="${color}"/><text x="48" y="61" font-family="system-ui,sans-serif" font-size="42" font-weight="600" fill="#fff" text-anchor="middle">${text}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function defaultGroups(): GroupEntry[] {
  const at = nowIso()
  return [
    {
      openid: 'g_demo_1001',
      name: 'Moonlark 开发者群',
      avatar: demoAvatar('g_demo_1001', 'M'),
      memberCount: 128,
      unionGroupOpenid: 'union_group_demo_1001',
      source: 'GROUP_AT_MESSAGE_CREATE',
      firstSeen: at,
      lastSeen: at,
      messageCount: 3,
      infoFetchedAt: at,
    },
    {
      openid: 'g_demo_1002',
      name: 'QBotWire 测试群',
      avatar: demoAvatar('g_demo_1002', 'Q'),
      memberCount: 12,
      unionGroupOpenid: null,
      source: 'GROUP_AT_MESSAGE_CREATE',
      firstSeen: at,
      lastSeen: at,
      messageCount: 1,
      infoFetchedAt: null,
    },
  ]
}

function defaultUsers(): UserEntry[] {
  const at = nowIso()
  return [
    {
      openid: 'u_demo_9527',
      name: '小灯',
      avatar: demoAvatar('u_demo_9527', '灯'),
      unionOpenid: 'union_demo_9527',
      allowProactiveMsg: true,
      source: 'GROUP_AT_MESSAGE_CREATE',
      firstSeen: at,
      lastSeen: at,
      messageCount: 2,
      infoFetchedAt: at,
    },
    {
      openid: 'u_demo_3141',
      name: 'SunaōkamiNya',
      avatar: demoAvatar('u_demo_3141', 'S'),
      unionOpenid: null,
      allowProactiveMsg: false,
      source: 'C2C_MESSAGE_CREATE',
      firstSeen: at,
      lastSeen: at,
      messageCount: 1,
      infoFetchedAt: null,
    },
  ]
}

function defaultConfig(): StoredConfig {
  return {
    credentials: null,
    settings: { autoSaveOnSuccess: false, eventLimit: 500 },
    savedEndpoints: [],
  }
}

function defaultCache(): CacheSnapshot {
  return { groups: defaultGroups(), users: defaultUsers() }
}

function demoMediaThumb(seed: string, label: string): string {
  const color = PALETTE[hashString(seed) % PALETTE.length]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".95"/><stop offset="1" stop-color="#0f172a" stop-opacity=".85"/></linearGradient></defs><rect width="320" height="200" fill="url(#g)"/><text x="160" y="112" font-family="system-ui,sans-serif" font-size="34" font-weight="600" fill="#fff" text-anchor="middle">${label}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function defaultMedia(): MediaAsset[] {
  const now = Math.floor(Date.now() / 1000)
  return [
    {
      imageId: '102030405_demoKline01',
      url: 'qqbot-media://image/v1/demoKlineTokenA1b2C3d4',
      fileName: 'kline.png',
      contentType: 'image/png',
      size: 40156,
      width: 800,
      height: 400,
      thumbnail: demoMediaThumb('kline-demo', 'K线'),
      appId: '102030405',
      createdAt: now - 3 * 86_400,
      expiresAt: now + 87 * 86_400,
      source: 'upload',
    },
    {
      imageId: '102030405_demoCover02',
      url: 'qqbot-media://image/v1/demoCoverTokenE5f6G7h8',
      fileName: 'cover.webp',
      contentType: 'image/webp',
      size: 183_000,
      width: 1200,
      height: 630,
      thumbnail: demoMediaThumb('cover-demo', '封面图'),
      appId: '102030405',
      createdAt: now - 20 * 86_400,
      expiresAt: now + 70 * 86_400,
      source: 'sync',
    },
  ]
}

const SAMPLE_MESSAGES = [
  '今天的构建脚本跑通了吗？',
  '这个事件格式化得不错，双击看看原始 JSON。',
  '帮我试一下发送群消息，msg_id 用刚才事件的。',
  '缓存里的头像终于显示出来了。',
  'QBotWire 的标签页切换挺顺手。',
  '晚点用沙箱跑一轮完整的回归。',
]

const SAMPLE_USERS = ['u_demo_9527', 'u_demo_3141']
const SAMPLE_GROUPS = ['g_demo_1001', 'g_demo_1002']

export function createMockBackend(): Backend {
  let config = readJson<StoredConfig>(CONFIG_KEY, defaultConfig())
  let cache = readJson<CacheSnapshot>(CACHE_KEY, defaultCache())
  let media = readJson<MediaAsset[]>(MEDIA_KEY, defaultMedia())
  let status: ConnectionStatus = { state: 'disconnected' }
  let timer: ReturnType<typeof setInterval> | undefined
  let eventSeq = 0
  let eventId = 0
  const eventBuffer: GatewayEvent[] = []
  const eventHandlers = new Set<(event: GatewayEvent) => void>()
  const statusHandlers = new Set<(status: ConnectionStatus) => void>()
  const cacheHandlers = new Set<(snapshot: CacheSnapshot) => void>()

  const persist = () => {
    writeJson(CONFIG_KEY, config)
    writeJson(CACHE_KEY, cache)
    writeJson(MEDIA_KEY, media)
  }

  const emitStatus = (next: ConnectionStatus) => {
    status = next
    statusHandlers.forEach((handler) => handler(next))
  }

  const emitCache = () => {
    const snapshot = { groups: [...cache.groups], users: [...cache.users] }
    cacheHandlers.forEach((handler) => handler(snapshot))
  }

  const pushEvent = (type: string, data: Record<string, unknown>) => {
    eventId += 1
    eventSeq += 1
    const event: GatewayEvent = {
      id: `mock-${Date.now()}-${eventId}`,
      seq: eventSeq,
      type,
      receivedAt: nowIso(),
      data,
    }
    eventBuffer.unshift(event)
    if (eventBuffer.length > EVENT_LIMIT) eventBuffer.splice(EVENT_LIMIT)
    eventHandlers.forEach((handler) => handler(event))
  }

  const ensureDemoGroup = (openid: string, name: string) => {
    if (cache.groups.some((group) => group.openid === openid)) return
    cache.groups.unshift({
      openid,
      name,
      avatar: demoAvatar(openid, name),
      memberCount: null,
      unionGroupOpenid: null,
      source: 'GROUP_AT_MESSAGE_CREATE',
      firstSeen: nowIso(),
      lastSeen: nowIso(),
      messageCount: 0,
      infoFetchedAt: null,
    })
  }

  const ensureDemoUser = (openid: string, name: string) => {
    if (cache.users.some((user) => user.openid === openid)) return
    cache.users.unshift({
      openid,
      name,
      avatar: demoAvatar(openid, name),
      unionOpenid: null,
      allowProactiveMsg: null,
      source: 'GROUP_AT_MESSAGE_CREATE',
      firstSeen: nowIso(),
      lastSeen: nowIso(),
      messageCount: 0,
      infoFetchedAt: null,
    })
  }

  const bumpCounter = (openid: string, name: string) => {
    const group = cache.groups.find((item) => item.openid === openid)
    if (group) {
      group.lastSeen = nowIso()
      group.messageCount += 1
      if (!group.name) group.name = name
    }
  }

  const sampleEvent = (kind: 'group' | 'c2c' | 'guild') => {
    const at = nowIso()
    if (kind === 'group') {
      const group = SAMPLE_GROUPS[Math.floor(Math.random() * SAMPLE_GROUPS.length)]
      const user = SAMPLE_USERS[Math.floor(Math.random() * SAMPLE_USERS.length)]
      const content = SAMPLE_MESSAGES[Math.floor(Math.random() * SAMPLE_MESSAGES.length)]
      const groupName = group === 'g_demo_1001' ? 'Moonlark 开发者群' : 'QBotWire 测试群'
      ensureDemoGroup(group, groupName)
      ensureDemoUser(user, user === 'u_demo_9527' ? '小灯' : 'SunaōkamiNya')
      bumpCounter(group, groupName)
      pushEvent('GROUP_AT_MESSAGE_CREATE', {
        id: `mock_msg_${Date.now()}`,
        content: `<@!1234567890> ${content}`,
        group_openid: group,
        union_group_openid: group === 'g_demo_1001' ? 'union_group_demo_1001' : null,
        author: {
          id: user,
          member_openid: user,
          member_nickname: user === 'u_demo_9527' ? '小灯（群昵称）' : 'SunaōkamiNya',
          member_role: 'member',
          username: user === 'u_demo_9527' ? '小灯' : 'SunaōkamiNya',
          avatar: demoAvatar(user, user === 'u_demo_9527' ? '灯' : 'S'),
          union_openid: user === 'u_demo_9527' ? 'union_demo_9527' : null,
        },
        timestamp: at,
        msg_seq: eventSeq,
        attachments: [],
        mentions: [],
      })
      emitCache()
      return
    }
    if (kind === 'c2c') {
      const user = SAMPLE_USERS[Math.floor(Math.random() * SAMPLE_USERS.length)]
      const content = SAMPLE_MESSAGES[Math.floor(Math.random() * SAMPLE_MESSAGES.length)]
      ensureDemoUser(user, user === 'u_demo_9527' ? '小灯' : 'SunaōkamiNya')
      pushEvent('C2C_MESSAGE_CREATE', {
        id: `mock_msg_${Date.now()}`,
        content,
        author: {
          id: user,
          user_openid: user,
          username: user === 'u_demo_9527' ? '小灯' : 'SunaōkamiNya',
          avatar: demoAvatar(user, user === 'u_demo_9527' ? '灯' : 'S'),
          union_openid: null,
        },
        timestamp: at,
        attachments: [],
      })
      emitCache()
      return
    }
    pushEvent('AT_MESSAGE_CREATE', {
      id: `mock_msg_${Date.now()}`,
      content: SAMPLE_MESSAGES[Math.floor(Math.random() * SAMPLE_MESSAGES.length)],
      guild_id: 'guild_demo_01',
      channel_id: 'channel_demo_01',
      author: {
        id: 'user_demo_01',
        username: '频道里的旅人',
        avatar: demoAvatar('user_demo_01', '频'),
      },
      timestamp: at,
    })
  }

  const startDemoStream = () => {
    if (timer) return
    timer = setInterval(() => {
      const kinds: Array<'group' | 'c2c' | 'guild'> = ['group', 'group', 'c2c', 'guild']
      sampleEvent(kinds[Math.floor(Math.random() * kinds.length)])
    }, 6500)
  }

  const stopDemoStream = () => {
    if (timer) clearInterval(timer)
    timer = undefined
  }

  const connectedStatus = (): ConnectionStatus => ({
    state: 'connected',
    bot: DEMO_BOT,
    sessionId: 'mock-session',
    lastSeq: eventSeq,
    gatewayUrl: 'wss://api.sgroup.qq.com/websocket (demo)',
    intents: 33554432,
    heartbeatIntervalMs: 41250,
    latencyMs: 32,
    connectedAt: nowIso(),
  })

  const buildUrl = (request: ApiRequest) => {
    const params = new URLSearchParams()
    for (const row of request.query) {
      if (row.enabled && row.key.trim()) params.append(row.key, row.value)
    }
    const qs = params.toString()
    return `https://api.sgroup.qq.com${request.path}${qs ? `?${qs}` : ''}`
  }

  const mockSend = async (request: ApiRequest): Promise<ApiResponse> => {
    await new Promise((resolve) => setTimeout(resolve, 320))
    let requestBody: string | null = null
    if (request.body.trim()) {
      try {
        JSON.parse(request.body)
        requestBody = request.body
      } catch (error) {
        throw new Error(`请求体不是合法 JSON：${(error as Error).message}`)
      }
    }
    const statusCode = /invalid|404/.test(request.path) ? 404 : 200
    let body: unknown
    if (request.path.includes('/gateway')) {
      body = { url: 'wss://api.sgroup.qq.com/websocket' }
    } else if (request.path.endsWith('/users/@me')) {
      body = DEMO_BOT
    } else if (request.path === '/v2/media-images' && request.method === 'GET') {
      body = {
        images: media.map((asset) => ({
          image_id: asset.imageId,
          url: asset.url,
          file_name: asset.fileName,
          preview_url: asset.thumbnail ?? null,
          created_at: asset.createdAt,
          expires_at: asset.expiresAt,
        })),
        next_cursor: '',
        total: media.length,
      }
    } else if (/^\/v2\/media-images\/[^/]+\/delete$/.test(request.path) && request.method === 'DELETE') {
      const imageId = request.path.split('/')[3]
      media = media.filter((asset) => asset.imageId !== decodeURIComponent(imageId))
      persist()
      body = {}
    } else if (request.path.includes('/v2/groups/') && request.path.endsWith('/info')) {
      const openid = request.path.split('/')[3]
      const group = cache.groups.find((item) => item.openid === openid)
      body = {
        group_openid: openid,
        group_name: group?.name ?? '演示群聊',
        group_member_num: group?.memberCount ?? 0,
      }
    } else if (statusCode === 404) {
      body = { code: 404, message: '演示模式：没有这个接口', path: request.path }
    } else if (request.path.endsWith('/messages') && request.method === 'POST') {
      body = { id: `mock_msg_${Date.now()}`, timestamp: nowIso() }
    } else if (request.path.endsWith('/messages') || request.path.includes('/messages/')) {
      body = { id: `mock_msg_${Date.now()}`, timestamp: nowIso() }
    } else {
      body = { mock: true, method: request.method, path: request.path }
    }
    const raw = JSON.stringify(body, null, 2)
    return {
      ok: statusCode < 400,
      status: statusCode,
      statusText: statusCode === 200 ? 'OK' : 'Not Found',
      headers: {
        'content-type': 'application/json',
        'x-qbotwire-mock': 'true',
      },
      body,
      raw,
      elapsedMs: 320,
      url: buildUrl(request),
      method: request.method,
      requestBody,
      authApplied: request.path !== '/app/getAppAccessToken',
    }
  }

  const login = async (credentials: Credentials): Promise<ConnectionStatus> => {
    config = { ...config, credentials }
    persist()
    emitStatus({ state: 'connecting' })
    await new Promise((resolve) => setTimeout(resolve, 750))
    emitStatus(connectedStatus())
    startDemoStream()
    sampleEvent('group')
    sampleEvent('c2c')
    sampleEvent('guild')
    return status
  }

  const snapshot = (): CacheSnapshot => ({
    groups: [...cache.groups],
    users: [...cache.users],
  })

  const backend: Backend = {
    mode: 'mock',
    async bootstrap(): Promise<Bootstrap> {
      if (config.credentials) {
        emitStatus(connectedStatus())
        startDemoStream()
        if (!eventBuffer.length) {
          sampleEvent('group')
          sampleEvent('c2c')
          sampleEvent('guild')
        }
      }
      return {
        config,
        status,
        events: [...eventBuffer],
        cache: snapshot(),
        mediaAssets: [...media],
        version: '1.2.0-preview',
      }
    },
    login,
    async logout(options) {
      stopDemoStream()
      const clear = options?.clearCredentials ?? false
      if (clear) config = { ...config, credentials: null }
      persist()
      emitStatus({ state: 'disconnected' })
    },
    async saveCredentials(credentials) {
      config = { ...config, credentials }
      persist()
      return config
    },
    async updateSettings(settings: Settings) {
      config = { ...config, settings }
      persist()
      return config
    },
    async getStatus() {
      return status
    },
    sendRequest: mockSend,
    async saveEndpoint(endpoint: SavedEndpoint) {
      const index = config.savedEndpoints.findIndex((item) => item.id === endpoint.id)
      const saved = { ...endpoint, lastUsedAt: nowIso() }
      if (index >= 0) config.savedEndpoints[index] = saved
      else config.savedEndpoints.unshift(saved)
      persist()
      return [...config.savedEndpoints]
    },
    async deleteEndpoint(id: string) {
      config.savedEndpoints = config.savedEndpoints.filter((item) => item.id !== id)
      persist()
      return [...config.savedEndpoints]
    },
    async getCache() {
      return snapshot()
    },
    async listMediaAssets() {
      return [...media]
    },
    async saveMediaAssets(assets) {
      for (const asset of assets) {
        const index = media.findIndex((item) => item.imageId === asset.imageId)
        if (index >= 0) media[index] = { ...asset }
        else media.unshift({ ...asset })
      }
      persist()
      return [...media]
    },
    async removeMediaAsset(imageId) {
      media = media.filter((asset) => asset.imageId !== imageId)
      persist()
      return [...media]
    },
    async clearMediaAssets() {
      media = []
      persist()
      return []
    },
    async uploadMediaImage(input: MediaUploadInput) {
      await new Promise((resolve) => setTimeout(resolve, 520))
      const seed = `${input.fileName}:${Date.now()}`
      const token = hashString(seed).toString(36) + hashString(input.dataBase64.slice(0, 64)).toString(36)
      const now = Math.floor(Date.now() / 1000)
      const asset: MediaAsset = {
        imageId: `102030405_${hashString(seed).toString(16)}`,
        url: `qqbot-media://image/v1/${token}`,
        fileName: input.fileName.split(/[\\/]/).pop() || input.fileName,
        contentType: input.contentType,
        size: Math.floor((input.dataBase64.length * 3) / 4),
        width: null,
        height: null,
        thumbnail: demoMediaThumb(seed, input.fileName.split('.').pop()?.toUpperCase() ?? 'IMG'),
        appId: config.credentials?.appId ?? DEMO_BOT.id,
        createdAt: now,
        expiresAt: now + 90 * 86_400,
        source: 'upload',
      }
      media.unshift(asset)
      persist()
      return asset
    },
    async clearEvents() {
      eventSeq = 0
      eventBuffer.splice(0)
    },
    async clearCache(kind) {
      if (!kind || kind === 'groups') cache.groups = []
      if (!kind || kind === 'users') cache.users = []
      persist()
      emitCache()
      return snapshot()
    },
    async renameCacheEntry(kind, openid, name) {
      if (kind === 'group') {
        const group = cache.groups.find((item) => item.openid === openid)
        if (group) group.name = name
      } else {
        const user = cache.users.find((item) => item.openid === openid)
        if (user) user.name = name
      }
      persist()
      emitCache()
      return snapshot()
    },
    async refreshGroup(groupOpenid: string) {
      const group = cache.groups.find((item) => item.openid === groupOpenid)
      if (!group) return null
      group.infoFetchedAt = nowIso()
      group.lastSeen = nowIso()
      group.unionGroupOpenid = group.unionGroupOpenid ?? `union_${groupOpenid}`
      persist()
      emitCache()
      return group
    },
    async refreshUser(openid: string) {
      const user = cache.users.find((item) => item.openid === openid)
      if (!user) return null
      user.infoFetchedAt = nowIso()
      user.allowProactiveMsg = user.allowProactiveMsg ?? true
      user.unionOpenid = user.unionOpenid ?? `union_${openid}`
      persist()
      emitCache()
      return user
    },
    onEvent(handler) {
      eventHandlers.add(handler)
      return () => eventHandlers.delete(handler)
    },
    onStatus(handler) {
      statusHandlers.add(handler)
      return () => statusHandlers.delete(handler)
    },
    onCache(handler) {
      cacheHandlers.add(handler)
      return () => cacheHandlers.delete(handler)
    },
    injectDemoEvent() {
      sampleEvent('group')
    },
  }

  return backend
}
