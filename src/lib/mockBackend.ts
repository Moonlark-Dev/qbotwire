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
  SavedEndpoint,
  Settings,
  StoredConfig,
  UserEntry,
} from '@/types'

const CONFIG_KEY = 'qbotwire.mock.config.v1'
const CACHE_KEY = 'qbotwire.mock.cache.v1'
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
      source: 'GROUP_AT_MESSAGE_CREATE',
      firstSeen: at,
      lastSeen: at,
      messageCount: 2,
    },
    {
      openid: 'u_demo_3141',
      name: 'SunaōkamiNya',
      avatar: demoAvatar('u_demo_3141', 'S'),
      unionOpenid: null,
      source: 'C2C_MESSAGE_CREATE',
      firstSeen: at,
      lastSeen: at,
      messageCount: 1,
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
      source: 'GROUP_AT_MESSAGE_CREATE',
      firstSeen: nowIso(),
      lastSeen: nowIso(),
      messageCount: 0,
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
        author: {
          id: user,
          member_openid: user,
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
        author: { id: user, user_openid: user, union_openid: null },
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
        version: '1.0.0-preview',
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
      persist()
      emitCache()
      return group
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
